import { Component } from './component.js';

class LRUImageCache {
    constructor(limit = 80) {
        this.limit = Math.max(10, Number(limit) || 80);
        this.store = new Map();
    }

    touch(key) {
        if (!this.store.has(key)) return;
        const entry = this.store.get(key);
        this.store.delete(key);
        this.store.set(key, entry);
    }

    set(key, value) {
        if (this.store.has(key)) this.store.delete(key);
        this.store.set(key, value);
        while (this.store.size > this.limit) {
            const oldest = this.store.keys().next().value;
            this.store.delete(oldest);
        }
    }

    preload(src) {
        if (!src) return Promise.resolve(null);
        const key = String(src);
        const existing = this.store.get(key);
        if (existing?.promise) {
            this.touch(key);
            return existing.promise;
        }

        const promise = new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(key);
            image.onerror = () => reject(new Error(`Failed to preload image: ${key}`));
            image.src = key;
        });

        this.set(key, { promise });
        promise
            .then(() => this.set(key, { state: 'loaded' }))
            .catch(() => this.set(key, { state: 'error' }));
        return promise;
    }
}

class GalleryComponent extends Component {
    static get selector() {
        return 'gallery';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'gallery';
    }

    static templateId = 'gallery-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = GalleryComponent.templateId;
        this.dialogTitle = container.getAttribute('dialog-title') || container.getAttribute('title') || 'Image Viewer';
        this.footerMessage = container.getAttribute('footer-message') || 'Use arrows or swipe to navigate.';
        this.remoteSource = container.getAttribute('source') || container.getAttribute('data-source') || '';
        this.pageSize = this.parsePositive(container.getAttribute('page-size'), 12);
        this.maxThumbHeight = this.parsePositive(container.getAttribute('thumb-height'), 72);
        this.defaultMode = this.resolveDisplayMode(container.getAttribute('display-mode') || '');
        this.displayMode = this.defaultMode;
        this.cache = new LRUImageCache(this.parsePositive(container.getAttribute('cache-size'), 80));
        this.sourceNodes = [];
        this.allItems = [];
        this.viewItems = [];
        this.visibleItems = [];
        this.pendingIndex = 0;
        this.query = '';
        this.metaQuery = '';
        this.sortField = 'name';
        this.sortDirection = container.getAttribute('sort-direction') === 'desc' ? 'desc' : 'asc';
        this.currentPage = 1;
        this.visibleCount = this.pageSize;
        this.observer = null;
        this.loading = false;
        this.init();
    }

    parsePositive(value, fallback) {
        const next = Number(value);
        return Number.isFinite(next) && next > 0 ? next : fallback;
    }

    resolveDisplayMode(value) {
        const text = String(value || '').trim().toLowerCase();
        if (text === 'infinite' || this.container.hasAttribute('infinite-scroll')) return 'infinite';
        return 'paginate';
    }

    captureSourceItems() {
        const directChildren = Array.from(this.container.children).filter((child) => !child.classList.contains('holi-gallery-root'));
        this.sourceNodes = directChildren;

        return directChildren.filter((node) => {
            if (node.matches('[slot]')) return true;
            if (node.matches('img, figure, a')) return true;
            return !!node.querySelector('img');
        });
    }

    parseItem(node, index) {
        const image = node.matches('img') ? node : node.querySelector('img');
        if (!image) return null;

        const anchor = node.matches('a') ? node : node.querySelector('a');
        const thumbSrc = node.getAttribute('data-thumb-src') || image.getAttribute('src');
        const fullSrc = node.getAttribute('data-full-src')
            || image.getAttribute('data-full-src')
            || anchor?.getAttribute('href')
            || thumbSrc;

        if (!thumbSrc || !fullSrc) return null;

        const nodeMeta = this.parseMetadata(node.getAttribute('data-meta') || image.getAttribute('data-meta') || '');
        const datasetMeta = this.extractDatasetMetadata(node, image);
        const name = node.getAttribute('data-name') || image.getAttribute('data-name') || image.getAttribute('alt') || `Image ${index + 1}`;

        return {
            index,
            id: String(node.getAttribute('data-id') || image.getAttribute('data-id') || index),
            name,
            thumbSrc,
            fullSrc,
            thumbAlt: node.getAttribute('data-thumb-alt') || image.getAttribute('alt') || `Thumbnail ${index + 1}`,
            fullAlt: node.getAttribute('data-full-alt') || image.getAttribute('alt') || `Image ${index + 1}`,
            metadata: { ...datasetMeta, ...nodeMeta }
        };
    }

    parseMetadata(raw) {
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    extractDatasetMetadata(...nodes) {
        const reserved = new Set(['thumbSrc', 'fullSrc', 'thumbAlt', 'fullAlt', 'name', 'meta', 'id']);
        const output = {};
        nodes.forEach((node) => {
            if (!node?.dataset) return;
            Object.keys(node.dataset).forEach((key) => {
                if (reserved.has(key)) return;
                const value = node.dataset[key];
                if (value == null || value === '') return;
                output[key] = value;
            });
        });
        return output;
    }

    parseApiItem(rawItem, index) {
        if (!rawItem || typeof rawItem !== 'object') return null;
        const thumbSrc = rawItem.thumbSrc || rawItem.thumbnail || rawItem.thumb || rawItem.src || '';
        const fullSrc = rawItem.fullSrc || rawItem.full || rawItem.url || rawItem.image || thumbSrc;
        if (!thumbSrc || !fullSrc) return null;

        const metadataBase = rawItem.metadata && typeof rawItem.metadata === 'object' ? rawItem.metadata : {};
        const metadata = { ...metadataBase };
        Object.keys(rawItem).forEach((key) => {
            if (['id', 'name', 'title', 'thumbSrc', 'thumbnail', 'thumb', 'src', 'fullSrc', 'full', 'url', 'image', 'alt', 'thumbAlt', 'fullAlt', 'metadata'].includes(key)) return;
            metadata[key] = rawItem[key];
        });

        const name = rawItem.name || rawItem.title || rawItem.alt || `Image ${index + 1}`;

        return {
            index,
            id: String(rawItem.id ?? index),
            name,
            thumbSrc,
            fullSrc,
            thumbAlt: rawItem.thumbAlt || rawItem.alt || name,
            fullAlt: rawItem.fullAlt || rawItem.alt || name,
            metadata
        };
    }

    async resolveItems() {
        const inlineNodes = this.captureSourceItems();
        const inlineItems = inlineNodes.map((node, index) => this.parseItem(node, index)).filter(Boolean);

        if (!this.remoteSource) return inlineItems;

        this.setLoadingState(true, 'Loading images...');
        try {
            const response = await fetch(this.remoteSource, { credentials: 'same-origin' });
            if (!response.ok) throw new Error(`Gallery source request failed: ${response.status}`);
            const payload = await response.json();
            const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload?.rows) ? payload.rows : []));
            const remoteItems = list.map((item, index) => this.parseApiItem(item, index)).filter(Boolean);
            return remoteItems.length ? remoteItems : inlineItems;
        } catch (error) {
            this.setLoadingState(false);
            this.setStateMessage(`Failed to load remote gallery source. ${String(error.message || error)}`);
            return inlineItems;
        } finally {
            this.setLoadingState(false);
        }
    }

    validateStructure() {
        super.validateStructure();
        this.hasItems = this.allItems.length > 0;
    }

    async init() {
        this.allItems = await this.resolveItems();
        this.validateStructure();
        await this.render();
        this.bindEvents();
        this.applyView(true);
    }

    async render() {
        await super.render();
        this.root = this.container.querySelector('.holi-gallery-root');
        this.toolbar = this.container.querySelector('[data-role="toolbar"]');
        this.stateNode = this.container.querySelector('[data-role="state"]');
        this.searchInput = this.container.querySelector('[data-role="search-input"]');
        this.metaInput = this.container.querySelector('[data-role="meta-input"]');
        this.sortFieldSelect = this.container.querySelector('[data-role="sort-field"]');
        this.sortDirectionSelect = this.container.querySelector('[data-role="sort-direction"]');
        this.displayModeSelect = this.container.querySelector('[data-role="display-mode"]');
        this.gridWrap = this.container.querySelector('[data-role="grid-wrap"]');
        this.grid = this.container.querySelector('[data-role="grid"]');
        this.sentinel = this.container.querySelector('[data-role="sentinel"]');
        this.pagination = this.container.querySelector('[data-role="pagination"]');
        this.pageStatus = this.container.querySelector('[data-role="page-status"]');
        this.dialogHost = this.container.querySelector('[data-role="dialog"]');
        this.carouselHost = this.container.querySelector('[data-role="carousel"]');
        this.slidesHost = this.container.querySelector('[data-role="slides"]');

        this.sourceNodes.forEach((node) => node.remove());
        if (this.gridWrap) {
            this.gridWrap.style.maxHeight = `${this.maxThumbHeight}vh`;
        }
        if (this.sortDirectionSelect) this.sortDirectionSelect.value = this.sortDirection;
        if (this.displayModeSelect) this.displayModeSelect.value = this.displayMode;
        this.renderSortOptions();
        this.applyDialogConfig();
    }

    renderSortOptions() {
        if (!this.sortFieldSelect) return;
        const keys = new Set(['name']);
        this.allItems.forEach((item) => {
            Object.keys(item.metadata || {}).forEach((key) => keys.add(key));
        });

        this.sortFieldSelect.replaceChildren();
        Array.from(keys).forEach((key) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key === 'name' ? 'Name' : `Metadata: ${key}`;
            this.sortFieldSelect.appendChild(option);
        });

        if (!keys.has(this.sortField)) this.sortField = 'name';
        this.sortFieldSelect.value = this.sortField;
    }

    setLoadingState(flag, message = '') {
        this.loading = !!flag;
        if (!this.stateNode) return;
        if (!flag) {
            if (!message) {
                this.stateNode.hidden = true;
                this.stateNode.textContent = '';
            }
            return;
        }
        this.stateNode.hidden = false;
        this.stateNode.textContent = message || 'Loading...';
    }

    setStateMessage(message = '') {
        if (!this.stateNode) return;
        if (!message) {
            this.stateNode.hidden = true;
            this.stateNode.textContent = '';
            return;
        }
        this.stateNode.hidden = false;
        this.stateNode.textContent = message;
    }

    normalizeText(value) {
        return String(value ?? '').trim().toLowerCase();
    }

    matchesMetaFilter(item) {
        const value = this.normalizeText(this.metaQuery);
        if (!value) return true;
        const metadata = item.metadata || {};
        if (value.includes(':')) {
            const [rawKey, rawVal] = value.split(':');
            const key = this.normalizeText(rawKey);
            const expected = this.normalizeText(rawVal);
            if (!key || !expected) return true;
            const keys = Object.keys(metadata);
            for (let i = 0; i < keys.length; i += 1) {
                if (this.normalizeText(keys[i]) !== key) continue;
                if (this.normalizeText(metadata[keys[i]]).includes(expected)) return true;
            }
            return false;
        }

        return this.normalizeText(JSON.stringify(metadata)).includes(value);
    }

    matchesSearch(item) {
        const q = this.normalizeText(this.query);
        if (!q) return true;
        const name = this.normalizeText(item.name);
        const meta = this.normalizeText(JSON.stringify(item.metadata || {}));
        return name.includes(q) || meta.includes(q);
    }

    sortItems(items) {
        const direction = this.sortDirection === 'desc' ? -1 : 1;
        const field = this.sortField || 'name';
        const sortable = [...items];
        sortable.sort((a, b) => {
            const av = field === 'name' ? a.name : a.metadata?.[field];
            const bv = field === 'name' ? b.name : b.metadata?.[field];
            const an = Number(av);
            const bn = Number(bv);
            if (Number.isFinite(an) && Number.isFinite(bn)) {
                if (an < bn) return -1 * direction;
                if (an > bn) return 1 * direction;
                return 0;
            }
            const as = this.normalizeText(av);
            const bs = this.normalizeText(bv);
            if (as < bs) return -1 * direction;
            if (as > bs) return 1 * direction;
            return 0;
        });
        return sortable;
    }

    computeVisibleItems(resetViewport) {
        if (this.displayMode === 'infinite') {
            if (resetViewport) this.visibleCount = this.pageSize;
            const count = Math.min(this.visibleCount, this.viewItems.length);
            this.visibleItems = this.viewItems.slice(0, count).map((item, idx) => ({ ...item, viewIndex: idx }));
            return;
        }

        const totalPages = Math.max(1, Math.ceil(this.viewItems.length / this.pageSize));
        this.currentPage = Math.min(this.currentPage, totalPages);
        if (resetViewport) this.currentPage = 1;
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        this.visibleItems = this.viewItems.slice(start, end).map((item, idx) => ({ ...item, viewIndex: start + idx }));
    }

    applyView(resetViewport = false) {
        if (!this.hasItems) {
            this.viewItems = [];
            this.visibleItems = [];
            this.renderThumbnails();
            this.renderSlides();
            this.updatePagination();
            this.updateSentinel();
            this.setStateMessage('No images available. Provide inline <img> content or a valid remote source.');
            return;
        }

        const filtered = this.allItems.filter((item) => this.matchesSearch(item) && this.matchesMetaFilter(item));
        this.viewItems = this.sortItems(filtered);
        this.computeVisibleItems(resetViewport);

        this.renderThumbnails();
        this.renderSlides();
        this.updatePagination();
        this.updateSentinel();
        this.syncNestedComponents();
        this.preloadVisibleImages();

        if (!this.viewItems.length) {
            this.setStateMessage('No images match the current filters.');
            return;
        }
        if (!this.loading) this.setStateMessage('');
    }

    renderThumbnails() {
        if (!this.grid) return;
        this.grid.replaceChildren();
        this.visibleItems.forEach((item) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'holi-gallery-thumb';
            button.setAttribute('data-gallery-index', String(item.viewIndex));
            button.setAttribute('aria-label', `Open image ${item.index + 1}`);
            button.setAttribute('title', item.name || item.thumbAlt || '');

            const image = document.createElement('img');
            image.src = item.thumbSrc;
            image.alt = item.thumbAlt;
            image.loading = 'lazy';

            button.appendChild(image);
            this.grid.appendChild(button);
        });
    }

    renderSlides() {
        const host = this.resolveSlidesHost();
        if (!host) return;
        this.slidesHost = host;
        this.slidesHost.replaceChildren();
        this.viewItems.forEach((item) => {
            const slide = document.createElement('article');
            slide.className = 'slide';

            const image = document.createElement('img');
            image.src = item.fullSrc;
            image.alt = item.fullAlt;

            slide.appendChild(image);
            this.slidesHost.appendChild(slide);
        });
    }

    resolveSlidesHost() {
        const carousel = this.getCarouselInstance();
        if (carousel?.track && carousel.track.isConnected) {
            return carousel.track;
        }

        const candidates = Array.from(this.container.querySelectorAll('[data-role="slides"], [data-role="track"]'));
        for (let i = candidates.length - 1; i >= 0; i -= 1) {
            const node = candidates[i];
            if (!(node instanceof HTMLElement)) continue;
            if (!node.isConnected) continue;
            if (node.matches('[data-role="track"]') || node.classList.contains('slides')) {
                return node;
            }
        }
        return null;
    }

    applyDialogConfig() {
        if (!this.dialogHost) return;
        this.dialogHost.setAttribute('title', this.dialogTitle);
        this.dialogHost.setAttribute('footer-message', this.footerMessage);
    }

    ensureNestedComponents() {
        const holiAppClass = window.HoliApp?.HoliApp;
        if (!holiAppClass || typeof holiAppClass.init !== 'function') return;
        holiAppClass.init(this.container);
    }

    syncNestedComponents() {
        const carousel = this.getCarouselInstance();
        if (!carousel) {
            this.ensureNestedComponents();
            return;
        }

        if (typeof carousel.refreshSlides === 'function') carousel.refreshSlides();
        if (typeof carousel.updateTrackSizing === 'function') carousel.updateTrackSizing();
        if (typeof carousel.renderDots === 'function') carousel.renderDots();
        const maxIndex = Math.max(carousel.getDotCount?.() - 1 || 0, 0);
        this.pendingIndex = Math.min(this.pendingIndex, maxIndex);
        if (typeof carousel.goToSlide === 'function') carousel.goToSlide(this.pendingIndex, false);
    }

    getDialogInstance() {
        return this.dialogHost?.dialogcomponent || null;
    }

    getCarouselInstance() {
        const candidates = this.container.querySelectorAll('carousel, [component="carousel"], [role="carousel"]');
        for (let i = 0; i < candidates.length; i += 1) {
            const instance = candidates[i].carouselcomponent;
            if (instance) return instance;
        }
        return null;
    }

    preloadVisibleImages() {
        const visible = this.visibleItems.slice(0, this.pageSize);
        visible.forEach((item) => {
            this.cache.preload(item.thumbSrc).catch(() => {});
        });
    }

    syncToPendingIndex() {
        const carousel = this.getCarouselInstance();
        if (!carousel) return false;
        const current = this.viewItems[this.pendingIndex];
        if (current) {
            this.cache.preload(current.fullSrc).catch(() => {});
            const next = this.viewItems[this.pendingIndex + 1];
            const prev = this.viewItems[this.pendingIndex - 1];
            if (next) this.cache.preload(next.fullSrc).catch(() => {});
            if (prev) this.cache.preload(prev.fullSrc).catch(() => {});
        }
        carousel.goToSlide(this.pendingIndex, false);
        return true;
    }

    openAt(index, attempt = 0) {
        const safeIndex = Number(index);
        this.pendingIndex = Number.isFinite(safeIndex) ? safeIndex : 0;

        const dialog = this.getDialogInstance();
        if (!dialog) {
            this.ensureNestedComponents();
            if (attempt >= 8) return;
            requestAnimationFrame(() => this.openAt(this.pendingIndex, attempt + 1));
            return;
        }

        dialog.open();
        if (this.syncToPendingIndex()) return;
        requestAnimationFrame(() => {
            this.syncToPendingIndex();
        });
    }

    updatePagination() {
        if (!this.pagination || !this.pageStatus) return;
        if (this.displayMode === 'infinite') {
            this.pagination.hidden = true;
            this.pageStatus.textContent = `Showing ${this.visibleItems.length} of ${this.viewItems.length} images`;
            return;
        }

        this.pagination.hidden = false;
        const totalPages = Math.max(1, Math.ceil(this.viewItems.length / this.pageSize));
        const prev = this.pagination.querySelector('[data-action="prev-page"]');
        const next = this.pagination.querySelector('[data-action="next-page"]');
        if (prev) prev.disabled = this.currentPage <= 1;
        if (next) next.disabled = this.currentPage >= totalPages;
        this.pageStatus.textContent = `Page ${this.currentPage} of ${totalPages} (${this.viewItems.length} images)`;
    }

    updateSentinel() {
        if (!this.sentinel) return;
        const hasMore = this.displayMode === 'infinite' && this.visibleItems.length < this.viewItems.length;
        this.sentinel.hidden = !hasMore;
    }

    setupInfiniteObserver() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.displayMode !== 'infinite' || !this.sentinel || !this.gridWrap) return;
        if (typeof IntersectionObserver === 'undefined') return;

        this.observer = new IntersectionObserver((entries) => {
            const hit = entries.some((entry) => entry.isIntersecting);
            if (!hit) return;
            if (this.visibleItems.length >= this.viewItems.length) return;
            this.visibleCount += this.pageSize;
            this.computeVisibleItems(false);
            this.renderThumbnails();
            this.updateSentinel();
            this.updatePagination();
            this.preloadVisibleImages();
        }, {
            root: this.gridWrap,
            threshold: 0.1
        });

        this.observer.observe(this.sentinel);
    }

    bindEvents() {
        this.grid?.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-gallery-index]');
            if (!trigger) return;
            const index = Number(trigger.getAttribute('data-gallery-index'));
            this.openAt(index);
        });

        this.dialogHost?.addEventListener('dialogopen', () => {
            this.syncToPendingIndex();
        });

        this.searchInput?.addEventListener('input', (event) => {
            this.query = event.target.value || '';
            this.applyView(true);
        });

        this.metaInput?.addEventListener('input', (event) => {
            this.metaQuery = event.target.value || '';
            this.applyView(true);
        });

        this.sortFieldSelect?.addEventListener('change', (event) => {
            this.sortField = event.target.value || 'name';
            this.applyView(true);
        });

        this.sortDirectionSelect?.addEventListener('change', (event) => {
            this.sortDirection = event.target.value === 'desc' ? 'desc' : 'asc';
            this.applyView(true);
        });

        this.displayModeSelect?.addEventListener('change', (event) => {
            this.displayMode = event.target.value === 'infinite' ? 'infinite' : 'paginate';
            this.applyView(true);
            this.setupInfiniteObserver();
        });

        this.pagination?.addEventListener('click', (event) => {
            const target = event.target.closest('[data-action]');
            if (!target || this.displayMode !== 'paginate') return;
            const action = target.getAttribute('data-action');
            const totalPages = Math.max(1, Math.ceil(this.viewItems.length / this.pageSize));
            if (action === 'prev-page' && this.currentPage > 1) {
                this.currentPage -= 1;
                this.applyView(false);
            }
            if (action === 'next-page' && this.currentPage < totalPages) {
                this.currentPage += 1;
                this.applyView(false);
            }
        });

        this.setupInfiniteObserver();
    }

    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.GalleryComponent = GalleryComponent;
}

export { GalleryComponent };
