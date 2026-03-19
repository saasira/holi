import { Component } from './component.js';
import { ObjectDetailsDialog } from '../utils/object_details_dialog.js';
import { attachLoaderState } from '../utils/loader_state.js';
import { attachComponentStateBinding } from '../utils/component_state_binding.js';

class DataGrid extends Component {
    static get selector() {
        return 'datagrid';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'datagrid';
    }

    static templateId = 'datagrid-template';

    constructor(containerOrOptions, maybeOptions = {}) {
        const normalized = DataGrid.normalizeArgs(containerOrOptions, maybeOptions);
        super(normalized.container, normalized.config);

        this.templateId = DataGrid.templateId;
        this.parent = normalized.parent;
        this.textProvider = normalized.textProvider;
        this.config = {
            localLimit: 10000,
            remoteLimit: 50,
            endpoint: this.container?.getAttribute('data-endpoint') || this.container?.getAttribute('endpoint') || null,
            serverSide: this.container?.hasAttribute('server-side') || false,
            mode: this.resolveMode(this.container),
            pageSize: Number(this.container?.getAttribute('data-page-size')) || 24,
            infiniteChunkSize: Number(this.container?.getAttribute('data-infinite-chunk')) || 24,
            titleField: this.container?.getAttribute('data-title-field') || null,
            iconField: this.container?.getAttribute('data-icon-field') || null,
            avatarField: this.container?.getAttribute('data-avatar-field') || null,
            mandatoryFields: this.parseFieldListAttr('data-mandatory-fields'),
            priorityFields: this.parseFieldListAttr('data-priority-fields'),
            readonlyFields: this.parseFieldListAttr('data-readonly-fields'),
            fieldMetadata: this.parseMetadataAttr('data-field-metadata'),
            idField: String(this.container?.getAttribute('data-id-field') || 'id'),
            detailsSource: this.container?.getAttribute('data-details-source') || this.container?.getAttribute('details-source') || '',
            detailsCacheEnabled: this.parseBooleanAttr('data-details-cache', true),
            detailsCacheMaxSize: this.parsePositiveIntAttr('data-details-cache-size', 100),
            detailsCacheTTL: this.parsePositiveIntAttr('data-details-cache-ttl', 0),
            createMethod: String(this.container?.getAttribute('data-create-method') || 'POST').toUpperCase(),
            updateMethod: String(this.container?.getAttribute('data-update-method') || 'PUT').toUpperCase(),
            rows: [],
            headers: [],
            visibleFields: [],
            ...normalized.config
        };
        this.config.endpointTemplate = this.config.endpoint;
        this.config.requestParams = this.parseObjectAttr('data-request-params');

        this.rawRows = [];
        this.processedRows = [];
        this.remoteLoaded = false;
        this.loadingMore = false;
        this.windowScrollHandler = null;
        this.localCardPool = [];
        this.localCardsVersion = 0;
        this.localCardsRenderedVersion = -1;

        this.state = {
            rows: [],
            headers: [],
            page: 1,
            totalPages: 1,
            totalCount: 0,
            sortField: null,
            sortDir: 'asc',
            searchTerm: '',
            filters: {},
            visibleFields: [],
            fieldChooserOpen: false,
            hasMore: false,
            visibleStart: 0,
            visibleEnd: 0
        };
        this.mandatoryFieldsResolved = [];
        this.priorityFieldsResolved = [];
        this.detailsDialog = new ObjectDetailsDialog();
        this.detailsCache = new Map();

        if (normalized.autoInit !== false) {
            this.init();
        }
    }

    static normalizeArgs(containerOrOptions, maybeOptions) {
        if (containerOrOptions instanceof Element) {
            return {
                container: containerOrOptions,
                config: maybeOptions || {},
                autoInit: true
            };
        }

        const options = containerOrOptions || {};
        return {
            container: options.container,
            parent: options.parent,
            textProvider: options.textProvider || null,
            config: options.config || {},
            autoInit: options.autoInit
        };
    }

