import { Component } from './component.js';
import { attachLoaderState } from '../utils/loader_state.js';
import { attachComponentStateBinding } from '../utils/component_state_binding.js';
import { copyAttributes, readNativeValue, serializeSelectOptions } from '../utils/native_host.js';

class DropdownComponent extends Component {
    static get selector() {
        return 'dropdown';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'dropdown';
    }

    static templateId = 'dropdown-template';

    static getNativeSelectors() {
        return [
            'select[component="dropdown"]',
            'select[role="dropdown"]'
        ];
    }

    static prepareHost(element) {
        if (!(element instanceof HTMLSelectElement)) return element;

        const host = document.createElement('section');
        copyAttributes(element, host, {
            exclude: ['component', 'role']
        });
        host.setAttribute('component', 'dropdown');
        host.setAttribute('data-items', JSON.stringify(serializeSelectOptions(element)));
        host.setAttribute('value', readNativeValue(element));
        element.replaceWith(host);
        return host;
    }

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = this.constructor.templateId || DropdownComponent.templateId;
        this.config = {
            endpoint: this.container.getAttribute('data-source')
                || this.container.getAttribute('data-endpoint')
                || this.container.getAttribute('endpoint')
                || '',
            valueField: this.container.getAttribute('data-value-field') || 'value',
            labelField: this.container.getAttribute('data-label-field') || 'label',
            pageSize: Math.max(1, Number(this.container.getAttribute('data-page-size')) || 30),
            minQueryLength: Math.max(0, Number(this.container.getAttribute('data-min-query')) || 0),
            debounceMs: Math.max(0, Number(this.container.getAttribute('data-debounce-ms')) || 200),
            loaderMinMs: Math.max(0, Number(this.container.getAttribute('data-loader-min-ms')) || 180),
            autoSuggest: this.readBooleanAttr('data-auto-suggest', true),
            placeholder: this.container.getAttribute('placeholder') || this.container.getAttribute('data-placeholder') || 'Select...',
            noCache: this.readBooleanAttr('no-cache', false),
            localItems: this.parseItemsAttr('data-items'),
            localFilterMap: this.parseObjectAttr('data-local-filter-map'),
            requestParams: this.parseObjectAttr('data-request-params'),
            clearOnPpr: this.readBooleanAttr('data-ppr-clear', true),
            autoLoadOnPpr: this.readBooleanAttr('data-ppr-autoload', true)
        };
        this.state = {
            open: false,
            loading: false,
            query: '',
            page: 1,
            hasMore: false,
            activeIndex: -1,
            selected: null,
            items: [],
            allLocalItems: [],
            filteredLocalItems: []
        };
        this.remoteCache = new Map();
        this.remoteRequestSeq = 0;
        this.fetchTimer = null;
        this.boundOutsideClick = (event) => this.handleOutsideClick(event);
        this.init();
    }

    readBooleanAttr(attrName, defaultValue) {
        if (!this.container.hasAttribute(attrName)) return defaultValue;
        const value = String(this.container.getAttribute(attrName) || '').trim().toLowerCase();
        if (!value) return true;
        return value !== 'false' && value !== '0' && value !== 'no';
    }

    parseItemsAttr(attrName) {
        const raw = String(this.container.getAttribute(attrName) || '').trim();
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            return [];
        }
    }

    parseObjectAttr(attrName) {
        const raw = String(this.container.getAttribute(attrName) || '').trim();
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    validateStructure() {
        super.validateStructure();
        if (!this.container) {
            throw new Error('Dropdown requires a container');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-dropdown');
        this.input = this.container.querySelector('[data-role="input"]');
        this.valueInput = this.container.querySelector('[data-role="value"]');
        this.list = this.container.querySelector('[data-role="list"]');
        this.panel = this.container.querySelector('[data-role="panel"]');
        this.loadingEl = this.container.querySelector('[data-role="loading"]');
        this.emptyEl = this.container.querySelector('[data-role="empty"]');
        this.toggleButton = this.container.querySelector('[data-action="toggle"]');
        this.loaderState = attachLoaderState(this, {
            host: this.panel || this.element,
            busyTarget: this.panel || this.element,
            scope: 'block',
            defaultMessage: 'Loading options...'
        });
        this.stateBinding = attachComponentStateBinding(this, {
            defaultPath: 'dropdown',
            eventName: 'dropdownselect',
            getSnapshot: (component) => component.getBindableState(),
            applySnapshot: (component, snapshot) => component.applyBindableState(snapshot)
        });

        this.input.placeholder = this.config.placeholder;

        this.state.allLocalItems = this.normalizeItems(this.collectLocalItems());
        this.state.filteredLocalItems = [...this.state.allLocalItems];
        this.state.items = [...this.state.filteredLocalItems];
        this.state.activeIndex = this.state.items.length ? 0 : -1;
        this.state.hasMore = false;
        this.renderItems();
        const defaultValue = this.container.getAttribute('value') || this.container.getAttribute('data-value');
        if (defaultValue) this.value = defaultValue;
        this.bindEvents();
    }

    collectLocalItems() {
        const fromOptions = Array.from(this.container.querySelectorAll('option')).map((option) => ({
            value: option.value,
            label: option.textContent || option.value
        }));
        if (fromOptions.length) return fromOptions;
        return this.config.localItems || [];
    }

    normalizeItems(items) {
        return (items || []).map((item) => {
            if (item && typeof item === 'object') {
                const value = item[this.config.valueField] ?? item.value ?? item.id ?? item.code ?? '';
                const label = item[this.config.labelField] ?? item.label ?? item.name ?? String(value || '');
                return {
                    value: value == null ? '' : String(value),
                    label: label == null ? '' : String(label),
                    item
                };
            }
            return {
                value: String(item ?? ''),
                label: String(item ?? ''),
                item
            };
        });
    }

    bindEvents() {
        this.input.addEventListener('focus', () => {
            this.open();
            if (this.config.endpoint && !this.config.autoSuggest) {
                void this.loadRemotePage(1, false);
            }
        });

        this.input.addEventListener('input', () => {
            const query = String(this.input.value || '').trim();
            this.state.query = query;
            this.open();
            if (this.config.endpoint) {
                this.debounceRemoteQuery();
            } else {
                this.applyLocalFilter();
            }
        });

        this.input.addEventListener('keydown', (event) => {
            this.handleKeydown(event);
        });

        this.toggleButton?.addEventListener('click', () => {
            if (this.state.open) {
                this.close();
                return;
            }
            this.open();
            if (this.config.endpoint) {
                void this.loadRemotePage(1, false);
            }
        });

        this.list?.addEventListener('click', (event) => {
            const itemEl = event.target?.closest?.('[data-role="item"]');
            if (!itemEl) return;
            const index = Number(itemEl.getAttribute('data-index'));
            if (Number.isNaN(index) || index < 0 || index >= this.state.items.length) return;
            this.selectItem(this.state.items[index]);
        });

        this.panel?.addEventListener('scroll', () => {
            void this.handleScrollLoad();
        });

        document.addEventListener('click', this.boundOutsideClick);
    }

    handleOutsideClick(event) {
        if (!this.container.contains(event.target)) {
            this.close();
        }
    }

    debounceRemoteQuery() {
        if (this.fetchTimer) clearTimeout(this.fetchTimer);
        this.fetchTimer = setTimeout(() => {
            void this.loadRemotePage(1, false);
        }, this.config.debounceMs);
    }

    applyLocalFilter() {
        const criteria = this.resolveLocalFilterCriteria();
        if (criteria && Object.keys(criteria).length === 0) {
            this.state.filteredLocalItems = [];
        } else if (criteria) {
            this.state.filteredLocalItems = this.state.allLocalItems.filter((item) => {
                return Object.entries(criteria).every(([field, expected]) => {
                    const actual = item?.item?.[field];
                    return String(actual ?? '') === String(expected);
                });
            });
        } else {
            this.state.filteredLocalItems = [...this.state.allLocalItems];
        }

        const query = String(this.state.query || '').trim().toLowerCase();
        if (query) {
            this.state.filteredLocalItems = this.state.allLocalItems.filter((item) => {
                const matchesQuery = item.label.toLowerCase().includes(query) || item.value.toLowerCase().includes(query);
                if (!matchesQuery) return false;
                if (!criteria) return true;
                if (Object.keys(criteria).length === 0) return false;
                return Object.entries(criteria).every(([field, expected]) => {
                    const actual = item?.item?.[field];
                    return String(actual ?? '') === String(expected);
                });
            });
        }
        this.state.items = [...this.state.filteredLocalItems];
        this.state.hasMore = false;
        this.renderItems();
    }

    resolveLocalFilterCriteria() {
        const entries = Object.entries(this.config.localFilterMap || {});
        if (!entries.length) return null;

        const criteria = {};
        for (let i = 0; i < entries.length; i += 1) {
            const [field, expression] = entries[i];
            if (!field) continue;
            const rawExpr = String(expression || '').trim();
            if (!rawExpr) continue;
            const expr = this.extractExpression(rawExpr);
            const value = this.evaluateExpression(expr, this.getBindingContext());
            if (value == null || value === '') {
                return {};
            }
            criteria[field] = value;
        }

        return Object.keys(criteria).length ? criteria : null;
    }

    async loadRemotePage(page = 1, append = false) {
        if (!this.config.endpoint) return;
        const query = String(this.state.query || '').trim();
        if (query.length > 0 && query.length < this.config.minQueryLength) {
            return;
        }

        const requestSeq = ++this.remoteRequestSeq;
        const startedAt = Date.now();
        const cacheKey = `${query}|${page}|${this.config.pageSize}`;
        if (!this.config.noCache && this.remoteCache.has(cacheKey)) {
            const cached = this.remoteCache.get(cacheKey);
            this.applyRemotePayload(cached, append, page);
            return;
        }

        this.setLoading(true);
        try {
            const url = this.buildRemoteUrl(page, query);
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (!this.config.noCache) this.remoteCache.set(cacheKey, payload);
            if (requestSeq !== this.remoteRequestSeq) return;
            this.applyRemotePayload(payload, append, page);
        } catch (_error) {
            if (requestSeq !== this.remoteRequestSeq) return;
            if (!append) {
                this.state.items = [];
                this.state.hasMore = false;
                this.renderItems();
            }
        } finally {
            if (requestSeq !== this.remoteRequestSeq) return;
            const elapsed = Date.now() - startedAt;
            const remaining = this.config.loaderMinMs - elapsed;
            if (remaining > 0) {
                await new Promise((resolve) => setTimeout(resolve, remaining));
            }
            this.setLoading(false);
        }
    }

    buildRemoteUrl(page, query) {
        const hasQuery = this.config.endpoint.includes('?');
        const params = new URLSearchParams({
            page: String(page),
            limit: String(this.config.pageSize),
            q: query
        });
        const extraParams = this.resolveRequestParams();
        Object.entries(extraParams).forEach(([key, value]) => {
            if (value == null || value === '') return;
            params.set(key, String(value));
        });
        return `${this.config.endpoint}${hasQuery ? '&' : '?'}${params.toString()}`;
    }

    resolveRequestParams() {
        const entries = Object.entries(this.config.requestParams || {});
        if (!entries.length) return {};

        const resolved = {};
        entries.forEach(([paramName, expression]) => {
            if (!paramName) return;
            const rawExpr = String(expression || '').trim();
            if (!rawExpr) return;
            const expr = this.extractExpression(rawExpr);
            const value = this.evaluateExpression(expr, this.getBindingContext());
            if (typeof value !== 'undefined' && value !== null && value !== '') {
                resolved[paramName] = value;
            }
        });
        return resolved;
    }

    applyRemotePayload(payload, append, page) {
        const rows = Array.isArray(payload?.rows)
            ? payload.rows
            : Array.isArray(payload?.items)
                ? payload.items
                : Array.isArray(payload?.data)
                    ? payload.data
                    : [];

        const normalized = this.filterNormalizedItems(this.normalizeItems(rows), this.state.query);
        this.state.page = page;
        this.state.hasMore = this.resolveHasMore(payload, rows.length, page);
        this.state.items = append ? [...this.state.items, ...normalized] : normalized;
        if (!append) {
            this.state.activeIndex = this.state.items.length ? 0 : -1;
        } else if (this.state.activeIndex < 0 && this.state.items.length) {
            this.state.activeIndex = 0;
        }
        this.renderItems();
    }

    resolveHasMore(payload, count, page) {
        if (typeof payload?.hasMore === 'boolean') return payload.hasMore;
        const totalPages = Number(payload?.totalPages || 0);
        if (totalPages > 0) return page < totalPages;
        const totalCount = Number(payload?.totalCount || 0);
        if (totalCount > 0) return page * this.config.pageSize < totalCount;
        return count >= this.config.pageSize;
    }

    filterNormalizedItems(items, query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return items;
        return items.filter((item) => {
            const label = String(item?.label || '').toLowerCase();
            const value = String(item?.value || '').toLowerCase();
            return label.includes(q) || value.includes(q);
        });
    }

    async handleScrollLoad() {
        if (!this.state.open || !this.state.hasMore || this.state.loading || !this.panel) return;
        const nearBottom = this.panel.scrollTop + this.panel.clientHeight >= this.panel.scrollHeight - 32;
        if (!nearBottom) return;
        await this.loadRemotePage(this.state.page + 1, true);
    }

    setLoading(loading) {
        this.state.loading = !!loading;
        if (this.loadingEl) this.loadingEl.hidden = !loading;
        this.loaderState?.setLoading?.(this.state.loading, 'Loading options...');
    }

    renderItems() {
        if (!this.list) return;
        this.list.replaceChildren();
        const listId = this.list.id || `${this.constructor.componentName || 'dropdown'}-${Math.random().toString(16).slice(2)}`;
        this.list.id = listId;
        this.input?.setAttribute('aria-controls', listId);

        this.state.items.forEach((item, index) => {
            const li = document.createElement('li');
            const itemId = `${listId}-item-${index}`;
            li.id = itemId;
            li.setAttribute('data-role', 'item');
            li.setAttribute('data-index', String(index));
            li.setAttribute('role', 'option');
            li.setAttribute('data-value', item.value);
            li.setAttribute('aria-selected', this.state.activeIndex === index ? 'true' : 'false');
            li.textContent = item.label;
            if (this.state.activeIndex === index) {
                li.classList.add('is-active');
                this.input?.setAttribute('aria-activedescendant', itemId);
            }
            this.list.appendChild(li);
        });

        if (this.state.items.length === 0) {
            this.state.activeIndex = -1;
            this.input?.removeAttribute('aria-activedescendant');
        } else if (this.state.activeIndex >= this.state.items.length) {
            this.state.activeIndex = this.state.items.length - 1;
            this.updateActiveItem(true);
        }

        if (this.emptyEl) {
            this.emptyEl.hidden = this.state.items.length > 0 || this.state.loading;
        }
    }

    selectItem(item) {
        if (this.input) this.input.value = item.label;
        if (this.valueInput) this.valueInput.value = item.value;
        this.state.selected = item;
        this.dispatchEvent('dropdownselect', {
            label: item.label,
            value: item.value,
            item: item.item || null
        });
        this.close();
    }

    open() {
        this.state.open = true;
        if (this.panel) this.panel.hidden = false;
        if (this.input) this.input.setAttribute('aria-expanded', 'true');
        if (this.state.activeIndex < 0 && this.state.items.length > 0) {
            this.state.activeIndex = 0;
            this.updateActiveItem(false);
        }
    }

    close() {
        this.state.open = false;
        if (this.panel) this.panel.hidden = true;
        if (this.input) this.input.setAttribute('aria-expanded', 'false');
        if (this.input) this.input.removeAttribute('aria-activedescendant');
    }

    handleKeydown(event) {
        const key = event.key;
        if (key === 'Escape') {
            event.preventDefault();
            this.close();
            return;
        }

        if (key === 'ArrowDown') {
            event.preventDefault();
            if (!this.state.open) this.open();
            this.moveActive(1);
            return;
        }

        if (key === 'ArrowUp') {
            event.preventDefault();
            if (!this.state.open) this.open();
            this.moveActive(-1);
            return;
        }

        if (key === 'Enter') {
            if (!this.state.open) return;
            event.preventDefault();
            if (this.state.activeIndex >= 0 && this.state.activeIndex < this.state.items.length) {
                this.selectItem(this.state.items[this.state.activeIndex]);
            }
        }
    }

    moveActive(step) {
        if (!this.state.items.length) return;
        const length = this.state.items.length;
        const current = this.state.activeIndex < 0 ? 0 : this.state.activeIndex;
        this.state.activeIndex = (current + step + length) % length;
        this.updateActiveItem(true);
    }

    updateActiveItem(ensureVisible) {
        const nodes = Array.from(this.list?.querySelectorAll('[data-role="item"]') || []);
        nodes.forEach((node) => {
            const index = Number(node.getAttribute('data-index'));
            const active = index === this.state.activeIndex;
            node.classList.toggle('is-active', active);
            node.setAttribute('aria-selected', active ? 'true' : 'false');
            if (active) {
                this.input?.setAttribute('aria-activedescendant', node.id);
                if (ensureVisible) {
                    node.scrollIntoView({ block: 'nearest' });
                }
            }
        });
    }

    get value() {
        return this.valueInput?.value || '';
    }

    set value(nextValue) {
        const value = nextValue == null ? '' : String(nextValue);
        const found = this.state.items.find((item) => item.value === value)
            || this.state.allLocalItems.find((item) => item.value === value);
        if (!found) {
            if (this.valueInput) this.valueInput.value = value;
            return;
        }
        this.selectItem(found);
    }

    getBindableState() {
        return {
            query: this.state.query || '',
            value: this.value,
            label: this.input?.value || ''
        };
    }

    getStateSnapshot() {
        return {
            open: !!this.state.open,
            value: this.value,
            label: this.input?.value || '',
            selected: this.state.selected
                ? {
                    value: this.state.selected.value,
                    label: this.state.selected.label
                }
                : null
        };
    }

    shouldDispatchPprChange(path, _value, initial) {
        if (initial) return true;
        return path === 'selected';
    }

    applyBindableState(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return;
        if (typeof snapshot.query === 'string' && snapshot.query !== this.state.query) {
            this.state.query = snapshot.query;
            if (this.input) this.input.value = snapshot.query;
        }
        if (snapshot.value !== undefined && snapshot.value !== null) {
            const next = String(snapshot.value);
            if (next !== this.value) this.value = next;
        }
    }

    handlePprUpdate(_detail = {}) {
        this.refreshPpr();
    }

    refreshPpr() {
        if (this.config.clearOnPpr) {
            this.state.query = '';
            this.state.selected = null;
            this.state.page = 1;
            this.state.hasMore = false;
            this.state.activeIndex = -1;
            if (this.input) this.input.value = '';
            if (this.valueInput) this.valueInput.value = '';
        }

        if (this.config.endpoint) {
            this.remoteCache.clear();
            this.state.items = [];
            this.renderItems();
            if (this.config.autoLoadOnPpr) {
                void this.loadRemotePage(1, false);
            }
            return;
        }

        this.state.allLocalItems = this.normalizeItems(this.collectLocalItems());
        this.applyLocalFilter();
    }

    destroy() {
        if (this.fetchTimer) {
            clearTimeout(this.fetchTimer);
            this.fetchTimer = null;
        }
        this.loaderState?.destroy?.();
        this.stateBinding?.disconnect?.();
        document.removeEventListener('click', this.boundOutsideClick);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.DropdownComponent = DropdownComponent;
}

export { DropdownComponent };
