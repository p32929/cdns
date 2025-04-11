// V3
(function () {
    // Debug flag - will help us see if the error handler is working
    console.log("Error handler initializing...");
    
    const originalConsoleError = console.error;
    let errorSocket;
    
    // Make sure we have a working socket immediately
    try {
        // Try to use existing socket if available (game might already have one)
        errorSocket = window.socket || io(location.origin);
        console.log("Error handler using socket:", errorSocket.connected ? "connected" : "disconnected");
    } catch (e) {
        console.log('Error initializing error socket:', e);
        errorSocket = {
            connected: false,
            queue: [],
            emit: function(event, data) {
                console.log("Queued error (socket not ready):", data);
                this.queue.push({event, data});
            },
            on: function() {}
        };
    }
    
    // Force error emission - bypasses potential socket issues
    function forceEmitError(errorInfo) {
        try {
            // This creates a direct POST request to ensure errors are reported
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/error', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify(errorInfo));
            console.log("Force-emitted error via XHR:", errorInfo.message);
        } catch (e) {
            console.log("Failed to force-emit error:", e);
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
        
        // Method 3: Force emission with XHR
        forceEmitError(errorInfo);
        
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

    // Direct patching of the renderGame function if it exists
    function patchGameFunctions() {
        try {
            // Wait for the renderGame function to be defined
            if (typeof window.renderGame === 'function') {
                const originalRenderGame = window.renderGame;
                window.renderGame = function() {
                    try {
                        return originalRenderGame.apply(this, arguments);
                    } catch (error) {
                        const errorInfo = {
                            type: 'game_function_error',
                            message: error.message,
                            stack: getStackTrace(error),
                            timestamp: Date.now(),
                            url: window.location.href,
                            function: 'renderGame',
                            gameId: new URLSearchParams(window.location.search).get('gameId'),
                            roomId: new URLSearchParams(window.location.search).get('roomId'),
                            userId: new URLSearchParams(window.location.search).get('userId')
                        };
                        sendError(errorInfo);
                        showErrorToast('Game Error: ' + error.message);
                        throw error; // rethrow
                    }
                };
                console.log("Successfully patched renderGame function");
            } else {
                console.log("renderGame function not found, will try again");
                setTimeout(patchGameFunctions, 500); // Try again after 500ms
            }
            
            // Do the same for drawFruit which appears in the stack trace
            if (typeof window.drawFruit === 'function') {
                const originalDrawFruit = window.drawFruit;
                window.drawFruit = function() {
                    try {
                        return originalDrawFruit.apply(this, arguments);
                    } catch (error) {
                        const errorInfo = {
                            type: 'game_function_error',
                            message: error.message,
                            stack: getStackTrace(error),
                            timestamp: Date.now(),
                            url: window.location.href,
                            function: 'drawFruit',
                            gameId: new URLSearchParams(window.location.search).get('gameId'),
                            roomId: new URLSearchParams(window.location.search).get('roomId'),
                            userId: new URLSearchParams(window.location.search).get('userId')
                        };
                        sendError(errorInfo);
                        showErrorToast('Game Error: ' + error.message);
                        throw error; // rethrow
                    }
                };
                console.log("Successfully patched drawFruit function");
            }
        } catch (e) {
            console.log("Error patching game functions:", e);
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
    
    // Start trying to patch game functions after a short delay
    setTimeout(patchGameFunctions, 500);
    
    console.log('Enhanced error detection initialized');
})();
