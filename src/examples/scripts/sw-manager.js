(function initServiceWorkerManagerExample() {
    const logList = document.getElementById('log');
    const btnRegisterSW = document.getElementById('btn-register-sw');
    const btnRegisterHandlers = document.getElementById('btn-register-handlers');
    const btnQueueSync = document.getElementById('btn-queue-sync');
    const btnRunSync = document.getElementById('btn-run-sync');
    const btnNotifyUpdate = document.getElementById('btn-notify-update');

    if (!logList || !btnRegisterSW || !btnRegisterHandlers || !btnQueueSync || !btnRunSync || !btnNotifyUpdate) return;

    const ServiceWorkerManager = window.HoliApp && window.HoliApp.ServiceWorkerManager;
    if (!ServiceWorkerManager) {
        appendLog('ServiceWorkerManager not available on window.HoliApp');
        return;
    }

    const manager = ServiceWorkerManager.getInstance({
        cacheName: 'holi-sw-example-v1'
    });

    let registration = null;

    function appendLog(message) {
        const item = document.createElement('li');
        item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logList.prepend(item);
    }

    async function ensureNotificationPermission() {
        if (typeof Notification === 'undefined') return 'unsupported';
        if (Notification.permission === 'granted') return 'granted';
        if (Notification.permission === 'denied') return 'denied';
        return Notification.requestPermission();
    }

    async function ensureWorker() {
        registration = await manager.registerWorker('/sw.js');
        if (!registration) {
            appendLog('Service worker is not supported in this browser.');
            return null;
        }
        appendLog('Registered /sw.js successfully.');
        return registration;
    }

    async function registerHandlers() {
        const pushPermission = await ensureNotificationPermission();
        appendLog(`Notification permission: ${pushPermission}`);

        const handlers = [
            ServiceWorkerManager.buildHandler('fetch', 'optimize-unsplash-images', {
                priority: 100,
                match: { method: 'GET', urlIncludes: 'images.unsplash.com' },
                strategy: 'image-optimize',
                maxWidth: 960,
                quality: 72
            }),
            ServiceWorkerManager.buildHandler('sync', 'sales-background-sync', {
                priority: 90,
                match: { tag: 'sales-sync' },
                sync: {
                    endpoint: '/examples/api/sales',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: {
                        id: Date.now(),
                        region: 'west',
                        amount: 3500,
                        source: 'sw-example-handler'
                    }
                }
            }),
            ServiceWorkerManager.buildHandler('push', 'notify-on-data-update', {
                priority: 80,
                notification: {
                    title: 'Sales Dataset Updated',
                    body: 'Fresh data is available in the background.',
                    icon: '/favicon.ico'
                }
            })
        ];

        const ok = await manager.registerHandlers(handlers);
        appendLog(ok ? 'Registered handlers in service worker.' : 'Could not register handlers (worker not active yet).');
    }

    async function queueSyncTask() {
        const task = {
            tag: 'sales-sync',
            url: '/examples/api/sales',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: {
                id: Date.now(),
                region: 'east',
                amount: 1875,
                source: 'queued-sync-task'
            }
        };
        const ok = await manager.postToServiceWorker({
            type: 'QUEUE_SYNC_TASK',
            task
        });
        appendLog(ok ? 'Queued sync task in service worker memory queue.' : 'Unable to queue sync task.');
    }

    async function triggerSync() {
        const activeRegistration = registration || await manager.ready();
        if (!activeRegistration) {
            appendLog('No service worker registration available for sync.');
            return;
        }

        if (activeRegistration.sync && typeof activeRegistration.sync.register === 'function') {
            await activeRegistration.sync.register('sales-sync');
            appendLog('Registered sync tag: sales-sync');
            return;
        }

        const ok = await manager.postToServiceWorker({
            type: 'QUEUE_SYNC_TASK',
            task: {
                tag: 'sales-sync',
                url: '/examples/api/sales',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: { id: Date.now(), amount: 999, source: 'manual-sync-fallback' }
            }
        });
        appendLog(ok ? 'SyncManager unsupported; queued fallback sync task.' : 'SyncManager unsupported and fallback queue failed.');
    }

    async function notifyDataUpdate() {
        const permission = await ensureNotificationPermission();
        if (permission !== 'granted') {
            appendLog('Notification permission not granted.');
            return;
        }

        const ok = await manager.postToServiceWorker({
            type: 'SHOW_NOTIFICATION',
            payload: {
                title: 'Background Data Update',
                body: 'New records were synced successfully.',
                icon: '/favicon.ico',
                data: { section: 'sales' }
            }
        });
        appendLog(ok ? 'Triggered update notification through SW handler.' : 'Failed to trigger update notification.');
    }

    btnRegisterSW.addEventListener('click', () => {
        ensureWorker().catch((error) => appendLog(`Register failed: ${error.message || error}`));
    });

    btnRegisterHandlers.addEventListener('click', () => {
        registerHandlers().catch((error) => appendLog(`Handler registration failed: ${error.message || error}`));
    });

    btnQueueSync.addEventListener('click', () => {
        queueSyncTask().catch((error) => appendLog(`Queue sync failed: ${error.message || error}`));
    });

    btnRunSync.addEventListener('click', () => {
        triggerSync().catch((error) => appendLog(`Trigger sync failed: ${error.message || error}`));
    });

    btnNotifyUpdate.addEventListener('click', () => {
        notifyDataUpdate().catch((error) => appendLog(`Notification failed: ${error.message || error}`));
    });

    appendLog('ServiceWorkerManager demo loaded.');
})();
