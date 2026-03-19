(function () {
    const logEl = document.getElementById('assert-log');
    const dynamicHost = document.getElementById('dynamic-host');
    let lastDynamicNode = null;
    let lastDynamicInstance = null;

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function appendLog(ok, message) {
        const li = document.createElement('li');
        li.className = ok ? 'assert-pass' : 'assert-fail';
        li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${message}`;
        logEl?.appendChild(li);
    }

    function assert(message, condition) {
        appendLog(!!condition, message);
        return !!condition;
    }

    function addDynamicInput() {
        if (lastDynamicNode?.isConnected) return lastDynamicNode;
        const host = document.createElement('holi-input');
        host.id = 'dynamic-input-host';
        host.setAttribute('name', 'dynamic_name');
        host.setAttribute('label', 'Dynamic Name');
        host.setAttribute('placeholder', 'Created at runtime');
        host.setAttribute('required', '');
        host.setAttribute('data-validators', 'required,minLength:2');

        const helper = document.createElement('small');
        helper.setAttribute('slot', 'helper');
        helper.textContent = 'Created via JS and should auto-initialize.';
        host.appendChild(helper);

        dynamicHost?.appendChild(host);
        lastDynamicNode = host;
        return host;
    }

    function removeDynamicInput() {
        if (!lastDynamicNode?.isConnected) return;
        lastDynamicInstance = lastDynamicNode.inputcomponent || null;
        lastDynamicNode.remove();
    }

    async function checkDynamicLifecycle() {
        addDynamicInput();
        await wait(80);
        assert('Dynamic input host auto-initialized', !!lastDynamicNode?.inputcomponent);

        removeDynamicInput();
        await wait(40);
        const removed = lastDynamicNode && !lastDynamicNode.isConnected;
        assert('Dynamic input host removed from DOM', removed);
        assert('Removed instance marked destroyed', !!lastDynamicInstance?.isDestroyed);
        assert('Removed host instance handle cleared', !lastDynamicNode?.inputcomponent);
    }

    async function checkGalleryDialogCarousel() {
        const galleryHost = document.getElementById('gallery-regression');
        await wait(100);
        const gallery = galleryHost?.gallerycomponent;
        assert('Gallery component initialized', !!gallery);
        const thumb = galleryHost?.querySelector('[data-gallery-index="0"]');
        assert('Gallery rendered at least one thumbnail', !!thumb);
        if (!thumb) return;

        thumb.click();
        await wait(120);

        const dialog = gallery?.getDialogInstance?.();
        const carousel = gallery?.getCarouselInstance?.();
        assert('Gallery dialog instance available', !!dialog);
        assert('Gallery carousel instance available', !!carousel);
        assert('Dialog is open after thumbnail click', !!dialog?.isOpen);
        assert('Carousel has slides', (carousel?.slideList?.length || 0) > 0);

        const activeImage = galleryHost?.querySelector('.holi-carousel .slide.active img');
        assert('Active carousel slide image is rendered', !!activeImage?.getAttribute('src'));
    }

    async function checkTreeAndTreePanel() {
        await wait(80);
        const treeHost = document.getElementById('tree-regression');
        const tree = treeHost?.treecomponent;
        assert('Tree component initialized', !!tree);
        assert('Tree root list rendered', !!treeHost?.querySelector('.holi-tree-root'));

        const treePanelHost = document.getElementById('treepanel-regression');
        const treePanel = treePanelHost?.treepanelcomponent;
        assert('TreePanel component initialized', !!treePanel);
        assert('TreePanel embedded tree instance initialized', !!treePanel?.treeInstance);
    }

    async function runAllChecks() {
        if (logEl) logEl.replaceChildren();
        await checkDynamicLifecycle();
        await checkGalleryDialogCarousel();
        await checkTreeAndTreePanel();
    }

    document.getElementById('btn-add-input')?.addEventListener('click', async () => {
        addDynamicInput();
        await wait(60);
        assert('Manual add: dynamic input initialized', !!lastDynamicNode?.inputcomponent);
    });

    document.getElementById('btn-remove-input')?.addEventListener('click', async () => {
        removeDynamicInput();
        await wait(40);
        assert('Manual remove: dynamic instance destroyed', !!lastDynamicInstance?.isDestroyed);
    });

    document.getElementById('btn-run-all')?.addEventListener('click', () => {
        void runAllChecks();
    });

    window.loadTreeChildren = async ({ id }) => {
        const parent = encodeURIComponent(String(id || ''));
        const response = await fetch(`/examples/api/tree?parent=${parent}`, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`Tree API failed with ${response.status}`);
        const payload = await response.json();
        if (Array.isArray(payload?.nodes)) return payload.nodes;
        const grouped = payload && typeof payload.nodesByParent === 'object' ? payload.nodesByParent : {};
        return Array.isArray(grouped[id]) ? grouped[id] : [];
    };

    window.addEventListener('load', () => {
        void runAllChecks();
    });
})();
