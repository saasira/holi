(function initPwaInstallExample() {
    const installStatus = document.querySelector('[data-pwa-install-status]');
    const log = document.getElementById('pwa-log');
    const btnRegisterSW = document.getElementById('btn-register-sw');
    const btnRefreshStatus = document.getElementById('btn-refresh-status');
    const manifestName = document.getElementById('manifest-name');
    const manifestStart = document.getElementById('manifest-start');
    const manifestColor = document.getElementById('manifest-color');

    if (!installStatus || !log || !btnRegisterSW || !btnRefreshStatus || !manifestName || !manifestStart || !manifestColor) return;

    const app = window.HoliApp?.instance;
    if (!app) {
        const item = document.createElement('li');
        item.textContent = 'HoliApp.instance is not available.';
        log.appendChild(item);
        return;
    }

    const appendLog = (message) => {
        const item = document.createElement('li');
        item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        log.prepend(item);
    };

    const manifestConfig = {
        name: 'Holi Example App',
        short_name: 'Holi PWA',
        description: 'Example install surface for HoliApp PWA utilities.',
        start_url: '/examples/pages/pwa-install.html',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#0f766e'
    };

    manifestName.textContent = manifestConfig.name;
    manifestStart.textContent = manifestConfig.start_url;
    manifestColor.textContent = manifestConfig.theme_color;

    app.initPWA({
        manifestConfig
    });

    appendLog(`Initial state: ${app.getInstallStatusText()}`);

    btnRegisterSW.addEventListener('click', () => {
        app.getServiceWorkerManager()
            .registerWorker('/sw.js')
            .then((registration) => {
                if (!registration) {
                    appendLog('Service worker registration is unavailable in this browser.');
                    return;
                }
                appendLog('Service worker registered.');
            })
            .catch((error) => {
                appendLog(`Service worker registration failed: ${error.message || error}`);
            });
    });

    btnRefreshStatus.addEventListener('click', () => {
        app.syncInstallUI(document);
        appendLog(`Status refreshed: ${app.getInstallStatusText()}`);
    });

    document.addEventListener('pwa:installavailable', () => {
        appendLog('Install prompt became available.');
    });

    document.addEventListener('pwa:installresult', (event) => {
        appendLog(`Install result: ${event.detail?.outcome || 'unknown'}`);
    });

    document.addEventListener('pwa:installed', () => {
        appendLog('App installed.');
    });

    document.addEventListener('pwa:manifestupdated', () => {
        appendLog('Dynamic manifest injected.');
    });
})();