    validateStructure() {
        super.validateStructure();
        if (!this.container) {
            throw new Error('DataGrid requires a container element');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-datagrid');
        this.contentEl = this.element?.querySelector('.datagrid-content');
        this.cardsHost = this.element?.querySelector('[data-role="cards"]');
        this.fieldChooser = this.element?.querySelector('[data-role="field-chooser"]');
        this.fieldChooserList = this.element?.querySelector('[data-role="field-chooser-list"]');
        this.resultCount = this.element?.querySelector('[data-role="result-count"]');
        this.pageInfo = this.element?.querySelector('[data-role="page-info"]');
        this.paginationControls = this.element?.querySelector('[data-role="pagination-controls"]');
        this.sortFieldSelect = this.element?.querySelector('[data-action="sort-field"]');
        this.sortDirectionButton = this.element?.querySelector('[data-action="sort-direction"]');
        this.requestStatus = this.element?.querySelector('[data-role="request-status"]');
        this.requestStatusText = this.element?.querySelector('[data-role="request-status-text"]');
        this.retryButton = this.element?.querySelector('[data-action="retry-load"]');
        this.loaderState = attachLoaderState(this, {
            host: this.element,
            busyTarget: this.contentEl || this.element,
            scope: 'block',
            defaultMessage: 'Loading data...'
        });
        this.stateBinding = attachComponentStateBinding(this, {
            defaultPath: 'datagrid',
            eventName: 'stateupdate',
            getSnapshot: (component) => component.getBindableState(),
            applySnapshot: (component, snapshot) => component.applyBindableState(snapshot)
        });
        this.initEventDelegation();
        this.initScrollingMode();
        await this.loadData();
    }

    initEventDelegation() {
        if (!this.element) return;
        this.element.addEventListener('click', (e) => this.handleAction(e));
        this.element.addEventListener('input', (e) => this.handleInput(e));
        this.element.addEventListener('change', (e) => this.handleChange(e));
    }

    handleAction(e) {
        const actionEl = e.target?.closest?.('[data-action]');
        const action = actionEl?.dataset?.action;
        if (!action) return;

        if (action === 'toggle-fields') {
            this.state.fieldChooserOpen = !this.state.fieldChooserOpen;
            this.renderFieldChooser();
            return;
        }

        if (action === 'add-row') {
            void this.openDetailsDialog('add');
            return;
        }

        if (action === 'view-row' || action === 'edit-row') {
            const rowIndex = Number(actionEl?.dataset?.rowIndex);
            if (Number.isNaN(rowIndex) || rowIndex < 0) return;
            const localRows = this.isLocalDomReuseEnabled() ? this.processedRows : this.state.rows;
            if (rowIndex >= localRows.length) return;
            const row = localRows[rowIndex];
            void this.openDetailsDialog(action === 'edit-row' ? 'edit' : 'view', row);
            return;
        }

        if (action === 'sort-direction') {
            this.state.sortDir = this.state.sortDir === 'asc' ? 'desc' : 'asc';
            this.resetViewport();
            if (this.config.serverSide) {
                void this.loadData();
            } else {
                this.applyClientProcessing();
                this.updateView();
            }
            return;
        }

        if (action === 'prev-page') {
            void this.gotoPage(this.state.page - 1);
            return;
        }

        if (action === 'next-page') {
            void this.gotoPage(this.state.page + 1);
            return;
        }

        if (action === 'retry-load') {
            void this.retryLoad();
        }
    }

    handleInput(e) {
        const action = e.target?.dataset?.action;
        if (action === 'search') {
            this.state.searchTerm = e.target.value || '';
            this.resetViewport();
            if (this.config.serverSide) {
                void this.loadData();
            } else {
                this.applyClientProcessing();
                this.updateView();
            }
        }
    }

    handleChange(e) {
        const target = e.target;
        const action = target?.dataset?.action;
        const fieldKey = target?.dataset?.field;
        const filterField = target?.dataset?.filter;

        if (action === 'toggle-field' && fieldKey) {
            this.setFieldVisibility(fieldKey, !!target.checked);
            this.updateView();
            return;
        }

        if (action === 'sort-field') {
            const nextField = String(target.value || '').trim();
            this.state.sortField = nextField || null;
            this.resetViewport();
            if (this.config.serverSide) {
                void this.loadData();
            } else {
                this.applyClientProcessing();
                this.updateView();
            }
            return;
        }

        if (filterField) {
            const value = String(target.value || '').trim();
            if (!value || value.toLowerCase() === 'all') {
                delete this.state.filters[filterField];
            } else {
                this.state.filters[filterField] = value;
            }
            this.resetViewport();
            if (this.config.serverSide) {
                void this.loadData();
            } else {
                this.applyClientProcessing();
                this.updateView();
            }
        }
    }

    async loadData() {
        if (this.resolveConfiguredEndpoint()) {
            const ok = await this.loadRemote(this.config.serverSide, false);
            if (!ok) {
                this.updateView();
                return;
            }
        } else {
            await this.loadLocal();
        }

        this.hydrateFilterControls();
        this.hydrateSortControls();
        if (!this.config.serverSide) {
            this.applyClientProcessing();
        }
        this.updateView();
        if (this.config.serverSide && this.config.mode === 'infinite') {
            await this.prefillInfiniteViewport();
        }
    }

    async loadRemote(force = false, append = false) {
        if (this.remoteLoaded && !force && !this.config.serverSide) return true;

        this.setRequestStatus('loading', `Loading page ${this.state.page}...`);
        const endpoint = this.buildEndpointUrl(true);
        if (!endpoint) return false;

        let data;
        try {
            const response = await fetch(endpoint);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            data = await response.json();
        } catch (_error) {
            this.setRequestStatus('error', 'Request failed');
            return false;
        }

        const rows = Array.isArray(data.rows) ? data.rows : [];
        this.rawRows = rows;
        const headers = Array.isArray(data.headers) ? data.headers.map((h) => ({
            ...h,
            visible: h.visible !== false
        })) : this.deriveHeaders(rows);

        this.state.headers = headers;
        this.state.totalPages = Number(data.totalPages) || 1;
        this.state.totalCount = Number(data.totalCount) || rows.length;

        if (this.state.visibleFields.length === 0) {
            if (Array.isArray(data.visibleFields) && data.visibleFields.length) {
                this.state.visibleFields = [...data.visibleFields];
            } else {
                this.state.visibleFields = headers.filter((h) => h.visible).map((h) => h.field);
            }
        }
        this.applyChooserPoliciesForFields();

        if (this.config.serverSide) {
            this.state.rows = append ? [...this.state.rows, ...rows] : rows;
            this.processedRows = [...this.state.rows];
            this.state.hasMore = this.config.mode === 'infinite' && this.state.page < this.state.totalPages;
            if (this.config.mode === 'infinite' && !this.state.hasMore) {
                this.setRequestStatus('end', 'No more records');
            } else {
                this.setRequestStatus('idle', '');
            }
            return true;
        }

        this.remoteLoaded = true;
        this.setRequestStatus('idle', '');
        return true;
    }

    async loadLocal() {
        this.rawRows = Array.isArray(this.config.rows) ? this.config.rows : [];
        this.state.headers = Array.isArray(this.config.headers)
            ? this.config.headers.map((h) => ({ ...h, visible: h.visible !== false }))
            : this.deriveHeaders(this.rawRows);
        this.state.totalPages = 1;
        this.state.totalCount = this.rawRows.length;
        if (Array.isArray(this.config.visibleFields) && this.config.visibleFields.length) {
            this.state.visibleFields = [...this.config.visibleFields];
        } else {
            this.state.visibleFields = this.state.headers.filter((h) => h.visible).map((h) => h.field);
        }
        this.applyChooserPoliciesForFields();
    }

    buildEndpointUrl(includeQuery) {
        const endpoint = this.resolveConfiguredEndpoint();
        if (!endpoint) return '';
        if (!includeQuery) return endpoint;
        const limit = this.config.mode === 'pagination'
            ? this.config.pageSize
            : this.config.mode === 'infinite'
                ? this.config.infiniteChunkSize
                : this.config.remoteLimit;

        const params = new URLSearchParams({
            page: String(this.state.page),
            limit: String(limit),
            sort: `${this.state.sortField || ''},${this.state.sortDir}`,
            q: this.state.searchTerm,
            ...this.state.filters
        });
        const extraParams = this.resolveRequestParams();
        Object.entries(extraParams).forEach(([key, value]) => {
            if (value == null || value === '') return;
            params.set(key, String(value));
        });
        return `${endpoint}?${params}`;
    }

    deriveHeaders(rows) {
        const sample = rows[0];
        if (!sample || typeof sample !== 'object') return [];
        return Object.keys(sample).map((key) => ({
            field: key,
            label: key,
            visible: true
        }));
    }

    applyClientProcessing() {
        let rows = Array.isArray(this.rawRows) ? [...this.rawRows] : [];
        rows = this.applyFilters(rows);
        rows = this.applySearch(rows);
        rows = this.applySort(rows);
        this.processedRows = rows;
        this.bumpLocalCardsVersion();
        this.applyViewport(rows);
    }

    applyViewport(rows) {
        if (this.config.mode === 'pagination') {
            const pageSize = Math.max(1, Number(this.config.pageSize) || 24);
            const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
            this.state.totalPages = totalPages;
            this.state.page = Math.min(Math.max(1, this.state.page), totalPages);
            const start = (this.state.page - 1) * pageSize;
            this.state.rows = rows.slice(start, start + pageSize);
            this.state.hasMore = false;
            this.state.visibleStart = start;
            this.state.visibleEnd = Math.min(start + pageSize, rows.length);
            return;
        }

        if (this.config.mode === 'infinite') {
            const chunk = Math.max(1, Number(this.config.infiniteChunkSize) || 24);
            const visibleCount = this.state.page * chunk;
            this.state.rows = rows.slice(0, visibleCount);
            this.state.hasMore = visibleCount < rows.length;
            this.state.totalPages = 1;
            this.state.visibleStart = 0;
            this.state.visibleEnd = Math.min(visibleCount, rows.length);
            return;
        }

        this.state.rows = rows;
        this.state.totalPages = 1;
        this.state.hasMore = false;
        this.state.visibleStart = 0;
        this.state.visibleEnd = rows.length;
    }

    applyFilters(rows) {
        const filterEntries = Object.entries(this.state.filters || {});
        if (!filterEntries.length) return rows;
        return rows.filter((row) => {
            return filterEntries.every(([field, expected]) => {
                const value = row?.[field];
                if (value == null) return false;
                return String(value).toLowerCase() === String(expected).toLowerCase();
            });
        });
    }

    applySearch(rows) {
        const term = String(this.state.searchTerm || '').trim().toLowerCase();
        if (!term) return rows;

        const fields = this.state.headers.map((h) => h.field);
        return rows.filter((row) => {
            return fields.some((field) => {
                const value = row?.[field];
                return value != null && String(value).toLowerCase().includes(term);
            });
        });
    }

    applySort(rows) {
        const field = this.state.sortField;
        if (!field) return rows;
        const direction = this.state.sortDir === 'desc' ? -1 : 1;
        return rows.sort((a, b) => {
            const av = a?.[field];
            const bv = b?.[field];
            if (av == null && bv == null) return 0;
            if (av == null) return -1 * direction;
            if (bv == null) return 1 * direction;

            const an = Number(av);
            const bn = Number(bv);
            if (!Number.isNaN(an) && !Number.isNaN(bn)) {
                return (an - bn) * direction;
            }

            return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * direction;
        });
    }

    setFieldVisibility(field, visible) {
        if (visible) {
            if (!this.state.visibleFields.includes(field)) {
                this.state.visibleFields.push(field);
            }
        } else {
            if (this.isMandatoryField(field)) return;
            this.state.visibleFields = this.state.visibleFields.filter((f) => f !== field);
        }
        this.state.visibleFields = this.getOrderedVisibleFields(this.state.visibleFields);
        this.bumpLocalCardsVersion();
    }

    hydrateFilterControls() {
        const filters = this.element?.querySelectorAll('[data-filter]');
        if (!filters?.length) return;

        filters.forEach((control) => {
            if (!(control instanceof HTMLSelectElement)) return;
            if (control.options.length > 1) return;

            const field = control.dataset.filter;
            if (!field) return;

            const values = new Set();
            this.rawRows.forEach((row) => {
                if (row?.[field] != null) values.add(String(row[field]));
            });

            const sorted = Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            sorted.forEach((value) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                control.appendChild(option);
            });
        });
    }

