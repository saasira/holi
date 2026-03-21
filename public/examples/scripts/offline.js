(function initOfflineExample() {
    const host = document.getElementById('demo-offline');
    const log = document.getElementById('offline-log');
    const btnOffline = document.getElementById('btn-offline');
    const btnOnline = document.getElementById('btn-online');
    const btnQueue = document.getElementById('btn-queue');
    const btnClear = document.getElementById('btn-clear');
    const btnRetry = document.getElementById('btn-retry');

    if (!host || !log || !btnOffline || !btnOnline || !btnQueue || !btnClear || !btnRetry) return;

    const appendLog = (message) => {
        const item = document.createElement('li');
        item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        log.prepend(item);
    };

    const waitForComponent = () => {
        if (host.offlineIndicator) return Promise.resolve(host.offlineIndicator);
        if (host.offlineindicator) return Promise.resolve(host.offlineindicator);

        return new Promise((resolve) => {
            const timer = window.setInterval(() => {
                const instance = host.offlineIndicator || host.offlineindicator;
                if (!instance) return;
                window.clearInterval(timer);
                resolve(instance);
            }, 50);
        });
    };

    waitForComponent().then((indicator) => {
        appendLog('OfflineIndicator ready.');

        btnOffline.addEventListener('click', () => {
            indicator.simulateOffline();
            appendLog('Forced offline state.');
        });

        btnOnline.addEventListener('click', () => {
            indicator.simulateOnline();
            appendLog('Forced online state.');
        });

        btnQueue.addEventListener('click', () => {
            const action = { id: Date.now(), label: `sync-${Date.now()}` };
            window.OfflineIndicator?.queue?.(action);
            appendLog(`Queued action ${action.label}.`);
        });

        btnClear.addEventListener('click', () => {
            window.OfflineIndicator?.clearQueue?.();
            appendLog('Cleared queued actions.');
        });

        btnRetry.addEventListener('click', () => {
            indicator.retryConnection();
            appendLog('Triggered retry flow.');
        });
    });

    document.addEventListener('app:offline', () => appendLog('Observed app:offline event.'));
    document.addEventListener('app:online', () => appendLog('Observed app:online event.'));
})();
