// V5
(function () {
    // Debug flag - will help us see if the error handler is working
    console.log("Error handler initializing...");
    
    const originalConsoleError = console.error;
    let errorSocket;
    let errorQueue = [];
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_INTERVAL = 3000;
    
    // Make sure we have a working socket immediately
    initializeSocket();
    
    function initializeSocket() {
        try {
            // Try to use existing socket if available (game might already have one)
            errorSocket = window.socket || io(location.origin);
            console.log("Error handler using socket:", errorSocket.connected ? "connected" : "disconnected");
            
            // Set up socket event handlers
            if (errorSocket) {
                // Handle disconnection
                errorSocket.on('disconnect', function() {
                    console.log("Error socket disconnected, will attempt reconnect");
                    setTimeout(attemptReconnect, RECONNECT_INTERVAL);
                });
                
                // Handle successful connection
                errorSocket.on('connect', function() {
                    console.log("Error socket connected - sending queued errors");
                    processErrorQueue();
                });
            }
        } catch (e) {
            console.log('Error initializing error socket:', e);
            errorSocket = {
                connected: false,
                queue: [],
                emit: function(event, data) {
                    console.log("Queued error (socket not ready):", data);
                    this.queue.push({event, data});
                    // Also add to our global queue for reconnection attempts
                    errorQueue.push({event, data});
                },
                on: function() {}
            };
            
            // Schedule a reconnection attempt
            setTimeout(attemptReconnect, RECONNECT_INTERVAL);
        }
    }
    
    function attemptReconnect() {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.log("Max reconnection attempts reached. Some errors might not be reported.");
            return;
        }
        
        reconnectAttempts++;
        console.log(`Attempting to reconnect error socket (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        
        try {
            errorSocket = io(location.origin);
            
            errorSocket.on('connect', function() {
                console.log("Error socket reconnected successfully");
                reconnectAttempts = 0;
                processErrorQueue();
            });
            
            errorSocket.on('disconnect', function() {
                console.log("Error socket disconnected again");
                setTimeout(attemptReconnect, RECONNECT_INTERVAL);
            });
        } catch (e) {
            console.log("Reconnection attempt failed:", e);
            setTimeout(attemptReconnect, RECONNECT_INTERVAL);
        }
    }
    
    function processErrorQueue() {
        if (errorQueue.length > 0 && errorSocket && errorSocket.connected) {
            console.log(`Processing ${errorQueue.length} queued errors`);
            errorQueue.forEach(item => {
                try {
                    errorSocket.emit(item.event, item.data);
                } catch (e) {
                    console.log("Failed to emit queued error:", e);
                }
            });
            errorQueue = [];
        }
    }
    
    // Function to extract and clean stack trace
    function getStackTrace(error) {
        if (!error || !error.stack) return '';
        return error.stack;
    }

    // Function to send error to server - with multiple fallbacks
    function sendError(errorInfo) {
        console.log("Attempting to send error:", errorInfo.message);
        
        // Add to global queue for persistence
        errorQueue.push({event: 'error', data: errorInfo});
        
        // Method 1: Use socket if connected
        try {
            if (errorSocket && errorSocket.connected) {
                errorSocket.emit('error', errorInfo);
                console.log("Emitted error via connected socket");
                return true;
            }
        } catch (e) {
            console.log("Socket emit failed:", e);
        }
        
        // Method 2: Try reconnecting socket
        try {
            // Try to get socket again - it might be available now
            const socket = window.socket || io(location.origin);
            if (socket && socket.connected) {
                socket.emit('error', errorInfo);
                console.log("Emitted error via reconnected socket");
                return true;
            } else {
                console.log("Socket still not connected, trying one-time connection");
                
                // If socket exists but not connected, try the connect event
                socket.on('connect', () => {
                    socket.emit('error', errorInfo);
                    console.log("Emitted error on socket connect");
                });
            }
        } catch (e) {
            console.log("Socket reconnection failed:", e);
        }
        
        // Method 3: Use fetch API as fallback
        try {
            fetch('/api/error', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(errorInfo)
            }).then(response => {
                if (response.ok) {
                    console.log("Error sent via fetch API");
                }
            }).catch(e => {
                console.log("Fetch API error send failed:", e);
            });
        } catch (e) {
            console.log("Fetch error reporting failed:", e);
        }
        
        return false;
    }

    // Function to show error toast
    function showErrorToast(message) {
        try {
            const body = document.body;
            if (!body) return;
            
            const errorToast = document.createElement('div');
            errorToast.style.position = 'fixed';
            errorToast.style.top = '20px';
            errorToast.style.left = '50%';
            errorToast.style.transform = 'translateX(-50%)';
            errorToast.style.background = 'rgba(255, 0, 0, 0.8)';
            errorToast.style.color = 'white';
            errorToast.style.padding = '10px 20px';
            errorToast.style.borderRadius = '5px';
            errorToast.style.zIndex = '9999';
            errorToast.style.maxWidth = '90%';
            errorToast.style.wordBreak = 'break-word';
            errorToast.textContent = message || 'Error Detected! Check console.';
            body.appendChild(errorToast);

            setTimeout(() => {
                if (body.contains(errorToast)) {
                    body.removeChild(errorToast);
                }
            }, 5000);
        } catch (e) {
            console.log("Error showing toast:", e);
        }
    }

    // Override console.error - but don't override if it was already custom
    if (console.error === originalConsoleError) {
        console.error = function () {
            // Call the original console.error first
            originalConsoleError.apply(console, arguments);

            try {
                const errorText = Array.from(arguments).join(' ');
                let stack = '';
                
                // Check if the first argument is an Error object
                if (arguments[0] instanceof Error) {
                    stack = getStackTrace(arguments[0]);
                }
                
                const errorInfo = {
                    type: 'console_error',
                    message: errorText,
                    stack: stack,
                    timestamp: Date.now(),
                    url: window.location.href,
                    gameId: new URLSearchParams(window.location.search).get('gameId'),
                    roomId: new URLSearchParams(window.location.search).get('roomId'),
                    userId: new URLSearchParams(window.location.search).get('userId')
                };

                sendError(errorInfo);
                showErrorToast('Error Detected: ' + errorText.substring(0, 50) + (errorText.length > 50 ? '...' : ''));
            } catch (e) {
                originalConsoleError('Error in error handler:', e);
            }
        };
    } else {
        console.log("console.error was already overridden, not replacing");
    }

    // Enhanced function patching system
    const functionsToMonitor = ['renderGame', 'drawFruit', 'updateGame', 'handleInput', 'moveSnake', 'checkCollision'];

    function patchGameFunctions() {
        try {
            let patchedAny = false;
            
            // Patch all game functions in our list
            functionsToMonitor.forEach(funcName => {
                if (typeof window[funcName] === 'function' && !window[funcName].__patched) {
                    const originalFunc = window[funcName];
                    window[funcName] = function() {
                        try {
                            return originalFunc.apply(this, arguments);
                        } catch (error) {
                            const errorInfo = {
                                type: 'game_function_error',
                                message: error.message,
                                stack: getStackTrace(error),
                                timestamp: Date.now(),
                                url: window.location.href,
                                function: funcName,
                                gameId: new URLSearchParams(window.location.search).get('gameId'),
                                roomId: new URLSearchParams(window.location.search).get('roomId'),
                                userId: new URLSearchParams(window.location.search).get('userId')
                            };
                            sendError(errorInfo);
                            showErrorToast('Game Error: ' + error.message);
                            throw error; // rethrow
                        }
                    };
                    window[funcName].__patched = true;
                    patchedAny = true;
                    console.log(`Successfully patched ${funcName} function`);
                }
            });
            
            // Dynamic function detection - monitor the global scope for new functions
            const currentFunctions = Object.keys(window).filter(key => typeof window[key] === 'function');
            
            // Look for game-related function names we might have missed
            const gameKeywords = ['game', 'render', 'draw', 'update', 'player', 'move', 'collision', 'input', 'score'];
            
            currentFunctions.forEach(funcName => {
                if (!window[funcName].__patched && 
                    gameKeywords.some(keyword => funcName.toLowerCase().includes(keyword))) {
                    
                    console.log(`Found potential game function: ${funcName}`);
                    const originalFunc = window[funcName];
                    
                    window[funcName] = function() {
                        try {
                            return originalFunc.apply(this, arguments);
                        } catch (error) {
                            const errorInfo = {
                                type: 'game_function_error',
                                message: error.message,
                                stack: getStackTrace(error),
                                timestamp: Date.now(),
                                url: window.location.href,
                                function: funcName,
                                gameId: new URLSearchParams(window.location.search).get('gameId'),
                                roomId: new URLSearchParams(window.location.search).get('roomId'),
                                userId: new URLSearchParams(window.location.search).get('userId')
                            };
                            sendError(errorInfo);
                            showErrorToast('Game Error: ' + error.message);
                            throw error; // rethrow
                        }
                    };
                    window[funcName].__patched = true;
                    patchedAny = true;
                    console.log(`Dynamically patched ${funcName} function`);
                }
            });
            
            // Keep checking for functions
            setTimeout(patchGameFunctions, patchedAny ? 2000 : 1000);
        } catch (e) {
            console.log("Error patching game functions:", e);
            setTimeout(patchGameFunctions, 2000); // Try again later
        }
    }

    // Capture global errors
    window.addEventListener('error', function (event) {
        try {
            if (!(event instanceof ErrorEvent)) return;
            
            const errorObj = event.error || {};
            const stack = getStackTrace(errorObj);
            
            const errorInfo = {
                type: 'uncaught_error',
                message: event.message,
                stack: stack,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                timestamp: Date.now(),
                url: window.location.href,
                gameId: new URLSearchParams(window.location.search).get('gameId'),
                roomId: new URLSearchParams(window.location.search).get('roomId'),
                userId: new URLSearchParams(window.location.search).get('userId')
            };

            sendError(errorInfo);
            showErrorToast(`Error: ${event.message}`);
        } catch (e) {
            originalConsoleError('Error in error event handler:', e);
        }
    }, true);
    
    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', function (event) {
        try {
            let message = 'Unknown Promise Error';
            let stack = '';
            
            if (event.reason) {
                if (typeof event.reason === 'string') {
                    message = event.reason;
                } else if (event.reason.message) {
                    message = event.reason.message;
                    stack = getStackTrace(event.reason);
                }
            }
            
            const errorInfo = {
                type: 'unhandled_promise_rejection',
                message: message,
                stack: stack,
                timestamp: Date.now(),
                url: window.location.href,
                gameId: new URLSearchParams(window.location.search).get('gameId'),
                roomId: new URLSearchParams(window.location.search).get('roomId'),
                userId: new URLSearchParams(window.location.search).get('userId')
            };

            sendError(errorInfo);
            showErrorToast(`Promise Error: ${message}`);
        } catch (e) {
            originalConsoleError('Error in promise rejection handler:', e);
        }
    });
    
    // Patch any native functions that might throw errors
    function patchNativeFunctions() {
        try {
            // Patch JSON.parse to catch invalid JSON
            const originalJSONParse = JSON.parse;
            JSON.parse = function() {
                try {
                    return originalJSONParse.apply(JSON, arguments);
                } catch (error) {
                    const errorInfo = {
                        type: 'json_parse_error',
                        message: error.message,
                        stack: getStackTrace(error),
                        timestamp: Date.now(),
                        url: window.location.href,
                        function: 'JSON.parse',
                        data: arguments[0]?.substring(0, 100) + (arguments[0]?.length > 100 ? '...' : ''),
                        gameId: new URLSearchParams(window.location.search).get('gameId'),
                        roomId: new URLSearchParams(window.location.search).get('roomId'),
                        userId: new URLSearchParams(window.location.search).get('userId')
                    };
                    sendError(errorInfo);
                    showErrorToast('JSON Parse Error: ' + error.message);
                    throw error; // rethrow
                }
            };
            
            // Patch fetch to catch network errors
            const originalFetch = window.fetch;
            window.fetch = function() {
                return originalFetch.apply(window, arguments)
                    .catch(error => {
                        const errorInfo = {
                            type: 'fetch_error',
                            message: error.message,
                            stack: getStackTrace(error),
                            timestamp: Date.now(),
                            url: window.location.href,
                            function: 'fetch',
                            endpoint: arguments[0],
                            gameId: new URLSearchParams(window.location.search).get('gameId'),
                            roomId: new URLSearchParams(window.location.search).get('roomId'),
                            userId: new URLSearchParams(window.location.search).get('userId')
                        };
                        sendError(errorInfo);
                        showErrorToast('Network Error: ' + error.message);
                        throw error; // rethrow
                    });
            };
        } catch (e) {
            console.log("Error patching native functions:", e);
        }
    }
    
    // Start patching functions
    setTimeout(patchGameFunctions, 500);
    patchNativeFunctions();
    
    // Setup a heartbeat to ensure the error handler is still working
    setInterval(function() {
        if (!errorSocket.connected) {
            console.log("Error socket disconnected during heartbeat check");
            attemptReconnect();
        }
    }, 30000);
    
    console.log('Enhanced error detection initialized');
})();