    hydrateSortControls() {
        if (!(this.sortFieldSelect instanceof HTMLSelectElement)) return;
        if (this.sortFieldSelect.options.length > 1) return;

        this.state.headers.forEach((header) => {
            const option = document.createElement('option');
            option.value = header.field;
            option.textContent = header.label || header.field;
            this.sortFieldSelect.appendChild(option);
        });
    }

    updateView() {
        this.renderCards();
        if (!this.config.serverSide && this.ensureInfiniteScrollable()) {
            this.renderCards();
        }
        this.renderFieldChooser();
        this.renderSortControls();
        this.renderMeta();
        this.renderPagination();
        this.renderRequestStatus();
        this.dispatchEvent('stateupdate', this.state);
    }

    renderCards() {
        if (!this.cardsHost) return;
        if (this.isLocalDomReuseEnabled()) {
            this.renderCardsWithLocalPool();
            return;
        }
        this.cardsHost.replaceChildren();

        if (!this.state.rows.length) {
            const empty = document.createElement('div');
            empty.className = 'datagrid-empty';
            empty.textContent = 'No matching records';
            this.cardsHost.appendChild(empty);
            return;
        }

        this.state.rows.forEach((row, rowIndex) => {
            this.cardsHost.appendChild(this.createCard(row, rowIndex));
        });
    }

