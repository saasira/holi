(function initOfflineExample() {
    const host = document.getElementById('demo-offline');
    const log = document.getElementById('offline-log');
    const btnOffline = document.getElementById('btn-offline');
    const btnOnline = document.getElementById('btn-online');
    const btnQueue = document.getElementById('btn-queue');
    const btnClear = document.getElementById('btn-clear');
    const btnRetry = document.getElementById('btn-retry');
    const btnSaveDraft = document.getElementById('btn-save-draft');
    const btnSyncNow = document.getElementById('btn-sync-now');
    const draftTitle = document.getElementById('draft-title');
    const queueHost = document.getElementById('queue-offline');

    if (!host || !log || !btnOffline || !btnOnline || !btnQueue || !btnClear || !btnRetry || !btnSaveDraft || !btnSyncNow || !draftTitle || !queueHost) return;

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

    const waitForHost = (target) => {
        if (target.offlineIndicator) return Promise.resolve(target.offlineIndicator);
        if (target.offlineindicator) return Promise.resolve(target.offlineindicator);

        return new Promise((resolve) => {
            const timer = window.setInterval(() => {
                const instance = target.offlineIndicator || target.offlineindicator;
                if (!instance) return;
                window.clearInterval(timer);
                resolve(instance);
            }, 50);
        });
    };

    Promise.all([waitForHost(host), waitForHost(queueHost)]).then(([indicator, queueIndicator]) => {
        appendLog('OfflineIndicator ready.');
        appendLog('Block-scoped OfflineIndicator ready.');

        btnOffline.addEventListener('click', () => {
            indicator.simulateOffline();
            queueIndicator.simulateOffline();
            appendLog('Forced offline state.');
        });

        btnOnline.addEventListener('click', () => {
            indicator.simulateOnline();
            queueIndicator.simulateOnline();
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
            queueIndicator.retryConnection();
            appendLog('Triggered retry flow.');
        });

        btnSaveDraft.addEventListener('click', () => {
            const title = String(draftTitle.value || '').trim() || `Untitled draft ${Date.now()}`;
            const payload = {
                id: Date.now(),
                title,
                source: 'offline-demo-form'
            };
            window.OfflineIndicator?.queue?.(payload);
            appendLog(`Queued draft save for "${title}".`);
            draftTitle.value = '';
            queueIndicator.simulateOffline();
        });

        btnSyncNow.addEventListener('click', () => {
            indicator.simulateOnline();
            queueIndicator.simulateOnline();
            appendLog('Simulated reconnect and queue processing.');
        });
    });

    document.addEventListener('app:offline', () => appendLog('Observed app:offline event.'));
    document.addEventListener('app:online', () => appendLog('Observed app:online event.'));
})();
