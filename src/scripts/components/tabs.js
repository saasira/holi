import { Component } from './component.js';
import { attachLoaderState } from '../utils/loader_state.js';
import { attachComponentStateBinding } from '../utils/component_state_binding.js';

class TabsComponent extends Component {
    static get selector() {
        return 'tabs';
    }

    static get library() {
        return 'holi';
    }

    static matchesLibrary(element, libraryName) {
        return super.matchesLibrary(element, libraryName);
    }

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = 'tabs';
        this.lazyLoad = this.container.hasAttribute('lazy');
        this.cacheContent = !this.container.hasAttribute('no-cache');
        this.preloadCount = parseInt(this.container.dataset.preload || 0, 10);
        this.providerName = container.getAttribute('provider') || 'default';
        this.contentProviderInstance = null;
        this.panelCache = new Map();
        this.loadingStates = new Map();
        this.tabs = [];
        this.activeIndex = -1;
        if (options.autoInit !== false) {
            this.init();
        }
    }

    async init() {
        super.init();
        this.data = await this.resolveDataSource();
        await this.render();
        this.bindEvents();
        await this.loadTabContent(0);
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.tabs');
        this.loaderState = attachLoaderState(this, {
            host: this.element,
            busyTarget: this.element,
            scope: 'block',
            defaultMessage: 'Loading tab...'
        });
        this.stateBinding = attachComponentStateBinding(this, {
            defaultPath: 'tabs',
            eventName: 'tabchange',
            getSnapshot: (component) => component.getBindableState(),
            applySnapshot: (component, snapshot) => component.applyBindableState(snapshot)
        });
        this.renderDataTabs();
        this.refreshTabs();
        await this.switchToTab(0, false);
    }

    renderDataTabs() {
        const tabbar = this.element?.querySelector('.tabbar');
        const panels = this.element?.querySelector('.tab_content_panels');
        if (!tabbar || !panels) return;

        tabbar.replaceChildren();
        panels.replaceChildren();

        this.data.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'link';

            const link = document.createElement('a');
            link.href = '#';
            link.dataset.tab = String(index);
            link.textContent = item?.label || `Tab ${index + 1}`;

            const controls = document.createElement('span');
            controls.className = 'tab-controls';

            const refreshBtn = document.createElement('button');
            refreshBtn.className = 'tab-refresh';
            refreshBtn.title = 'Refresh';
            refreshBtn.type = 'button';
            refreshBtn.textContent = 'R';

            const closeBtn = document.createElement('button');
            closeBtn.className = 'close-tab';
            closeBtn.title = 'Close';
            closeBtn.type = 'button';
            closeBtn.textContent = 'X';

            controls.append(refreshBtn, closeBtn);
            link.appendChild(controls);
            li.appendChild(link);
            tabbar.appendChild(li);

            const panel = document.createElement('div');
            panel.className = 'tab_content_panel';
            panel.id = `tab-${index}`;

            const content = document.createElement('div');
            content.className = 'tab_content';
            panel.appendChild(content);
            panels.appendChild(panel);
        });
    }

    refreshTabs() {
        const links = this.element?.querySelectorAll('[data-tab]') || [];
        const panels = this.element?.querySelectorAll('.tab_content_panel, .tab-content-panel') || [];
        this.tabs = Array.from(links).map((link, index) => ({
            link,
            panel: panels[index]
        })).filter((tab) => tab.panel);
    }

    async loadTabContent(index, forceRefresh = false) {
        this.refreshTabs();
        const tab = this.tabs[index];
        if (!tab) return;

        const panel = tab.panel;
        const cacheKey = `tab-${index}`;

        if (this.cacheContent && this.panelCache.has(cacheKey) && !forceRefresh) {
            this.setPanelContent(panel, this.panelCache.get(cacheKey));
            this.updateLoaderState(index, false);
            return;
        }

        this.updateLoaderState(index, true);

        try {
            const content = await this.fetchTabContent(index);
            if (this.cacheContent) this.panelCache.set(cacheKey, content);
            this.setPanelContent(panel, content);
            this.updateLoaderState(index, false);
        } catch (error) {
            this.setPanelError(panel, 'Load failed');
            this.updateLoaderState(index, false);
        }
    }

    getPanelContentElement(panel) {
        return panel.querySelector('.tab_content') || panel.querySelector('.tab-content');
    }

    setPanelContent(panel, content) {
        const contentEl = this.getPanelContentElement(panel);
        if (!contentEl) return;

        if (content instanceof Node) {
            contentEl.replaceChildren(content);
            return;
        }

        contentEl.textContent = content == null ? '' : String(content);
    }

    setPanelError(panel, message) {
        const contentEl = this.getPanelContentElement(panel);
        if (!contentEl) return;
        const errorEl = document.createElement('div');
        errorEl.className = 'error';
        errorEl.textContent = message;
        contentEl.replaceChildren(errorEl);
    }

    getContentProviders() {
        return this.container.contentProviders || window.contentProviders || {};
    }

    async resolveDataSource() {
        const dataSource = this.container.dataset.source;
        if (!dataSource) return [];

        await this.ensureProviderInstance();

        return this.contentProviderInstance?.resolve(dataSource) || [];
    }

    async ensureProviderInstance() {
        if (this.contentProviderInstance) return this.contentProviderInstance;

        const providers = this.getContentProviders();
        const providerClass = providers[this.providerName];

        if (!providerClass) {
            console.warn(`No ContentProvider "${this.providerName}" found`);
            return null;
        }

        const context = window.appState || window.pageContext || {};
        if (typeof providerClass === 'function') {
            this.contentProviderInstance = new providerClass(context);
            await this.contentProviderInstance.init?.();
        } else if (typeof providerClass === 'object') {
            this.contentProviderInstance = providerClass;
        } else {
            this.contentProviderInstance = null;
        }
        return this.contentProviderInstance;
    }

    updateLoaderState(index, isLoading) {
        const cacheKey = `tab-${index}`;
        this.loadingStates.set(cacheKey, isLoading);
        if (index === this.activeIndex || this.activeIndex < 0) {
            const label = this.data?.[index]?.label || `Tab ${index + 1}`;
            this.loaderState?.setLoading?.(isLoading, `Loading ${label}...`);
        }

        const loader = this.element?.querySelector(`[data-loader="tab-${index}"]`);
        if (loader) {
            this.dispatchEvent('staterefresh', { path: `loadingStates['tab-${index}']`, value: isLoading });
        }
    }

    async fetchTabContent(index) {
        await this.ensureProviderInstance();

        const tabData = this.data[index];
        const tab = this.tabs[index];
        if (tab?.link?.dataset.src) {
            const res = await fetch(tab.link.dataset.src);
            return await res.text();
        }

        return await this.contentProviderInstance?.getContent(tabData, index) || '';
    }

    bindEvents() {
        this.on('click', async (e) => {
            const tabLink = e.target.closest('[data-tab]');
            if (tabLink) {
                e.preventDefault();
                const index = parseInt(tabLink.dataset.tab, 10);
                await this.switchToTab(index);
            }

            if (e.target.closest('.tab-refresh')) {
                const index = parseInt(e.target.closest('[data-tab]')?.dataset.tab || '-1', 10);
                if (index >= 0) await this.refreshTab(index);
            }

            if (e.target.closest('.close-tab')) {
                const index = parseInt(e.target.closest('[data-tab]')?.dataset.tab || '-1', 10);
                if (index >= 0) this.removeTab(index);
            }
        });

        this.on('keydown', (e) => {
            if (e.target.closest('.tabbar')) {
                this.handleKeyboardNavigation?.(e);
            }
        });
    }

    async switchToTab(index, loadContent = true) {
        this.refreshTabs();
        if (index < 0 || index >= this.tabs.length || index === this.activeIndex) {
            return;
        }

        this.updateTabVisuals(index);
        this.activeIndex = index;

        if (loadContent) {
            await this.loadTabContent(index);
        }

        this.dispatchEvent('tabchange', {
            index,
            data: this.data[index],
            fromCache: this.panelCache.has(`tab-${index}`)
        });
    }

    updateTabVisuals(index) {
        this.tabs.forEach((tab, i) => {
            const isActive = i === index;
            const linkEl = tab.link?.parentElement;

            if (linkEl) {
                linkEl.classList.toggle('active', isActive);
                tab.link?.setAttribute('aria-selected', String(isActive));
                tab.link?.setAttribute('tabindex', isActive ? '0' : '-1');
            }

            tab.panel.hidden = !isActive;
            tab.panel.setAttribute('aria-hidden', String(!isActive));
        });
    }

    async refreshTab(index) {
        this.panelCache.delete(`tab-${index}`);
        await this.loadTabContent(index, true);
    }

    bindDataContext(element, dataItem, index) {
        super.bindDataContext?.(element, dataItem, index);
        const link = element.querySelector('a[data-tab]');
        if (link) {
            link.dataset.tab = String(index);
        }
    }

    addTab(label, contentUrl, index = this.tabs.length) {
        const tabData = { label, contentUrl };
        this.data.splice(index, 0, tabData);
        this.refresh();
        this.switchToTab(index);
    }

    removeTab(index) {
        this.refreshTabs();
        if (this.tabs.length <= 1) return;

        this.panelCache.delete(`tab-${index}`);
        this.loadingStates.delete(`tab-${index}`);
        this.data.splice(index, 1);
        this.refresh();
    }

    clearCache() {
        this.panelCache.clear();
        this.loadingStates.clear();
    }

    getBindableState() {
        return {
            activeIndex: this.activeIndex,
            label: this.data?.[this.activeIndex]?.label || ''
        };
    }

    applyBindableState(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return;
        const index = Number(snapshot.activeIndex);
        if (!Number.isInteger(index)) return;
        if (index < 0 || index >= this.tabs.length) return;
        if (index === this.activeIndex) return;
        void this.switchToTab(index, true);
    }

    destroy() {
        this.loaderState?.destroy?.();
        this.stateBinding?.disconnect?.();
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.TabsComponent = TabsComponent;
}

export { TabsComponent };