    isLocalDomReuseEnabled() {
        return !this.config.serverSide;
    }

    bumpLocalCardsVersion() {
        this.localCardsVersion += 1;
    }

    renderCardsWithLocalPool() {
        if (!this.cardsHost) return;

        if (!this.processedRows.length) {
            this.localCardPool = [];
            this.localCardsRenderedVersion = this.localCardsVersion;
            this.cardsHost.replaceChildren();
            const empty = document.createElement('div');
            empty.className = 'datagrid-empty';
            empty.textContent = 'No matching records';
            this.cardsHost.appendChild(empty);
            return;
        }

        if (this.localCardsRenderedVersion !== this.localCardsVersion) {
            this.rebuildLocalCardPool();
        } else {
            this.applyLocalCardVisibility();
        }
    }

    rebuildLocalCardPool() {
        if (!this.cardsHost) return;
        this.cardsHost.replaceChildren();
        this.localCardPool = [];
        this.processedRows.forEach((row, rowIndex) => {
            const card = this.createCard(row, rowIndex);
            this.localCardPool.push(card);
            this.cardsHost.appendChild(card);
        });
        this.localCardsRenderedVersion = this.localCardsVersion;
        this.applyLocalCardVisibility();
    }

    applyLocalCardVisibility() {
        const start = Math.max(0, Number(this.state.visibleStart) || 0);
        const end = Math.max(start, Number(this.state.visibleEnd) || 0);
        this.localCardPool.forEach((card, rowIndex) => {
            card.hidden = rowIndex < start || rowIndex >= end;
        });
    }

    createCard(row, rowIndex) {
        const card = document.createElement('article');
        card.className = 'datagrid-card';

        const prominent = this.resolveProminentFields(row);
        const titleVisible = prominent.titleField && this.state.visibleFields.includes(prominent.titleField);
        const iconVisible = prominent.iconField && this.state.visibleFields.includes(prominent.iconField);
        const avatarVisible = prominent.avatarField && this.state.visibleFields.includes(prominent.avatarField);

        if (titleVisible || iconVisible || avatarVisible) {
            const header = document.createElement('header');
            header.className = 'datagrid-card-head';

            if (avatarVisible) {
                const avatar = document.createElement('img');
                avatar.className = 'datagrid-card-avatar';
                avatar.src = String(row[prominent.avatarField] || '');
                avatar.alt = titleVisible ? String(row[prominent.titleField] || '') : 'Avatar';
                header.appendChild(avatar);
            } else if (iconVisible) {
                const icon = document.createElement('span');
                icon.className = 'datagrid-card-icon';
                icon.textContent = String(row[prominent.iconField] || '');
                header.appendChild(icon);
            }

            if (titleVisible) {
                const title = document.createElement('h3');
                title.className = 'datagrid-card-title';
                title.textContent = String(row[prominent.titleField] || '');
                header.appendChild(title);
            }

            card.appendChild(header);
        }

        const body = document.createElement('div');
        body.className = 'datagrid-card-body';
        const labels = this.buildFieldLabelMap();

        this.state.visibleFields.forEach((field) => {
            if (field === prominent.titleField || field === prominent.iconField || field === prominent.avatarField) {
                return;
            }
            const fieldRow = document.createElement('div');
            fieldRow.className = 'datagrid-field';

            const label = document.createElement('span');
            label.className = 'datagrid-field-label';
            label.textContent = labels.get(field) || field;

            const value = document.createElement('span');
            value.className = 'datagrid-field-value';
            value.textContent = row?.[field] == null ? '' : String(row[field]);

            fieldRow.append(label, value);
            body.appendChild(fieldRow);
        });

        card.appendChild(body);

        const actions = document.createElement('footer');
        actions.className = 'datagrid-card-actions';

        const viewBtn = document.createElement('button');
        viewBtn.type = 'button';
        viewBtn.dataset.action = 'view-row';
        viewBtn.dataset.rowIndex = String(rowIndex);
        viewBtn.textContent = 'View';
        actions.appendChild(viewBtn);

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.dataset.action = 'edit-row';
        editBtn.dataset.rowIndex = String(rowIndex);
        editBtn.textContent = 'Edit';
        actions.appendChild(editBtn);

        card.appendChild(actions);
        return card;
    }

    buildFieldLabelMap() {
        const map = new Map();
        this.state.headers.forEach((h) => {
            map.set(h.field, h.label || h.field);
        });
        return map;
    }

    resolveProminentFields(row) {
        const fields = this.state.headers.map((h) => h.field);
        const choose = (preferred, fallbackList) => {
            if (preferred && fields.includes(preferred)) return preferred;
            return fallbackList.find((f) => fields.includes(f)) || null;
        };

        const titleField = choose(this.config.titleField, ['title', 'name', 'customer', 'orderNo', 'id']);
        const iconField = choose(this.config.iconField, ['icon']);
        const avatarField = choose(this.config.avatarField, ['avatar', 'avatarUrl', 'photo', 'image']);

        if (avatarField && row?.[avatarField] == null) {
            return { titleField, iconField, avatarField: null };
        }
        return { titleField, iconField, avatarField };
    }

