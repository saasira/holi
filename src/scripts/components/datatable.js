import { Component } from './component.js';
import { ObjectDetailsDialog } from '../utils/object_details_dialog.js';
import { attachLoaderState } from '../utils/loader_state.js';
import { attachComponentStateBinding } from '../utils/component_state_binding.js';

class DataTable extends Component {
    static get selector() {
        return 'datatable';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'datatable';
    }

    static templateId = 'datatable-template';

    constructor(containerOrOptions, maybeOptions = {}) {
        const normalized = DataTable.normalizeArgs(containerOrOptions, maybeOptions);
        super(normalized.container, normalized.config);

        this.templateId = DataTable.templateId;
        this.parent = normalized.parent;
        this.textProvider = normalized.textProvider;
        this.config = {
            localLimit: 10000,
            remoteLimit: 50,
            endpoint: this.container?.getAttribute('data-endpoint') || this.container?.getAttribute('endpoint') || null,
            serverSide: this.container?.hasAttribute('server-side') || false,
            mode: this.resolveMode(this.container),
            pageSize: Number(this.container?.getAttribute('data-page-size')) || 25,
            infiniteChunkSize: Number(this.container?.getAttribute('data-infinite-chunk')) || 25,
            mandatoryFields: this.parseFieldListAttr('data-mandatory-fields'),
            priorityFields: this.parseFieldListAttr('data-priority-fields'),
            readonlyFields: this.parseFieldListAttr('data-readonly-fields'),
            columnMetadata: this.parseMetadataAttr('data-column-metadata'),
            idField: String(this.container?.getAttribute('data-id-field') || 'id'),
            detailsSource: this.container?.getAttribute('data-details-source') || this.container?.getAttribute('details-source') || '',
            detailsCacheEnabled: this.parseBooleanAttr('data-details-cache', true),
            detailsCacheMaxSize: this.parsePositiveIntAttr('data-details-cache-size', 100),
            detailsCacheTTL: this.parsePositiveIntAttr('data-details-cache-ttl', 0),
            createMethod: String(this.container?.getAttribute('data-create-method') || 'POST').toUpperCase(),
            updateMethod: String(this.container?.getAttribute('data-update-method') || 'PUT').toUpperCase(),
            renderMode: this.normalizeRenderMode(this.container?.getAttribute('data-render-mode')),
            rows: [],
            headers: [],
            ...normalized.config
        };

        this.rawRows = [];
        this.processedRows = [];
        this.remoteLoaded = false;
        this.loadingMore = false;
        this.windowScrollHandler = null;
        this.pinnedColumns = { left: [], right: [] };
        this.onPinnedResize = null;
        this.localRowPool = [];
        this.localRowsVersion = 0;
        this.localRowsRenderedVersion = -1;

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
            visibleColumns: [],
            columnChooserOpen: false,
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
            throw new Error('DataTable requires a container element');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-datatable');
        this.contentEl = this.element?.querySelector('.datatable-content');
        this.thead = this.element?.querySelector('[data-role="thead"]');
        this.tbody = this.element?.querySelector('[data-role="tbody"]');
        this.columnChooser = this.element?.querySelector('[data-role="column-chooser"]');
        this.columnChooserList = this.element?.querySelector('[data-role="column-chooser-list"]');
        this.resultCount = this.element?.querySelector('[data-role="result-count"]');
        this.pageInfo = this.element?.querySelector('[data-role="page-info"]');
        this.paginationControls = this.element?.querySelector('[data-role="pagination-controls"]');
        this.requestStatus = this.element?.querySelector('[data-role="request-status"]');
        this.requestStatusText = this.element?.querySelector('[data-role="request-status-text"]');
        this.retryButton = this.element?.querySelector('[data-action="retry-load"]');
        this.headerCellTemplate = this.element?.querySelector('template[data-role="header-cell-template"]');
        this.rowCellTemplate = this.element?.querySelector('template[data-role="row-cell-template"]');
        this.actionsCellTemplate = this.element?.querySelector('template[data-role="actions-cell-template"]');
        this.emptyRowTemplate = this.element?.querySelector('template[data-role="empty-row-template"]');
        this.loaderState = attachLoaderState(this, {
            host: this.element,
            busyTarget: this.contentEl || this.element,
            scope: 'block',
            defaultMessage: 'Loading data...'
        });
        this.stateBinding = attachComponentStateBinding(this, {
            defaultPath: 'datatable',
            eventName: 'stateupdate',
            getSnapshot: (component) => component.getBindableState(),
            applySnapshot: (component, snapshot) => component.applyBindableState(snapshot)
        });
        this.initEventDelegation();
        this.initScrollingMode();
        this.onPinnedResize = () => this.applyPinnedStyles();
        window.addEventListener('resize', this.onPinnedResize);
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
        const field = actionEl?.dataset?.field;

        if (action === 'sort' && field) {
            void this.sort(field);
            return;
        }

        if (action === 'toggle-columns') {
            this.state.columnChooserOpen = !this.state.columnChooserOpen;
            this.renderColumnChooser();
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
        const field = target?.dataset?.field;
        const filterField = target?.dataset?.filter;

        if (action === 'toggle-column' && field) {
            const checked = !!target.checked;
            this.setColumnVisibility(field, checked);
            this.updateView();
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

    async sort(field) {
        if (this.state.sortField === field) {
            this.state.sortDir = this.state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.state.sortField = field;
            this.state.sortDir = 'asc';
        }
        this.resetViewport();

        if (this.config.serverSide) {
            await this.loadRemote(true, false);
        } else {
            this.applyClientProcessing();
        }
        this.updateView();
    }

    async loadData() {
        if (this.config.endpoint) {
            const ok = await this.loadRemote(this.config.serverSide, false);
            if (!ok) {
                this.updateView();
                return;
            }
        } else {
            await this.loadLocal();
        }

        this.hydrateFilterControls();
        if (!this.config.serverSide) {
            this.applyClientProcessing();
        }
        this.updateView();
        if (this.config.serverSide && this.config.mode === 'infinite') {
            await this.prefillInfiniteViewport();
        }
    }

    async loadRemote(force = false, append = false) {
        if (this.remoteLoaded && !force && !this.config.serverSide) {
            return;
        }

        const endpoint = this.buildEndpointUrl(true);
        this.setRequestStatus('loading', `Loading page ${this.state.page}...`);

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
        const headers = Array.isArray(data.headers)
            ? data.headers.map((h) => this.normalizeHeaderDefinition(h)).filter(Boolean)
            : this.deriveHeaders(rows);

        this.state.headers = headers;
        this.applyChooserPoliciesForColumns();
        this.state.totalPages = Number(data.totalPages) || 1;
        this.state.totalCount = Number(data.totalCount) || rows.length;

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
            ? this.config.headers.map((h) => this.normalizeHeaderDefinition(h)).filter(Boolean)
            : this.deriveHeaders(this.rawRows);
        this.applyChooserPoliciesForColumns();
        this.state.totalPages = 1;
        this.state.totalCount = this.rawRows.length;
    }

    buildEndpointUrl(includeQuery) {
        if (!includeQuery) return this.config.endpoint;

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
        return `${this.config.endpoint}?${params}`;
    }

    deriveHeaders(rows) {
        const sample = rows[0];
        if (!sample || typeof sample !== 'object') return [];
        return Object.keys(sample).map((key) => ({
            field: key,
            label: key,
            visible: true,
            pinned: null
        }));
    }

    normalizeRenderMode(value) {
        const mode = String(value || '').trim().toLowerCase();
        return mode === 'template-clone' ? 'template-clone' : 'programmatic';
    }

    normalizeHeaderDefinition(header) {
        if (!header || typeof header !== 'object') return null;
        const field = String(header.field ?? header.key ?? '').trim();
        if (!field) return null;
        return {
            ...header,
            field,
            label: header.label || field,
            visible: header.visible !== false,
            pinned: this.normalizePinnedSide(header.pinned)
        };
    }

    normalizePinnedSide(value) {
        if (value == null) return null;
        const normalized = String(value).trim().toLowerCase();
        if (normalized === 'left' || normalized === 'right') return normalized;
        return null;
    }

    applyClientProcessing() {
        let rows = Array.isArray(this.rawRows) ? [...this.rawRows] : [];
        rows = this.applyFilters(rows);
        rows = this.applySearch(rows);
        rows = this.applySort(rows);
        this.processedRows = rows;
        this.bumpLocalRowsVersion();
        this.applyViewport(rows);
    }

    applyViewport(rows) {
        if (this.config.mode === 'pagination') {
            const pageSize = Math.max(1, Number(this.config.pageSize) || 25);
            const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
            this.state.totalPages = totalPages;
            this.state.page = Math.min(Math.max(1, this.state.page), totalPages);
            const start = (this.state.page - 1) * pageSize;
            const end = start + pageSize;
            this.state.rows = rows.slice(start, end);
            this.state.hasMore = false;
            this.state.visibleStart = start;
            this.state.visibleEnd = Math.min(end, rows.length);
            return;
        }

        if (this.config.mode === 'infinite') {
            const chunk = Math.max(1, Number(this.config.infiniteChunkSize) || 25);
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

    setColumnVisibility(field, visible) {
        const col = this.state.headers.find((h) => h.field === field);
        if (!col) return;
        if (!visible && this.isMandatoryField(field)) return;
        col.visible = visible;
        this.state.visibleColumns = this.getOrderedVisibleColumns();
        this.bumpLocalRowsVersion();
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

    updateView() {
        this.renderHeaders();
        this.renderRows();
        if (!this.config.serverSide && this.ensureInfiniteScrollable()) {
            this.renderRows();
        }
        this.renderColumnChooser();
        this.renderMeta();
        this.renderPagination();
        this.renderRequestStatus();
        this.applyPinnedStyles();
        this.dispatchEvent('stateupdate', this.state);
    }

    renderHeaders() {
        if (!this.thead) return;
        this.thead.replaceChildren();

        if (this.config.renderMode === 'template-clone' && this.headerCellTemplate) {
            this.renderHeadersFromTemplates();
            return;
        }

        const headerRow = document.createElement('tr');
        this.state.visibleColumns.forEach((column) => {
            const th = document.createElement('th');
            th.dataset.field = column.field;
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.action = 'sort';
            button.dataset.field = column.field;
            button.textContent = this.getHeaderLabel(column);
            th.appendChild(button);
            headerRow.appendChild(th);
        });

        const actions = document.createElement('th');
        actions.textContent = 'Actions';
        headerRow.appendChild(actions);

        this.thead.appendChild(headerRow);
    }

    renderHeadersFromTemplates() {
        if (!this.thead) return;
        const headerRow = document.createElement('tr');

        this.state.visibleColumns.forEach((column) => {
            const cell = this.cloneFirstElementFromTemplate(this.headerCellTemplate);
            if (!(cell instanceof HTMLTableCellElement)) return;
            cell.dataset.field = column.field;

            const button = cell.querySelector('[data-action="sort"]');
            if (button instanceof HTMLButtonElement) {
                button.dataset.field = column.field;
            }

            const label = cell.querySelector('[data-role="header-label"]');
            if (label) {
                label.textContent = this.getHeaderLabel(column);
            } else {
                cell.textContent = this.getHeaderLabel(column);
            }

            headerRow.appendChild(cell);
        });

        const actions = document.createElement('th');
        actions.textContent = 'Actions';
        headerRow.appendChild(actions);
        this.thead.appendChild(headerRow);
    }

    getHeaderLabel(column) {
        const label = column.label || column.field;
        if (this.state.sortField !== column.field) return label;
        return `${label} ${this.state.sortDir === 'asc' ? '^' : 'v'}`;
    }

    renderRows() {
        if (!this.tbody) return;
        if (this.isLocalDomReuseEnabled()) {
            this.renderRowsWithLocalPool();
            return;
        }
        this.tbody.replaceChildren();

        if (!this.state.rows.length) {
            if (this.config.renderMode === 'template-clone' && this.emptyRowTemplate) {
                this.renderEmptyRowFromTemplate();
                return;
            }
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = Math.max(this.state.visibleColumns.length + 1, 1);
            td.textContent = 'No matching records';
            tr.appendChild(td);
            this.tbody.appendChild(tr);
            return;
        }

        this.state.rows.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            if (this.config.renderMode === 'template-clone' && this.rowCellTemplate) {
                this.renderRowCellsFromTemplate(tr, row);
            } else {
                this.state.visibleColumns.forEach((column) => {
                    const td = document.createElement('td');
                    td.dataset.field = column.field;
                    const value = row?.[column.field];
                    td.textContent = value == null ? '' : String(value);
                    tr.appendChild(td);
                });
            }
            const actions = this.createActionsCell(rowIndex);

            tr.appendChild(actions);
            this.tbody.appendChild(tr);
        });
    }

    isLocalDomReuseEnabled() {
        return !this.config.serverSide;
    }

    bumpLocalRowsVersion() {
        this.localRowsVersion += 1;
    }

    renderRowsWithLocalPool() {
        if (!this.tbody) return;

        if (!this.processedRows.length) {
            this.localRowPool = [];
            this.localRowsRenderedVersion = this.localRowsVersion;
            this.tbody.replaceChildren();
            if (this.config.renderMode === 'template-clone' && this.emptyRowTemplate) {
                this.renderEmptyRowFromTemplate();
                return;
            }
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = Math.max(this.state.visibleColumns.length + 1, 1);
            td.textContent = 'No matching records';
            tr.appendChild(td);
            this.tbody.appendChild(tr);
            return;
        }

        if (this.localRowsRenderedVersion !== this.localRowsVersion) {
            this.rebuildLocalRowPool();
        } else {
            this.applyLocalRowVisibility();
        }
    }

    rebuildLocalRowPool() {
        if (!this.tbody) return;
        this.tbody.replaceChildren();
        this.localRowPool = [];

        this.processedRows.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            if (this.config.renderMode === 'template-clone' && this.rowCellTemplate) {
                this.renderRowCellsFromTemplate(tr, row);
            } else {
                this.state.visibleColumns.forEach((column) => {
                    const td = document.createElement('td');
                    td.dataset.field = column.field;
                    const value = row?.[column.field];
                    td.textContent = value == null ? '' : String(value);
                    tr.appendChild(td);
                });
            }
            tr.appendChild(this.createActionsCell(rowIndex));
            this.localRowPool.push(tr);
            this.tbody.appendChild(tr);
        });

        this.localRowsRenderedVersion = this.localRowsVersion;
        this.applyLocalRowVisibility();
    }

    applyLocalRowVisibility() {
        const start = Math.max(0, Number(this.state.visibleStart) || 0);
        const end = Math.max(start, Number(this.state.visibleEnd) || 0);
        this.localRowPool.forEach((rowEl, rowIndex) => {
            rowEl.hidden = rowIndex < start || rowIndex >= end;
        });
    }

    renderEmptyRowFromTemplate() {
        const tr = this.cloneFirstElementFromTemplate(this.emptyRowTemplate);
        if (!(tr instanceof HTMLTableRowElement)) return;
        const cell = tr.querySelector('[data-role="empty-cell"]');
        if (cell instanceof HTMLTableCellElement) {
            cell.colSpan = Math.max(this.state.visibleColumns.length + 1, 1);
        }
        this.tbody?.appendChild(tr);
    }

    renderRowCellsFromTemplate(tr, row) {
        this.state.visibleColumns.forEach((column) => {
            const td = this.cloneFirstElementFromTemplate(this.rowCellTemplate);
            if (!(td instanceof HTMLTableCellElement)) return;
            td.dataset.field = column.field;
            const value = row?.[column.field];
            td.textContent = value == null ? '' : String(value);
            tr.appendChild(td);
        });
    }

    createActionsCell(rowIndex) {
        const fromTemplate = this.cloneFirstElementFromTemplate(this.actionsCellTemplate);
        if (fromTemplate instanceof HTMLTableCellElement) {
            fromTemplate.classList.add('datatable-actions-cell');
            const actionButtons = fromTemplate.querySelectorAll('[data-action][data-role="row-action"]');
            actionButtons.forEach((button) => {
                if (!(button instanceof HTMLButtonElement)) return;
                button.dataset.rowIndex = String(rowIndex);
            });
            return fromTemplate;
        }

        const actions = document.createElement('td');
        actions.className = 'datatable-actions-cell';

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

        return actions;
    }

    cloneFirstElementFromTemplate(template) {
        if (!(template instanceof HTMLTemplateElement)) return null;
        const fragment = template.content.cloneNode(true);
        const first = fragment.firstElementChild;
        if (!first) return null;
        return first;
    }

    renderColumnChooser() {
        if (this.columnChooser) {
            this.columnChooser.hidden = !this.state.columnChooserOpen;
        }
        if (!this.columnChooserList) return;

        this.columnChooserList.replaceChildren();
        this.state.headers.forEach((column) => {
            const wrapper = document.createElement('label');
            wrapper.className = 'datatable-column-option';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.action = 'toggle-column';
            input.dataset.field = column.field;
            input.checked = column.visible !== false;
            input.disabled = this.isMandatoryField(column.field);

            const text = document.createElement('span');
            text.textContent = column.label || column.field;

            wrapper.appendChild(input);
            wrapper.appendChild(text);
            this.columnChooserList.appendChild(wrapper);
        });
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
        if (this.config.mode !== 'pagination') {
            return;
        }
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
        this.contentEl.classList.add('datatable-scrollable');
        const declaredHeight = this.container?.getAttribute('data-scroll-height') || '420px';
        this.contentEl.style.maxHeight = declaredHeight;
        this.contentEl.style.overflowY = 'auto';
        this.contentEl.addEventListener('scroll', () => {
            void this.handleInfiniteScroll();
        });

        // Window fallback is only for local mode. Server-side infinite must be strict remote.
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
        this.renderRows();
        this.applyPinnedStyles();
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
        this.renderRows();
        this.applyPinnedStyles();
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
            this.renderRows();
            this.applyPinnedStyles();
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
        const metadata = this.config.columnMetadata || {};

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

    destroy() {
        this.detailsDialog?.close?.();
        this.loaderState?.destroy?.();
        this.stateBinding?.disconnect?.();
        if (this.onPinnedResize) {
            window.removeEventListener('resize', this.onPinnedResize);
            this.onPinnedResize = null;
        }
        if (this.windowScrollHandler) {
            window.removeEventListener('scroll', this.windowScrollHandler);
            this.windowScrollHandler = null;
        }
        super.destroy();
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

    applyChooserPoliciesForColumns() {
        const available = this.state.headers.map((h) => h.field);
        this.mandatoryFieldsResolved = this.resolveConfiguredFields(this.config.mandatoryFields, available);
        this.priorityFieldsResolved = this.resolveConfiguredFields(this.config.priorityFields, available);

        this.state.headers.forEach((header) => {
            if (this.mandatoryFieldsResolved.includes(header.field)) {
                header.visible = true;
            }
        });

        this.state.visibleColumns = this.getOrderedVisibleColumns();
    }

    getOrderedVisibleColumns() {
        const visible = this.state.headers
            .map((header, index) => ({ header, index }))
            .filter((item) => item.header.visible);
        if (!this.priorityFieldsResolved.length && !visible.some((item) => this.resolvePinnedSide(item.header))) {
            return visible.map((item) => item.header);
        }

        const priorityIndex = new Map();
        this.priorityFieldsResolved.forEach((field, index) => {
            priorityIndex.set(field, index);
        });

        return [...visible].sort((a, b) => {
            const aPinned = this.resolvePinnedSide(a.header) || '';
            const bPinned = this.resolvePinnedSide(b.header) || '';
            const aPinRank = aPinned === 'left' ? 0 : aPinned === 'right' ? 2 : 1;
            const bPinRank = bPinned === 'left' ? 0 : bPinned === 'right' ? 2 : 1;
            if (aPinRank !== bPinRank) return aPinRank - bPinRank;

            const ai = priorityIndex.has(a.header.field) ? priorityIndex.get(a.header.field) : Number.MAX_SAFE_INTEGER;
            const bi = priorityIndex.has(b.header.field) ? priorityIndex.get(b.header.field) : Number.MAX_SAFE_INTEGER;
            if (ai !== bi) return ai - bi;
            return a.index - b.index;
        }).map((item) => item.header);
    }

    isMandatoryField(field) {
        return this.mandatoryFieldsResolved.includes(field);
    }

    resolvePinnedSide(header) {
        if (!header || typeof header !== 'object') return null;
        const direct = this.normalizePinnedSide(header.pinned);
        if (direct) return direct;
        const metadata = this.config.columnMetadata?.[header.field];
        return this.normalizePinnedSide(metadata?.pinned);
    }

    initPinnedColumns() {
        const next = { left: [], right: [] };
        this.state.visibleColumns.forEach((column, index) => {
            const side = this.resolvePinnedSide(column);
            if (!side) return;
            next[side].push(index);
        });
        this.pinnedColumns = next;
    }

    applyPinnedStyles() {
        const table = this.element?.querySelector('.datatable-table');
        if (!table) return;

        this.initPinnedColumns();
        const hasPinned = this.pinnedColumns.left.length > 0 || this.pinnedColumns.right.length > 0;
        table.classList.toggle('datatable-has-pinned-columns', hasPinned);
        if (!hasPinned) return;

        let leftOffset = 0;
        this.pinnedColumns.left.forEach((columnIndex) => {
            const width = this.getColumnWidth(table, columnIndex);
            this.getColumnCells(table, columnIndex).forEach((cell) => {
                cell.classList.add('datatable-pinned-left');
                cell.style.left = `${leftOffset}px`;
            });
            leftOffset += width;
        });

        let rightOffset = 0;
        [...this.pinnedColumns.right].reverse().forEach((columnIndex) => {
            const width = this.getColumnWidth(table, columnIndex);
            this.getColumnCells(table, columnIndex).forEach((cell) => {
                cell.classList.add('datatable-pinned-right');
                cell.style.right = `${rightOffset}px`;
            });
            rightOffset += width;
        });
    }

    getColumnCells(table, columnIndex) {
        return Array.from(table.querySelectorAll(`tr > :nth-child(${columnIndex + 1})`));
    }

    getColumnWidth(table, columnIndex) {
        const headerCell = this.thead?.querySelector(`tr > :nth-child(${columnIndex + 1})`);
        if (headerCell) {
            return headerCell.getBoundingClientRect().width;
        }
        const firstBodyCell = this.tbody?.querySelector(`tr > :nth-child(${columnIndex + 1})`);
        if (firstBodyCell) {
            return firstBodyCell.getBoundingClientRect().width;
        }
        const fallback = table.querySelector(`tr > :nth-child(${columnIndex + 1})`);
        return fallback ? fallback.getBoundingClientRect().width : 0;
    }

    resolveHeaderByReference(columnRef) {
        if (typeof columnRef === 'number' && Number.isInteger(columnRef)) {
            return this.state.headers[columnRef] || null;
        }
        if (typeof columnRef === 'string') {
            return this.state.headers.find((header) => header.field === columnRef) || null;
        }
        return null;
    }

    pinColumn(columnRef, side = 'left') {
        const target = this.resolveHeaderByReference(columnRef);
        const resolvedSide = this.normalizePinnedSide(side);
        if (!target || !resolvedSide) return false;

        target.pinned = resolvedSide;
        this.state.visibleColumns = this.getOrderedVisibleColumns();
        this.bumpLocalRowsVersion();
        this.updateView();
        return true;
    }

    unpinColumn(columnRef) {
        const target = this.resolveHeaderByReference(columnRef);
        if (!target) return false;

        target.pinned = null;
        this.state.visibleColumns = this.getOrderedVisibleColumns();
        this.bumpLocalRowsVersion();
        this.updateView();
        return true;
    }

    getBindableState() {
        return {
            searchTerm: this.state.searchTerm || '',
            sortField: this.state.sortField || null,
            sortDir: this.state.sortDir || 'asc',
            filters: { ...(this.state.filters || {}) },
            page: Number(this.state.page) || 1,
            visibleColumns: this.state.headers.filter((h) => h.visible !== false).map((h) => h.field)
        };
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

        if (Array.isArray(snapshot.visibleColumns) && this.state.headers.length) {
            const allow = new Set(snapshot.visibleColumns.map((field) => String(field)));
            this.state.headers.forEach((header) => {
                header.visible = this.isMandatoryField(header.field) ? true : allow.has(header.field);
            });
            this.state.visibleColumns = this.getOrderedVisibleColumns();
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
}

if (typeof window !== 'undefined') {
    window.DataTable = DataTable;
}

export { DataTable };
