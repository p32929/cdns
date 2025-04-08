(function () {
    const originalConsoleError = console.error;
    const errorSocket = io(location.origin);

    console.error = function () {
        originalConsoleError.apply(console, arguments);

        const errorText = Array.from(arguments).join(' ');
        const errorInfo = {
            type: 'console_error',
            message: errorText,
            timestamp: Date.now(),
            url: window.location.href,
            gameId: new URLSearchParams(window.location.search).get('gameId'),
            roomId: new URLSearchParams(window.location.search).get('roomId')
        };

        if (errorSocket.connected) {
            errorSocket.emit('error', errorInfo);
        } else {
            errorSocket.on('connect', () => {
                errorSocket.emit('error', errorInfo);
            });
        }

        const body = document.body;
        if (body) {
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
            errorToast.textContent = 'Error Detected! Check console.';
            body.appendChild(errorToast);

            setTimeout(() => {
                if (body.contains(errorToast)) {
                    body.removeChild(errorToast);
                }
            }, 5000);
        }
    };

    window.addEventListener('error', function (event) {
        if (event instanceof ErrorEvent) {
            const errorInfo = {
                type: 'script_error',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                timestamp: Date.now(),
                url: window.location.href,
                gameId: new URLSearchParams(window.location.search).get('gameId'),
                roomId: new URLSearchParams(window.location.search).get('roomId')
            };

            if (errorSocket.connected) {
                errorSocket.emit('error', errorInfo);
            } else {
                errorSocket.on('connect', () => {
                    errorSocket.emit('error', errorInfo);
                });
            }
        }
    }, true);

    console.log('Syntax error detection initialized');
})();