    renderFieldChooser() {
        if (this.fieldChooser) {
            this.fieldChooser.hidden = !this.state.fieldChooserOpen;
        }
        if (!this.fieldChooserList) return;

        this.fieldChooserList.replaceChildren();
        this.state.headers.forEach((header) => {
            const wrapper = document.createElement('label');
            wrapper.className = 'datagrid-field-option';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.action = 'toggle-field';
            input.dataset.field = header.field;
            input.checked = this.state.visibleFields.includes(header.field);
            input.disabled = this.isMandatoryField(header.field);

            const text = document.createElement('span');
            text.textContent = header.label || header.field;

            wrapper.append(input, text);
            this.fieldChooserList.appendChild(wrapper);
        });
    }

    renderSortControls() {
        if (this.sortDirectionButton) {
            this.sortDirectionButton.textContent = this.state.sortDir === 'asc' ? 'Asc' : 'Desc';
        }
        if (this.sortFieldSelect instanceof HTMLSelectElement) {
            this.sortFieldSelect.value = this.state.sortField || '';
        }
    }

    renderMeta() {
        if (!this.resultCount) return;
        if (this.config.serverSide) {
            this.resultCount.textContent = `${this.state.rows.length} shown / ${this.state.totalCount} total`;
            return;
        }
        this.resultCount.textContent = `${this.processedRows.length} rows`;
    }

    renderPagination() {
        if (!this.paginationControls || !this.pageInfo) return;
        if (this.config.mode !== 'pagination') {
            this.paginationControls.hidden = true;
            return;
        }

        this.paginationControls.hidden = false;
        this.pageInfo.textContent = `Page ${this.state.page} of ${this.state.totalPages}`;
        const prev = this.paginationControls.querySelector('[data-action="prev-page"]');
        const next = this.paginationControls.querySelector('[data-action="next-page"]');
        if (prev) prev.disabled = this.state.page <= 1;
        if (next) next.disabled = this.state.page >= this.state.totalPages;
    }

    async gotoPage(nextPage) {
        if (this.config.mode !== 'pagination') return;
        const bounded = Math.min(Math.max(1, nextPage), Math.max(1, this.state.totalPages));
        this.state.page = bounded;
        if (this.config.serverSide) {
            const ok = await this.loadRemote(true, false);
            if (!ok) {
                this.updateView();
                return;
            }
        } else {
            this.applyViewport(this.processedRows);
        }
        this.updateView();
    }

    resolveMode(container) {
        const declared = String(container?.getAttribute('data-mode') || '').trim().toLowerCase();
        if (declared === 'pagination' || declared === 'infinite') return declared;
        if (container?.hasAttribute('infinite-scroll')) return 'infinite';
        if (container?.hasAttribute('pagination')) return 'pagination';
        return 'standard';
    }

    resetViewport() {
        this.state.page = 1;
        if (this.contentEl) {
            this.contentEl.scrollTop = 0;
        }
    }

    initScrollingMode() {
        if (this.config.mode !== 'infinite' || !this.contentEl) return;
        this.contentEl.classList.add('datagrid-scrollable');
        const declaredHeight = this.container?.getAttribute('data-scroll-height') || '500px';
        this.contentEl.style.maxHeight = declaredHeight;
        this.contentEl.style.overflowY = 'auto';
        this.contentEl.addEventListener('scroll', () => {
            void this.handleInfiniteScroll();
        });

        if (this.config.serverSide) return;
        this.windowScrollHandler = () => {
            void this.handleWindowInfiniteScroll();
        };
        window.addEventListener('scroll', this.windowScrollHandler, { passive: true });
    }

    async handleInfiniteScroll() {
        if (this.config.mode !== 'infinite' || !this.contentEl || !this.state.hasMore || this.loadingMore) return;
        const threshold = 48;
        const nearBottom = this.contentEl.scrollTop + this.contentEl.clientHeight >= this.contentEl.scrollHeight - threshold;
        if (!nearBottom) return;

        this.loadingMore = true;
        this.state.page += 1;
        if (this.config.serverSide) {
            const ok = await this.loadRemote(true, true);
            if (!ok) {
                this.loadingMore = false;
                this.updateView();
                return;
            }
        } else {
            this.applyViewport(this.processedRows);
        }
        this.renderCards();
        this.renderMeta();
        this.loadingMore = false;
    }

    async handleWindowInfiniteScroll() {
        if (this.config.mode !== 'infinite' || !this.state.hasMore || this.loadingMore) return;
        const rect = this.container?.getBoundingClientRect();
        if (!rect) return;
        const nearViewportBottom = rect.bottom <= window.innerHeight + 120;
        if (!nearViewportBottom) return;

        this.loadingMore = true;
        this.state.page += 1;
        if (this.config.serverSide) {
            const ok = await this.loadRemote(true, true);
            if (!ok) {
                this.loadingMore = false;
                this.updateView();
                return;
            }
        } else {
            this.applyViewport(this.processedRows);
        }
        this.renderCards();
        this.renderMeta();
        this.loadingMore = false;
    }

    async prefillInfiniteViewport() {
        if (!this.contentEl || this.config.mode !== 'infinite' || !this.config.serverSide) return;
        const guardLimit = 10;
        let guard = 0;
        while (this.state.hasMore && this.contentEl.scrollHeight <= this.contentEl.clientHeight && guard < guardLimit) {
            this.loadingMore = true;
            this.state.page += 1;
            const ok = await this.loadRemote(true, true);
            if (!ok) {
                this.loadingMore = false;
                break;
            }
            this.renderCards();
            this.renderMeta();
            this.loadingMore = false;
            guard += 1;
        }
    }

    ensureInfiniteScrollable() {
        if (this.config.mode !== 'infinite' || !this.contentEl || !this.state.hasMore) return false;
        const guardLimit = 10;
        let guard = 0;
        let changed = false;
        while (this.state.hasMore && this.contentEl.scrollHeight <= this.contentEl.clientHeight && guard < guardLimit) {
            this.state.page += 1;
            this.applyViewport(this.processedRows);
            guard += 1;
            changed = true;
        }
        return changed;
    }

