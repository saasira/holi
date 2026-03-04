import { Component } from './component.js';
import { TreeComponent } from './tree.js';

class TreePanelComponent extends Component {
    static get selector() {
        return 'treepanel';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'treepanel';
    }

    static templateId = 'treepanel-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = TreePanelComponent.templateId;
        this.viewMode = this.resolveViewMode(container.getAttribute('detail-view'));
        this.loaderName = container.getAttribute('details-loader') || '';
        this.detailsLoader = this.resolveDetailsLoader(this.loaderName);
        this.detailsSource = String(
            container.getAttribute('data-details-source')
            || container.getAttribute('details-source')
            || ''
        ).trim();
        this.detailsMethod = String(container.getAttribute('data-details-method') || 'GET').toUpperCase();
        this.inlineEditEnabled = this.readBooleanAttr(container, 'data-inline-edit');
        this.saveMethod = String(container.getAttribute('data-save-method') || 'PUT').toUpperCase();
        this.treeInstance = null;
        this.state = {
            selectedId: null,
            selectedLabel: '',
            loading: false,
            editing: false,
            saving: false
        };
        this.currentDetails = null;
        this.editDraft = null;
        this.init();
    }

    readBooleanAttr(node, attrName) {
        if (!node || !attrName) return false;
        if (!node.hasAttribute(attrName)) return false;
        const value = String(node.getAttribute(attrName) || '').trim().toLowerCase();
        if (!value) return true;
        return value !== 'false' && value !== '0' && value !== 'no';
    }

    resolveViewMode(value) {
        const normalized = String(value || 'datapanel').trim().toLowerCase();
        if (normalized === 'table') return 'datatable';
        if (normalized === 'panel') return 'datapanel';
        if (normalized === 'grid') return 'datagrid';
        if (normalized === 'datatable' || normalized === 'datagrid' || normalized === 'datapanel') {
            return normalized;
        }
        return 'datapanel';
    }

    resolveDetailsLoader(name) {
        if (!name || typeof window === 'undefined') return null;
        const fn = window[name];
        return typeof fn === 'function' ? fn : null;
    }

    validateStructure() {
        super.validateStructure();
        const hasTree = !!this.container.querySelector('[slot="tree"]') || !!this.container.querySelector('ul, ol');
        if (!hasTree) {
            throw new Error('TreePanel requires a nested tree list in slot="tree".');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
        this.bindEvents();
    }

    async render() {
        const sourceTree = this.container.querySelector('[slot="tree"]') || this.container.querySelector('ul, ol');
        await super.render();
        this.element = this.container.querySelector('.holi-treepanel');
        this.treeHost = this.container.querySelector('[data-role="tree-host"]');
        this.titleEl = this.container.querySelector('[data-role="detail-title"]');
        this.statusEl = this.container.querySelector('[data-role="detail-status"]');
        this.panelBody = this.container.querySelector('[data-role="panel-body"]');
        this.tableEl = this.container.querySelector('[data-role="detail-table"]');
        this.tableHead = this.container.querySelector('[data-role="table-head"]');
        this.tableBody = this.container.querySelector('[data-role="table-body"]');
        this.gridEl = this.container.querySelector('[data-role="detail-grid"]');
        this.headerDefault = this.container.querySelector('[data-role="header-default"]');
        this.footerDefault = this.container.querySelector('[data-role="footer-default"]');
        this.contentDefault = this.container.querySelector('[data-role="content-default"]');
        this.editButton = this.container.querySelector('[data-role="edit-button"]');
        this.saveButton = this.container.querySelector('[data-role="save-button"]');
        this.cancelButton = this.container.querySelector('[data-role="cancel-button"]');

        this.headerSlotContent = this.mountNamedSlot('header', this.headerDefault);
        this.footerSlotContent = this.mountNamedSlot('footer', this.footerDefault);
        this.contentSlotContent = this.mountNamedSlot('content', this.contentDefault);
        this.hasCustomContent = !!this.contentSlotContent;
        this.customContentMode = this.resolveCustomContentMode();

        if (sourceTree && this.treeHost) {
            this.treeHost.replaceChildren(sourceTree);
        }

        const forwardAttrs = ['single-expand', 'children-loader', 'cache-ttl', 'no-cache'];
        forwardAttrs.forEach((attr) => {
            if (this.container.hasAttribute(attr) && this.treeHost) {
                this.treeHost.setAttribute(attr, this.container.getAttribute(attr) || '');
            }
        });

        if (this.treeHost && !this.treeHost.hasAttribute('children-loader')) {
            this.treeHost.setAttribute('children-loader', 'loadTreeChildren');
        }

        this.applyViewMode();
        this.updateEditControls();
        this.setLoading(false, '');

        if (this.treeHost) {
            this.treeInstance = new TreeComponent(this.treeHost, {
                onSelect: (detail) => {
                    void this.loadNodeDetails(detail);
                }
            });
        }
    }

    mountNamedSlot(name, defaultRegion) {
        const slotEl = this.container.querySelector(`slot[name="${name}"]`);
        const userContent = this.container.querySelector(`[slot="${name}"]`);

        if (!slotEl) return null;
        if (!userContent) {
            slotEl.remove();
            return null;
        }

        if (defaultRegion) {
            defaultRegion.hidden = true;
        }
        slotEl.replaceWith(userContent);
        return userContent;
    }

    bindEvents() {
        this.container.addEventListener('click', (event) => {
            const action = event.target?.dataset?.action;
            if (action === 'reload-selected') {
                event.preventDefault();
                if (!this.state.selectedId) return;
                void this.loadNodeDetails({
                    id: this.state.selectedId,
                    label: this.state.selectedLabel,
                    item: null
                }, true);
                return;
            }

            if (action === 'edit-details') {
                event.preventDefault();
                this.startEditing();
                return;
            }

            if (action === 'cancel-edit') {
                event.preventDefault();
                this.cancelEditing();
                return;
            }

            if (action === 'save-details') {
                event.preventDefault();
                void this.saveDetails();
            }
        });
    }

    applyViewMode() {
        if (this.customContentMode) return;
        const views = this.container.querySelectorAll('[data-view]');
        views.forEach((view) => {
            view.hidden = view.getAttribute('data-view') !== this.viewMode;
        });

        if (this.hasCustomContent && this.contentDefault) {
            this.contentDefault.hidden = true;
        }
    }

    async loadNodeDetails(detail, forceReload = false) {
        const id = detail?.id || '';
        const label = detail?.label || id || 'Node';
        this.state.editing = false;
        this.editDraft = null;
        this.state.selectedId = id;
        this.state.selectedLabel = label;
        this.updateEditControls();
        this.setLoading(true, label);

        try {
            let payload = null;
            if (this.detailsLoader) {
                payload = await Promise.resolve(this.detailsLoader({
                    id,
                    label,
                    item: detail?.item || null,
                    forceReload
                }));
            } else if (this.detailsSource) {
                payload = await this.fetchDetailsFromSource({
                    id,
                    label,
                    item: detail?.item || null
                });
            }

            const normalized = this.normalizeDetailsPayload(payload, id, label);
            this.renderDetails(normalized);
        } catch (error) {
            this.renderDetails({
                title: label,
                fields: { error: String(error?.message || error || 'Failed to load details') },
                columns: ['field', 'value'],
                rows: []
            });
        } finally {
            this.setLoading(false, label);
        }
    }

    async fetchDetailsFromSource(detail) {
        const sourceUrl = this.buildDetailsSourceUrl(detail);
        if (!sourceUrl) return null;

        const response = await fetch(sourceUrl, {
            method: this.detailsMethod || 'GET',
            credentials: 'same-origin'
        });
        if (!response.ok) {
            throw new Error(`Details request failed (${response.status})`);
        }

        const payload = await response.json();
        if (payload && typeof payload === 'object') {
            if (payload.detail && typeof payload.detail === 'object') {
                return payload.detail;
            }
            if (payload.node && typeof payload.node === 'object') {
                return payload.node;
            }
            const byNodes = payload.nodes;
            if (byNodes && typeof byNodes === 'object' && detail?.id && byNodes[detail.id]) {
                return byNodes[detail.id];
            }
        }
        return payload;
    }

    buildDetailsSourceUrl(detail) {
        const base = String(this.detailsSource || '').trim();
        if (!base) return '';

        const id = detail?.id == null ? '' : String(detail.id);
        const label = detail?.label == null ? '' : String(detail.label);
        const encoded = {
            id: encodeURIComponent(id),
            label: encodeURIComponent(label)
        };

        let url = base;
        url = url.replace(/@\{id\}/g, encoded.id).replace(/\{id\}/g, encoded.id).replace(/:id\b/g, encoded.id);
        url = url.replace(/@\{label\}/g, encoded.label).replace(/\{label\}/g, encoded.label).replace(/:label\b/g, encoded.label);

        const hadToken = url !== base;
        if (!hadToken && id) {
            const hasQuery = url.includes('?');
            const hasNodeParam = /(?:\?|&)(?:node|id)=/i.test(url);
            if (!hasNodeParam) {
                url += `${hasQuery ? '&' : '?'}node=${encoded.id}`;
            }
        }
        return url;
    }

    normalizeDetailsPayload(payload, id, label) {
        const base = payload && typeof payload === 'object' ? payload : {};
        const fields = base.fields && typeof base.fields === 'object' ? { ...base.fields } : {};

        let rows = [];
        if (Array.isArray(base.rows)) rows = base.rows;
        else if (Array.isArray(base.items)) rows = base.items;
        else if (Array.isArray(base.data)) rows = base.data;

        const columns = this.normalizeColumns(base.columns, rows, fields);

        if (!Object.keys(fields).length && !rows.length) {
            fields.id = id || '';
            fields.label = label || '';
        }

        return {
            title: String(base.title || label || 'Node Details'),
            fields,
            columns,
            rows
        };
    }

    normalizeColumns(columns, rows, fields) {
        if (Array.isArray(columns) && columns.length) {
            return columns.map((column) => {
                if (typeof column === 'string') return column;
                if (column && typeof column === 'object') {
                    return String(column.field || column.key || column.name || '');
                }
                return '';
            }).filter(Boolean);
        }

        if (Array.isArray(rows) && rows.length) {
            const sample = rows.find((row) => row && typeof row === 'object');
            if (sample) return Object.keys(sample);
        }

        if (fields && typeof fields === 'object') {
            const keys = Object.keys(fields);
            if (keys.length) return ['field', 'value'];
        }

        return [];
    }

    renderDetails(details) {
        if (!this.state.editing || details !== this.editDraft) {
            this.currentDetails = details;
        }
        if (this.titleEl) {
            this.titleEl.textContent = details.title;
        }

        this.updateFooter(details);

        this.dispatchEvent('detailsloaded', {
            id: this.state.selectedId,
            label: this.state.selectedLabel,
            mode: this.viewMode,
            details
        });

        if (this.hasCustomContent) {
            if (this.customContentMode) {
                this.renderCustomContent(details, this.state.editing);
            }
            this.updateEditControls();
            return;
        }

        this.renderPanelFields(details.fields, null, this.state.editing);
        this.renderTable(details.columns, details.rows, details.fields, null, null, this.state.editing);
        this.renderGrid(details.columns, details.rows, details.fields, null, this.state.editing);
        this.updateEditControls();
    }

    resolveCustomContentMode() {
        if (!this.contentSlotContent) return '';
        const declaredRaw = this.contentSlotContent.getAttribute('data-content-mode')
            || this.container.getAttribute('data-content-mode')
            || '';
        const declared = String(declaredRaw).trim();
        if (!declared) return '';
        return this.resolveViewMode(declared);
    }

    renderCustomContent(details, editable = false) {
        if (!this.contentSlotContent || !this.customContentMode) return;
        const root = this.contentSlotContent;

        if (this.customContentMode === 'datapanel') {
            const panelRoot = root.querySelector('[data-role="detail-datapanel"]') || root;
            this.renderPanelFields(details.fields, panelRoot, editable);
            return;
        }

        if (this.customContentMode === 'datatable') {
            const tableRoot = root.querySelector('[data-role="detail-datatable"]');
            const head = root.querySelector('[data-role="detail-table-head"]')
                || tableRoot?.querySelector('thead')
                || root.querySelector('thead');
            const body = root.querySelector('[data-role="detail-table-body"]')
                || tableRoot?.querySelector('tbody')
                || root.querySelector('tbody');
            this.renderTable(details.columns, details.rows, details.fields, head, body, editable);
            return;
        }

        if (this.customContentMode === 'datagrid') {
            const gridRoot = root.querySelector('[data-role="detail-datagrid"]') || root;
            this.renderGrid(details.columns, details.rows, details.fields, gridRoot, editable);
        }
    }

    updateFooter(details) {
        if (!this.footerDefault || this.footerDefault.hidden) return;

        const rowCount = Array.isArray(details.rows) ? details.rows.length : 0;
        const fieldCount = details.fields && typeof details.fields === 'object' ? Object.keys(details.fields).length : 0;
        const summary = document.createElement('p');
        summary.className = 'treepanel-footer-summary';
        summary.textContent = `Fields: ${fieldCount} | Rows: ${rowCount}`;

        this.footerDefault.replaceChildren(summary);
    }

    renderPanelFields(fields, target = null, editable = false) {
        const host = target || this.panelBody;
        if (!host) return;
        host.replaceChildren();

        const entries = Object.entries(fields || {});
        if (!entries.length) {
            const empty = document.createElement('p');
            empty.className = 'treepanel-empty';
            empty.textContent = 'No details available.';
            host.appendChild(empty);
            return;
        }

        entries.forEach(([key, value]) => {
            const row = document.createElement('div');
            row.className = 'treepanel-field';

            const keyEl = document.createElement('span');
            keyEl.className = 'treepanel-field-key';
            keyEl.textContent = String(key);

            const valueEl = editable
                ? this.createEditor(value, (nextValue) => this.setDraftField(String(key), nextValue))
                : document.createElement('span');

            if (!editable) {
                valueEl.className = 'treepanel-field-value';
                valueEl.textContent = value == null ? '' : String(value);
            } else {
                valueEl.classList.add('treepanel-field-editor');
            }

            row.append(keyEl, valueEl);
            host.appendChild(row);
        });
    }

    renderTable(columns, rows, fields, headTarget = null, bodyTarget = null, editable = false) {
        const headHost = headTarget || this.tableHead;
        const bodyHost = bodyTarget || this.tableBody;
        if (!headHost || !bodyHost) return;
        headHost.replaceChildren();
        bodyHost.replaceChildren();

        let normalizedColumns = Array.isArray(columns) ? [...columns] : [];
        let normalizedRows = Array.isArray(rows) ? [...rows] : [];

        if (!normalizedColumns.length && normalizedRows.length) {
            normalizedColumns = Object.keys(normalizedRows[0] || {});
        }

        if (!normalizedColumns.length && Object.keys(fields || {}).length) {
            normalizedColumns = ['field', 'value'];
            normalizedRows = Object.entries(fields).map(([field, value]) => ({ field, value }));
        }

        if (!normalizedColumns.length) return;

        const headRow = document.createElement('tr');
        normalizedColumns.forEach((column) => {
            const th = document.createElement('th');
            th.textContent = String(column);
            headRow.appendChild(th);
        });
        headHost.appendChild(headRow);

        normalizedRows.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            normalizedColumns.forEach((column, columnIndex) => {
                const td = document.createElement('td');
                if (editable) {
                    const value = row?.[column];
                    td.appendChild(this.createEditor(value, (nextValue) => {
                        this.setDraftRowValue(row, column, rowIndex, nextValue);
                    }));
                } else {
                    td.textContent = row?.[column] == null ? '' : String(row[column]);
                }
                tr.appendChild(td);
            });
            bodyHost.appendChild(tr);
        });
    }

    renderGrid(columns, rows, fields, target = null, editable = false) {
        const host = target || this.gridEl;
        if (!host) return;
        host.replaceChildren();

        let normalizedRows = Array.isArray(rows) ? rows : [];
        if (!normalizedRows.length && fields && typeof fields === 'object' && Object.keys(fields).length) {
            normalizedRows = [fields];
        }

        if (!normalizedRows.length) {
            const empty = document.createElement('p');
            empty.className = 'treepanel-empty';
            empty.textContent = 'No details available.';
            host.appendChild(empty);
            return;
        }

        const normalizedColumns = Array.isArray(columns) && columns.length
            ? columns
            : Object.keys(normalizedRows[0] || {});

        normalizedRows.forEach((row, rowIndex) => {
            const card = document.createElement('article');
            card.className = 'treepanel-grid-card';

            normalizedColumns.forEach((column, columnIndex) => {
                const field = document.createElement('div');
                field.className = 'treepanel-grid-field';

                const keyEl = document.createElement('span');
                keyEl.className = 'treepanel-grid-key';
                keyEl.textContent = String(column);

                const valueEl = editable
                    ? this.createEditor(row?.[column], (nextValue) => {
                        this.setDraftCell(rowIndex, column, columnIndex, nextValue);
                    })
                    : document.createElement('span');

                if (!editable) {
                    valueEl.className = 'treepanel-grid-value';
                    valueEl.textContent = row?.[column] == null ? '' : String(row[column]);
                } else {
                    valueEl.classList.add('treepanel-grid-editor');
                }

                field.append(keyEl, valueEl);
                card.appendChild(field);
            });

            host.appendChild(card);
        });
    }

    startEditing() {
        if (!this.inlineEditEnabled || !this.currentDetails) return;
        this.state.editing = true;
        this.editDraft = this.cloneDetails(this.currentDetails);
        this.renderDetails(this.editDraft);
    }

    cancelEditing() {
        if (!this.state.editing) return;
        this.state.editing = false;
        this.editDraft = null;
        if (this.currentDetails) {
            this.renderDetails(this.currentDetails);
        }
    }

    async saveDetails() {
        if (!this.state.editing || !this.editDraft || !this.state.selectedId) return;
        if (!this.detailsSource) {
            this.setLoading(false, this.state.selectedLabel || 'node');
            this.statusEl.textContent = 'Save skipped: data-details-source is not configured.';
            this.statusEl.setAttribute('data-state', 'ready');
            return;
        }

        this.state.saving = true;
        this.updateEditControls();
        this.statusEl.textContent = `Saving ${this.state.selectedLabel || 'details'}...`;
        this.statusEl.setAttribute('data-state', 'loading');

        const detail = this.cloneDetails(this.editDraft);
        const payload = {
            id: this.state.selectedId,
            label: this.state.selectedLabel,
            detail
        };

        try {
            const response = await fetch(this.buildDetailsSourceUrl({
                id: this.state.selectedId,
                label: this.state.selectedLabel
            }), {
                method: this.saveMethod || 'PUT',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Save failed (${response.status})`);
            }

            let nextPayload = null;
            try {
                nextPayload = await response.json();
            } catch (_error) {}

            const normalized = this.normalizeDetailsPayload(
                nextPayload?.detail || nextPayload || detail,
                this.state.selectedId,
                this.state.selectedLabel
            );

            this.state.editing = false;
            this.editDraft = null;
            this.currentDetails = normalized;
            this.renderDetails(normalized);
            this.statusEl.textContent = `Saved details for ${this.state.selectedLabel || 'node'}`;
            this.statusEl.setAttribute('data-state', 'ready');
            this.dispatchEvent('detailssaved', {
                id: this.state.selectedId,
                label: this.state.selectedLabel,
                details: normalized
            });
        } catch (error) {
            this.statusEl.textContent = String(error?.message || 'Save failed');
            this.statusEl.setAttribute('data-state', 'ready');
        } finally {
            this.state.saving = false;
            this.updateEditControls();
        }
    }

    cloneDetails(details) {
        return JSON.parse(JSON.stringify(details || {}));
    }

    updateEditControls() {
        if (!this.editButton || !this.saveButton || !this.cancelButton) return;
        const canEdit = this.inlineEditEnabled && !!this.currentDetails;
        this.editButton.hidden = !canEdit || this.state.editing;
        this.saveButton.hidden = !canEdit || !this.state.editing;
        this.cancelButton.hidden = !canEdit || !this.state.editing;
        this.editButton.disabled = this.state.saving;
        this.saveButton.disabled = this.state.saving;
        this.cancelButton.disabled = this.state.saving;
    }

    createEditor(value, onChange) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'treepanel-input';
        input.value = value == null ? '' : String(value);
        input.addEventListener('input', () => {
            if (typeof onChange === 'function') {
                onChange(input.value);
            }
        });
        return input;
    }

    setDraftField(fieldName, value) {
        if (!this.editDraft || !this.editDraft.fields || typeof this.editDraft.fields !== 'object') return;
        this.editDraft.fields[fieldName] = value;
    }

    setDraftRowValue(rowRef, columnName, fallbackRowIndex, value) {
        if (!this.editDraft || !Array.isArray(this.editDraft.rows)) return;
        const rowIndex = this.editDraft.rows.findIndex((row) => row === rowRef);
        const index = rowIndex >= 0 ? rowIndex : Number(fallbackRowIndex);
        if (Number.isNaN(index) || index < 0 || index >= this.editDraft.rows.length) return;
        if (!this.editDraft.rows[index] || typeof this.editDraft.rows[index] !== 'object') {
            this.editDraft.rows[index] = {};
        }
        this.editDraft.rows[index][columnName] = value;
    }

    setDraftCell(rowIndex, columnName, fallbackIndex, value) {
        if (!this.editDraft || !Array.isArray(this.editDraft.rows)) return;
        const idx = Number(rowIndex);
        if (Number.isNaN(idx) || idx < 0 || idx >= this.editDraft.rows.length) {
            this.setDraftRowValue(null, columnName, fallbackIndex, value);
            return;
        }
        if (!this.editDraft.rows[idx] || typeof this.editDraft.rows[idx] !== 'object') {
            this.editDraft.rows[idx] = {};
        }
        this.editDraft.rows[idx][columnName] = value;
    }

    setLoading(loading, label = '') {
        this.state.loading = !!loading;
        if (!this.statusEl) return;
        if (loading) {
            this.statusEl.textContent = `Loading ${label || 'details'}...`;
            this.statusEl.setAttribute('data-state', 'loading');
        } else {
            this.statusEl.textContent = label ? `Showing details for ${label}` : 'Select a node to view details.';
            this.statusEl.setAttribute('data-state', 'ready');
        }
    }
}

if (typeof window !== 'undefined') {
    window.TreePanelComponent = TreePanelComponent;
}

export { TreePanelComponent };
