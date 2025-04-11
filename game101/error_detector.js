// V2
(function () {
    const originalConsoleError = console.error;
    let errorSocket;
    
    // Initialize socket with error handling
    try {
        errorSocket = io(location.origin);
    } catch (e) {
        console.log('Error initializing error socket:', e);
        // Fall back to a basic error socket that queues errors
        errorSocket = {
            connected: false,
            queue: [],
            emit: function(event, data) {
                this.queue.push({event, data});
                if (this.queue.length > 20) this.queue.shift(); // Prevent memory leaks
            },
            on: function() {} // No-op
        };
    }

    // Function to extract stack trace
    function getStackTrace(error) {
        if (!error || !error.stack) return '';
        return error.stack;
    }

    // Function to send error to server
    function sendError(errorInfo) {
        try {
            if (errorSocket.connected) {
                errorSocket.emit('error', errorInfo);
            } else {
                errorSocket.on('connect', () => {
                    errorSocket.emit('error', errorInfo);
                });
            }
        } catch (e) {
            // Last resort - at least log that we tried
            originalConsoleError('Failed to send error to server:', e);
        }
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
            // Silently fail - we don't want errors in the error handler
        }
    }

    // Override console.error
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
            showErrorToast('Error Detected! Check console.');
        } catch (e) {
            // Fallback if our error handling has errors
            originalConsoleError('Error in error handler:', e);
        }
    };

    // Capture global errors
    window.addEventListener('error', function (event) {
        try {
            // Don't process if it's not an actual error (like a resource loading error)
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
            showErrorToast(`Uncaught Error: ${event.message}`);
        } catch (e) {
            // Fallback for errors in the error handler
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
            showErrorToast(`Unhandled Promise Rejection: ${message}`);
        } catch (e) {
            // Fallback for errors in the rejection handler
            originalConsoleError('Error in promise rejection handler:', e);
        }
    });

    // Patch major browser functions to catch more errors
    const patchFunction = (obj, funcName) => {
        const original = obj[funcName];
        if (typeof original !== 'function') return;
        
        obj[funcName] = function() {
            try {
                return original.apply(this, arguments);
            } catch (error) {
                console.error(`Error in ${funcName}:`, error);
                throw error; // Re-throw so the error propagates
            }
        };
    };

    // Patch key methods that might cause errors
    try {
        // Patch setTimeout and setInterval
        patchFunction(window, 'setTimeout');
        patchFunction(window, 'setInterval');
        
        // Patch event listener methods
        patchFunction(EventTarget.prototype, 'addEventListener');
        patchFunction(EventTarget.prototype, 'removeEventListener');
        
        // Patch requestAnimationFrame
        patchFunction(window, 'requestAnimationFrame');
    } catch (e) {
        // Ignore patching errors - they're not critical
    }
    
    console.log('Enhanced error detection initialized');
})();