    async openDetailsDialog(mode, row = null) {
        const record = await this.resolveDetailsRecord(mode, row);
        const fields = this.resolveDetailFields(record);
        const readonly = this.config.readonlyFields || [];

        this.detailsDialog.open({
            title: 'Record',
            mode,
            record,
            fields,
            readonlyFields: readonly,
            onSave: async (draft, currentMode) => {
                const saved = await this.persistRecord(draft, currentMode === 'add');
                await this.refreshAfterMutation(saved, currentMode === 'add');
                this.seedDetailsCache(saved);
                return saved;
            }
        });
    }

    async resolveDetailsRecord(mode, row) {
        if (mode === 'add') return this.createEmptyRecord();
        if (!row || typeof row !== 'object') return this.createEmptyRecord();

        const fallback = this.cloneRow(row);
        const rowId = this.getRecordId(row);
        if (!rowId) return fallback;
        if (!this.shouldFetchDetails(mode)) return fallback;

        const cached = this.getCachedDetails(rowId);
        if (cached) {
            return this.mergeDetailRecord(fallback, cached);
        }

        const endpoint = this.buildDetailsEndpoint(rowId, row);
        if (!endpoint) return fallback;

        let loadingShown = false;
        try {
            this.detailsDialog?.openLoading?.({ title: 'Record' });
            loadingShown = true;
            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'same-origin'
            });
            if (!response.ok) return fallback;

            const body = await response.json().catch(() => null);
            const resolved = this.extractDetailsPayload(body);
            if (!resolved) return fallback;

