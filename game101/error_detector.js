// V6
(function () {
    // Debug flag
    console.log("Enhanced Error Handler (No Toasts) initializing...");

    const originalConsoleError = console.error;
    let errorSocket;
    let errorQueue = [];
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_INTERVAL = 3000;

    // Initialize socket-based error reporting
    initializeSocket();
    function initializeSocket() {
        try {
            errorSocket = window.socket || io(location.origin);
            console.log("Error handler using socket:", errorSocket.connected ? "connected" : "disconnected");

            if (errorSocket) {
                errorSocket.on('disconnect', function() {
                    console.log("Error socket disconnected, will attempt reconnect");
                    setTimeout(attemptReconnect, RECONNECT_INTERVAL);
                });
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
                    errorQueue.push({event, data});
                },
                on: function() {}
            };
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
    // Helper: Extract stack trace
    function getStackTrace(error) {
        return error && error.stack ? error.stack : '';
    }
    // Reports error using socket and fallback mechanisms
    function sendError(errorInfo) {
        console.log("Attempting to send error:", errorInfo.message);
        errorQueue.push({event: 'error', data: errorInfo});
        try {
            if (errorSocket && errorSocket.connected) {
                errorSocket.emit('error', errorInfo);
                console.log("Emitted error via connected socket");
                return true;
            }
        } catch (e) {
            console.log("Socket emit failed:", e);
        }
        try {
            const socket = window.socket || io(location.origin);
            if (socket && socket.connected) {
                socket.emit('error', errorInfo);
                console.log("Emitted error via reconnected socket");
                return true;
            } else {
                console.log("Socket still not connected, trying one-time connection");
                socket.on('connect', () => {
                    socket.emit('error', errorInfo);
                    console.log("Emitted error on socket connect");
                });
            }
        } catch (e) {
            console.log("Socket reconnection failed:", e);
        }
        try {
            fetch('/api/error', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(errorInfo)
            }).then(response => {
                if (response.ok) console.log("Error sent via fetch API");
            }).catch(e => {
                console.log("Fetch API error send failed:", e);
            });
        } catch (e) {
            console.log("Fetch error reporting failed:", e);
        }
        return false;
    }

    // Override console.error to catch reported errors
    if (console.error === originalConsoleError) {
        console.error = function () {
            originalConsoleError.apply(console, arguments);
            try {
                const errorText = Array.from(arguments).join(' ');
                let stack = '';
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
            } catch (e) {
                originalConsoleError('Error in error handler:', e);
            }
        };
    } else {
        console.log("console.error was already overridden, not replacing");
    }

    // Global error handler using window.onerror
    window.onerror = function(message, source, lineno, colno, error) {
        try {
            const errorInfo = {
                type: 'global_error',
                message: message,
                stack: error ? getStackTrace(error) : '',
                filename: source,
                lineno: lineno,
                colno: colno,
                timestamp: Date.now(),
                url: window.location.href,
                gameId: new URLSearchParams(window.location.search).get('gameId'),
                roomId: new URLSearchParams(window.location.search).get('roomId'),
                userId: new URLSearchParams(window.location.search).get('userId')
            };
            sendError(errorInfo);
        } catch (e) {
            originalConsoleError('Error in window.onerror handler:', e);
        }
        // Return false to let the error propagate as usual
        return false;
    };

    // Global error listener (capture phase) to handle uncaught errors and resource errors
    window.addEventListener('error', function (event) {
        try {
            if (!(event instanceof ErrorEvent)) {
                // Resource loading errors (IMG, SCRIPT, LINK)
                const target = event.target || event.srcElement;
                if (target && (target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
                    const errorInfo = {
                        type: 'resource_error',
                        message: `Resource load error: ${target.tagName} failed to load`,
                        timestamp: Date.now(),
                        url: window.location.href,
                        gameId: new URLSearchParams(window.location.search).get('gameId'),
                        roomId: new URLSearchParams(window.location.search).get('roomId'),
                        userId: new URLSearchParams(window.location.search).get('userId')
                    };
                    sendError(errorInfo);
                }
                return;
            }
            const errorObj = event.error || {};
            const errorInfo = {
                type: 'uncaught_error',
                message: event.message,
                stack: getStackTrace(errorObj),
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
        } catch (e) {
            originalConsoleError('Error in promise rejection handler:', e);
        }
    });

    // Patch asynchronous functions: setTimeout, setInterval, requestAnimationFrame
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = function(callback, delay, ...args) {
        return originalSetTimeout(function() {
            try {
                callback.apply(this, args);
            } catch (error) {
                const errorInfo = {
                    type: 'timeout_error',
                    message: error.message,
                    stack: getStackTrace(error),
                    timestamp: Date.now(),
                    url: window.location.href,
                    function: 'setTimeout',
                    gameId: new URLSearchParams(window.location.search).get('gameId'),
                    roomId: new URLSearchParams(window.location.search).get('roomId'),
                    userId: new URLSearchParams(window.location.search).get('userId')
                };
                sendError(errorInfo);
                throw error;
            }
        }, delay);
    };

    const originalSetInterval = window.setInterval;
    window.setInterval = function(callback, delay, ...args) {
        return originalSetInterval(function() {
            try {
                callback.apply(this, args);
            } catch (error) {
                const errorInfo = {
                    type: 'interval_error',
                    message: error.message,
                    stack: getStackTrace(error),
                    timestamp: Date.now(),
                    url: window.location.href,
                    function: 'setInterval',
                    gameId: new URLSearchParams(window.location.search).get('gameId'),
                    roomId: new URLSearchParams(window.location.search).get('roomId'),
                    userId: new URLSearchParams(window.location.search).get('userId')
                };
                sendError(errorInfo);
                throw error;
            }
        }, delay);
    };

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = function(callback) {
        return originalRequestAnimationFrame(function(timestamp) {
            try {
                callback(timestamp);
            } catch (error) {
                const errorInfo = {
                    type: 'raf_error',
                    message: error.message,
                    stack: getStackTrace(error),
                    timestamp: Date.now(),
                    url: window.location.href,
                    function: 'requestAnimationFrame',
                    gameId: new URLSearchParams(window.location.search).get('gameId'),
                    roomId: new URLSearchParams(window.location.search).get('roomId'),
                    userId: new URLSearchParams(window.location.search).get('userId')
                };
                sendError(errorInfo);
                throw error;
            }
        });
    };

    // Patch game-specific functions (if they exist)
    const functionsToMonitor = ['renderGame', 'drawFruit', 'updateGame', 'handleInput', 'moveSnake', 'checkCollision'];
    function patchGameFunctions() {
        try {
            let patchedAny = false;
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
                            throw error;
                        }
                    };
                    window[funcName].__patched = true;
                    patchedAny = true;
                    console.log(`Successfully patched ${funcName} function`);
                }
            });

            // Dynamically patch any function with common game keywords if not already patched
            const currentFunctions = Object.keys(window).filter(key => typeof window[key] === 'function');
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
                            throw error;
                        }
                    };
                    window[funcName].__patched = true;
                    patchedAny = true;
                    console.log(`Dynamically patched ${funcName} function`);
                }
            });
            setTimeout(patchGameFunctions, patchedAny ? 2000 : 1000);
        } catch (e) {
            console.log("Error patching game functions:", e);
            setTimeout(patchGameFunctions, 2000);
        }
    }

    // Patch native functions: JSON.parse and fetch
    function patchNativeFunctions() {
        try {
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
                        data: arguments[0] ? arguments[0].substring(0, 100) + (arguments[0].length > 100 ? '...' : '') : '',
                        gameId: new URLSearchParams(window.location.search).get('gameId'),
                        roomId: new URLSearchParams(window.location.search).get('roomId'),
                        userId: new URLSearchParams(window.location.search).get('userId')
                    };
                    sendError(errorInfo);
                    throw error;
                }
            };
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
                        throw error;
                    });
            };
        } catch (e) {
            console.log("Error patching native functions:", e);
        }
    }

    setTimeout(patchGameFunctions, 500);
    patchNativeFunctions();

    // Heartbeat to verify the error handler remains active
    setInterval(function() {
        if (!errorSocket.connected) {
            console.log("Error socket disconnected during heartbeat check");
            attemptReconnect();
        }
    }, 30000);

    console.log('Enhanced error detection (No Toasts) initialized');
})();
