(function initRefreshExample() {
    const host = document.getElementById('feed-refresh');
    const list = document.getElementById('feed-list');
    const status = document.getElementById('feed-status');
    const trigger = document.getElementById('btn-trigger-refresh');

    if (!host || !list || !status || !trigger) return;

    const appendItem = () => {
        const item = document.createElement('li');
        item.className = 'refresh-demo__item';
        const title = document.createElement('strong');
        title.textContent = `Feed ping ${new Date().toLocaleTimeString()}`;
        const copy = document.createElement('span');
        copy.textContent = 'Async refresh completed through the `pullrefresh` event callback.';
        item.append(title, copy);
        list.prepend(item);
        while (list.children.length > 6) {
            list.lastElementChild?.remove();
        }
        status.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    };

    host.addEventListener('pullrefresh', (event) => {
        window.setTimeout(() => {
            appendItem();
            event.detail?.complete?.({ success: true, message: 'Feed updated' });
        }, 900);
    });

    const waitForRefresh = () => {
        if (host.refresh) return Promise.resolve(host.refresh);
        return new Promise((resolve) => {
            const timer = window.setInterval(() => {
                if (!host.refresh) return;
                window.clearInterval(timer);
                resolve(host.refresh);
            }, 50);
        });
    };

    waitForRefresh().then((instance) => {
        trigger.addEventListener('click', () => instance.trigger());
    });
})();