            this.setCachedDetails(rowId, resolved);
            return this.mergeDetailRecord(fallback, resolved);
        } catch (_error) {
            return fallback;
        } finally {
            if (loadingShown) {
                this.detailsDialog?.close?.();
            }
        }
    }

    shouldFetchDetails(mode) {
        if (mode !== 'view' && mode !== 'edit') return false;
        const source = String(this.config.detailsSource || '').trim();
        if (!source) return false;
        return true;
    }

    buildDetailsEndpoint(rowId, row) {
        const source = String(this.config.detailsSource || '').trim();
        if (!source) return '';

        let endpoint = source;
        const idField = String(this.config.idField || 'id');
        const replacements = {
            id: rowId,
            [idField]: rowId
        };
        Object.keys(replacements).forEach((token) => {
            const value = encodeURIComponent(String(replacements[token] ?? ''));
            endpoint = endpoint.replace(new RegExp(`@\\{\\s*${token}\\s*\\}`, 'g'), value);
        });

        if (endpoint.includes('@{')) {
            endpoint = endpoint.replace(/@\{([^}]+)\}/g, (_match, expr) => {
                const key = String(expr || '').trim();
                const value = row?.[key];
                return value == null ? '' : encodeURIComponent(String(value));
            });
        }

        if (!/[?&](id|rowId|recordId|key)=/.test(endpoint) && !source.includes('@{')) {
            const sep = endpoint.includes('?') ? '&' : '?';
            endpoint = `${endpoint}${sep}${encodeURIComponent(idField)}=${encodeURIComponent(rowId)}`;
        }

        return endpoint;
    }

    extractDetailsPayload(payload) {
        if (!payload || typeof payload !== 'object') return null;
        if (payload.row && typeof payload.row === 'object') return this.cloneRow(payload.row);
        if (payload.record && typeof payload.record === 'object') return this.cloneRow(payload.record);
        if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) return this.cloneRow(payload.data);
        if (!Array.isArray(payload)) return this.cloneRow(payload);
        return null;
    }

    mergeDetailRecord(base, details) {
        const safeBase = base && typeof base === 'object' ? base : {};
        const safeDetails = details && typeof details === 'object' ? details : {};
        return {
            ...safeBase,
            ...safeDetails
        };
    }

    resolveDetailFields(record) {
        const fields = [];
        const seen = new Set();
        const metadata = this.config.fieldMetadata || {};

        this.state.headers.forEach((header) => {
            const name = String(header.field || '').trim();
            if (!name || seen.has(name)) return;
            seen.add(name);
            const meta = metadata[name] && typeof metadata[name] === 'object' ? metadata[name] : {};
            fields.push({
                name,
                label: meta.label || header.label || name,
                type: meta.formFieldType || meta.type || this.inferFieldType(record?.[name]),
                required: meta.required,
                optional: meta.optional,
                readonly: meta.readonly,
                constraints: meta.constraints && typeof meta.constraints === 'object' ? meta.constraints : {},
                lov: meta.lov || meta.options || []
            });
        });

        Object.keys(record || {}).forEach((name) => {
            if (seen.has(name)) return;
            seen.add(name);
            const meta = metadata[name] && typeof metadata[name] === 'object' ? metadata[name] : {};
            fields.push({
                name,
                label: meta.label || name,
                type: meta.formFieldType || meta.type || this.inferFieldType(record?.[name]),
                required: meta.required,
                optional: meta.optional,
                readonly: meta.readonly,
                constraints: meta.constraints && typeof meta.constraints === 'object' ? meta.constraints : {},
                lov: meta.lov || meta.options || []
            });
        });

        return fields;
    }

    inferFieldType(value) {
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        return 'text';
    }

    createEmptyRecord() {
        const record = {};
        this.state.headers.forEach((header) => {
            record[header.field] = '';
        });
        return record;
    }

    cloneRow(row) {
        return JSON.parse(JSON.stringify(row || {}));
    }

    getRecordId(row) {
        if (!row || typeof row !== 'object') return '';
        const key = String(this.config.idField || 'id');
        const value = row[key];
        return value == null ? '' : String(value);
    }

    getCachedDetails(rowId) {
        if (!this.config.detailsCacheEnabled || !rowId || !this.detailsCache.has(rowId)) return null;
        const entry = this.detailsCache.get(rowId);
        if (!entry) return null;

        const ttl = Number(this.config.detailsCacheTTL) || 0;
        if (ttl > 0 && Date.now() - entry.ts > ttl) {
            this.detailsCache.delete(rowId);
            return null;
        }

        this.detailsCache.delete(rowId);
        this.detailsCache.set(rowId, entry);
        return this.cloneRow(entry.data);
    }

    setCachedDetails(rowId, details) {
        if (!this.config.detailsCacheEnabled || !rowId || !details || typeof details !== 'object') return;
        if (this.detailsCache.has(rowId)) {
            this.detailsCache.delete(rowId);
        }

        this.detailsCache.set(rowId, {
            data: this.cloneRow(details),
            ts: Date.now()
        });

        const maxSize = Math.max(1, Number(this.config.detailsCacheMaxSize) || 100);
        while (this.detailsCache.size > maxSize) {
            const oldestKey = this.detailsCache.keys().next().value;
            this.detailsCache.delete(oldestKey);
        }
    }

    seedDetailsCache(row) {
        const id = this.getRecordId(row);
        if (!id) return;
        this.setCachedDetails(id, row);
    }

    clearDetailsCache(rowId = null) {
        if (!this.detailsCache) return;
        if (rowId == null) {
            this.detailsCache.clear();
            return;
        }
        this.detailsCache.delete(String(rowId));
    }

    getDetailsCacheStats() {
        return {
            size: this.detailsCache.size,
            max: Math.max(1, Number(this.config.detailsCacheMaxSize) || 100),
            ttl: Number(this.config.detailsCacheTTL) || 0,
            keys: Array.from(this.detailsCache.keys())
        };
    }

    getSaveEndpoint() {
        const explicit = String(this.config.detailsSource || '').trim();
        if (explicit) return explicit;
        return String(this.config.endpoint || '').trim();
    }

    async persistRecord(record, isCreate) {
        const endpoint = this.getSaveEndpoint();
        const shouldRemote = !!endpoint && (this.config.serverSide || endpoint.indexOf('.json') === -1);
        if (!shouldRemote) {
            return this.persistRecordLocal(record, isCreate);
        }

        const method = isCreate ? this.config.createMethod : this.config.updateMethod;
        const payload = {
            id: this.getRecordId(record),
            row: record
        };
        const response = await fetch(endpoint, {
            method,
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`Save failed (${response.status})`);
        }
        const body = await response.json().catch(() => ({}));
        const saved = body?.row && typeof body.row === 'object' ? body.row : record;
        return saved;
    }

    persistRecordLocal(record, isCreate) {
        const id = this.getRecordId(record);
        if (isCreate || !id) {
            if (!id) {
                const nextId = this.getNextLocalId();
                record[this.config.idField] = nextId;
            }
            this.rawRows.unshift(this.cloneRow(record));
            return record;
        }

        const idx = this.rawRows.findIndex((item) => this.getRecordId(item) === id);
        if (idx >= 0) {
            this.rawRows[idx] = this.cloneRow(record);
        } else {
            this.rawRows.unshift(this.cloneRow(record));
        }
        return record;
    }

    getNextLocalId() {
        let max = 0;
        this.rawRows.forEach((row) => {
            const id = Number(row?.[this.config.idField]);
            if (!Number.isNaN(id)) max = Math.max(max, id);
        });
        return max + 1;
    }

    async refreshAfterMutation(savedRecord, isCreate) {
        if (this.config.serverSide) {
            this.resetViewport();
            await this.loadData();
            return;
        }

        if (!isCreate) {
            const id = this.getRecordId(savedRecord);
            const idx = this.rawRows.findIndex((item) => this.getRecordId(item) === id);
            if (idx >= 0) {
                this.rawRows[idx] = this.cloneRow(savedRecord);
            }
        }

        this.applyClientProcessing();
        this.updateView();
    }

    setRequestStatus(state, message) {
        this.requestState = state || 'idle';
        this.requestMessage = message || '';
        this.loaderState?.setLoading?.(this.requestState === 'loading', this.requestMessage);
        this.renderRequestStatus();
    }

    renderRequestStatus() {
        if (!this.requestStatus || !this.requestStatusText || !this.retryButton) return;
        this.requestStatus.dataset.state = this.requestState || 'idle';
        this.requestStatusText.textContent = this.requestMessage || '';
        this.retryButton.hidden = this.requestState !== 'error';
    }

    async retryLoad() {
        this.setRequestStatus('loading', `Loading page ${this.state.page}...`);
        await this.loadData();
    }

    parseFieldListAttr(attrName) {
        const raw = String(this.container?.getAttribute(attrName) || '').trim();
        if (!raw) return [];
        return raw.split(',').map((item) => item.trim()).filter(Boolean);
    }

    parseBooleanAttr(attrName, fallback = false) {
        if (!this.container?.hasAttribute(attrName)) return fallback;
        const raw = String(this.container.getAttribute(attrName) || '').trim().toLowerCase();
        if (!raw) return true;
        if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
        return true;
    }

    parsePositiveIntAttr(attrName, fallback = 0) {
        const raw = String(this.container?.getAttribute(attrName) || '').trim();
        if (!raw) return fallback;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0) return fallback;
        return Math.floor(parsed);
    }

    parseMetadataAttr(attrName) {
        const raw = String(this.container?.getAttribute(attrName) || '').trim();
        if (!raw) return {};

        if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
            try {
                const parsed = JSON.parse(raw);
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (_error) {
                return {};
            }
        }

        if (typeof window !== 'undefined') {
            const ref = window[raw];
            if (typeof ref === 'function') {
                try {
                    const result = ref(this.container);
                    return result && typeof result === 'object' ? result : {};
                } catch (_error) {
                    return {};
                }
            }
            if (ref && typeof ref === 'object') return ref;
        }

        return {};
    }

    parseObjectAttr(attrName) {
        const raw = String(this.container?.getAttribute(attrName) || '').trim();
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    resolveConfiguredEndpoint() {
        const raw = String(this.config.endpointTemplate || this.config.endpoint || '').trim();
        if (!raw) {
            this.config.endpoint = '';
            return '';
        }
        const resolved = raw.includes('@{')
            ? this.resolveTemplateString(raw, this.getBindingContext())
            : raw;
        this.config.endpoint = String(resolved || '').trim();
        return this.config.endpoint;
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

    resolveConfiguredFields(configured, available) {
        if (!Array.isArray(configured) || configured.length === 0) return [];
        const availableSet = new Set(available);
        const dedupe = new Set();
        const resolved = [];
        configured.forEach((field) => {
            if (!availableSet.has(field) || dedupe.has(field)) return;
            dedupe.add(field);
            resolved.push(field);
        });
        return resolved;
    }

    applyChooserPoliciesForFields() {
        const available = this.state.headers.map((h) => h.field);
        this.mandatoryFieldsResolved = this.resolveConfiguredFields(this.config.mandatoryFields, available);
        this.priorityFieldsResolved = this.resolveConfiguredFields(this.config.priorityFields, available);

        let visible = Array.isArray(this.state.visibleFields) ? this.state.visibleFields.filter((field) => available.includes(field)) : [];
        if (!visible.length) {
            visible = this.state.headers.filter((h) => h.visible).map((h) => h.field);
        }

        this.mandatoryFieldsResolved.forEach((field) => {
            if (!visible.includes(field)) visible.push(field);
        });

        this.state.visibleFields = this.getOrderedVisibleFields(visible);
    }

    getOrderedVisibleFields(fields) {
        const available = new Set(this.state.headers.map((h) => h.field));
        const unique = [];
        const seen = new Set();
        fields.forEach((field) => {
            if (!available.has(field) || seen.has(field)) return;
            seen.add(field);
            unique.push(field);
        });

        if (!this.priorityFieldsResolved.length) return unique;

        const priorityIndex = new Map();
        this.priorityFieldsResolved.forEach((field, index) => {
            priorityIndex.set(field, index);
        });

        return [...unique].sort((a, b) => {
            const ai = priorityIndex.has(a) ? priorityIndex.get(a) : Number.MAX_SAFE_INTEGER;
            const bi = priorityIndex.has(b) ? priorityIndex.get(b) : Number.MAX_SAFE_INTEGER;
            if (ai !== bi) return ai - bi;
            return 0;
        });
    }

    isMandatoryField(field) {
        return this.mandatoryFieldsResolved.includes(field);
    }

    getBindableState() {
        return {
            searchTerm: this.state.searchTerm || '',
            sortField: this.state.sortField || null,
            sortDir: this.state.sortDir || 'asc',
            filters: { ...(this.state.filters || {}) },
            page: Number(this.state.page) || 1,
            visibleFields: [...(this.state.visibleFields || [])]
        };
    }

    getStateSnapshot() {
        return this.getBindableState();
    }

    shouldDispatchPprChange(path, _value, initial) {
        if (initial) return true;
        return ['searchTerm', 'sortField', 'sortDir', 'filters', 'page', 'visibleFields'].includes(path);
    }

    refreshPpr() {
        this.resetViewport();
        this.remoteLoaded = false;
        if (this.resolveConfiguredEndpoint()) {
            void this.loadData();
            return;
        }
        this.applyClientProcessing();
        this.updateView();
    }

    applyBindableState(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return;
        let changed = false;

        if (typeof snapshot.searchTerm === 'string' && snapshot.searchTerm !== this.state.searchTerm) {
            this.state.searchTerm = snapshot.searchTerm;
            const input = this.element?.querySelector('[data-action="search"]');
            if (input && 'value' in input) input.value = snapshot.searchTerm;
            changed = true;
        }

        if (snapshot.sortField !== undefined) {
            const nextSortField = snapshot.sortField == null ? null : String(snapshot.sortField);
            if (nextSortField !== this.state.sortField) {
                this.state.sortField = nextSortField;
                changed = true;
            }
        }

        if (typeof snapshot.sortDir === 'string') {
            const nextSortDir = snapshot.sortDir.toLowerCase() === 'desc' ? 'desc' : 'asc';
            if (nextSortDir !== this.state.sortDir) {
                this.state.sortDir = nextSortDir;
                changed = true;
            }
        }

        if (snapshot.filters && typeof snapshot.filters === 'object') {
            this.state.filters = { ...snapshot.filters };
            changed = true;
        }

        if (Array.isArray(snapshot.visibleFields) && this.state.headers.length) {
            const allow = new Set(snapshot.visibleFields.map((field) => String(field)));
            let visible = this.state.headers
                .map((header) => header.field)
                .filter((field) => this.isMandatoryField(field) || allow.has(field));
            if (!visible.length) {
                visible = this.state.headers.filter((h) => h.visible !== false).map((h) => h.field);
            }
            this.state.visibleFields = this.getOrderedVisibleFields(visible);
            changed = true;
        }

        if (Number.isFinite(Number(snapshot.page))) {
            const nextPage = Math.max(1, Number(snapshot.page));
            if (nextPage !== this.state.page) {
                this.state.page = nextPage;
                changed = true;
            }
        }

        if (!changed) return;

        if (this.config.serverSide) {
            void this.loadData();
            return;
        }

        this.applyClientProcessing();
        this.updateView();
    }

    destroy() {
        this.detailsDialog?.close?.();
        this.loaderState?.destroy?.();
        this.stateBinding?.disconnect?.();
        if (this.windowScrollHandler) {
            window.removeEventListener('scroll', this.windowScrollHandler);
            this.windowScrollHandler = null;
        }
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.DataGrid = DataGrid;
}

export { DataGrid };
