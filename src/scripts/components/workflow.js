import { Component } from './component.js';
import { TemplateRegistry } from '../utils/template_registry.js';

const NODE_SIZE = { width: 210, height: 118 };

class WorkflowComponent extends Component {
    static get selector() {
        return 'workflow, holi-workflow, workflow-builder';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'workflow';
    }

    static templateId = 'workflow-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = WorkflowComponent.templateId;
        this.stepsEndpoint = this.container.getAttribute('data-steps-endpoint') || this.container.getAttribute('steps-endpoint') || '';
        this.source = this.container.getAttribute('data-source') || '';
        this.workflowId = this.container.getAttribute('data-workflow-id') || 'workflow';
        this.workflowTitle = this.container.getAttribute('data-title') || 'Workflow';
        this.readonly = this.readBooleanAttr(['readonly', 'data-readonly'], false);
        this.allowCycles = this.readBooleanAttr(['allow-cycles', 'data-allow-cycles'], false);
        this.requireSingleStart = this.readBooleanAttr(['require-single-start', 'data-require-single-start'], true);
        this.requireProcessSteps = this.readBooleanAttr(['require-process-steps', 'data-require-process-steps'], true);
        this.steps = [];
        this.validation = { valid: true, issues: [] };
        this.draggedType = '';
        this.selectedNodeId = '';
        this.selectedConnectionId = '';
        this.linking = null;
        this.dragState = null;
        this.editingNodeId = '';
        // Engine-neutral toolbox: which draggable node types exist. Configurable via
        // `node-types` / `data-node-types` (JSON [{type,label}]); defaults are generic.
        this.nodeTypes = this.readJsonAttr(['node-types', 'data-node-types'], null) || [
            { type: 'action', label: 'Action Step' },
            { type: 'decision', label: 'Decision Gate', branches: ['true', 'false'] }
        ];
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
        this.isApplyingHistory = false;
        this.hovering = false;
        this.graph = this.createEmptyGraph();
        this.boundClick = (event) => this.handleClick(event);
        this.boundSubmit = (event) => this.handleDialogSubmit(event);
        this.boundPointerDown = (event) => this.handlePointerDown(event);
        this.boundPointerMove = (event) => this.handlePointerMove(event);
        this.boundPointerUp = (event) => this.handlePointerUp(event);
        this.boundKeyDown = (event) => this.handleKeyDown(event);
        this.boundDragStart = (event) => this.handleDragStart(event);
        this.boundDragOver = (event) => event.preventDefault();
        this.boundDrop = (event) => this.handleDrop(event);
        this.boundStepChange = () => this.applySelectedStepToDialog();
        this.boundStepSearch = () => this.handleStepSearch();
        this.boundPointerEnter = () => { this.hovering = true; };
        this.boundPointerLeave = () => { this.hovering = false; };
        this.boundConnectionCondition = () => this.applyConnectionCondition();
        this.init();
    }

    async init() {
        this.validateStructure();
        await this.loadSteps();
        await this.loadInitialGraph();
        await this.render();
    }

    createEmptyGraph() {
        return {
            schemaVersion: 'holi-workflow/v1',
            id: this.workflowId,
            title: this.workflowTitle,
            nodes: [],
            connections: []
        };
    }

    async loadSteps() {
        const inline = this.container.getAttribute('data-steps') || '';
        if (inline.trim()) {
            this.steps = this.normalizeSteps(this.parseJson(inline));
            return;
        }
        if (!this.stepsEndpoint) {
            this.steps = [];
            return;
        }
        try {
            const response = await fetch(this.stepsEndpoint, { credentials: 'same-origin' });
            if (!response.ok) {
                this.steps = [];
                return;
            }
            this.steps = this.normalizeSteps(await response.json());
        } catch (_error) {
            this.steps = [];
        }
    }

    async loadInitialGraph() {
        const inline = this.container.getAttribute('data-definition') || '';
        let payload = null;
        if (inline.trim()) {
            payload = this.parseJson(inline);
        } else if (this.source.trim()) {
            try {
                const response = await fetch(this.source, { credentials: 'same-origin' });
                if (response.ok) payload = await response.json();
            } catch (_error) {}
        }
        this.graph = this.normalizeGraph(payload || this.graph);
    }

    normalizeSteps(payload) {
        const rawSteps = Array.isArray(payload) ? payload : (Array.isArray(payload?.steps) ? payload.steps : []);
        return rawSteps.map((step, index) => {
            const id = String(step?.id || step?.value || `step_${index + 1}`);
            const label = String(step?.label || step?.name || id);
            const serializedState = step?.serializedState ?? step?.state ?? step?.payload ?? step?.expression ?? '';
            return {
                id,
                label,
                description: String(step?.description || ''),
                serializedState: this.stringifyState(serializedState)
            };
        });
    }

    normalizeGraph(payload = {}) {
        const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
        const connections = Array.isArray(payload.connections) ? payload.connections : [];
        return {
            schemaVersion: payload.schemaVersion || 'holi-workflow/v1',
            id: String(payload.id || this.workflowId),
            title: String(payload.title || this.workflowTitle),
            nodes: nodes.map((node, index) => this.normalizeNode(node, index)),
            connections: connections.map((connection, index) => ({
                id: String(connection.id || `connection_${index + 1}`),
                from: String(connection.from || ''),
                to: String(connection.to || ''),
                branch: String(connection.branch || 'default'),
                condition: String(connection.condition || '')
            })).filter((connection) => connection.from && connection.to)
        };
    }

    normalizeNode(node = {}, index = 0) {
        const type = this.resolveNodeType(node.type);
        const id = String(node.id || `node_${Date.now()}_${index + 1}`);
        return {
            id,
            type,
            title: String(node.title || this.getNodeTypeLabel(type) || 'Step'),
            processStepId: String(node.processStepId || ''),
            processStepLabel: String(node.processStepLabel || ''),
            serializedState: this.stringifyState(node.serializedState ?? node.processStepState ?? ''),
            x: Number.isFinite(Number(node.x)) ? Number(node.x) : 80 + index * 260,
            y: Number.isFinite(Number(node.y)) ? Number(node.y) : 80
        };
    }

    /** Resolve a requested node type against the configured set; falls back to the first type. */
    resolveNodeType(type) {
        const requested = String(type || '').trim().toLowerCase();
        const match = (this.nodeTypes || []).find((nt) => String(nt.type).toLowerCase() === requested);
        if (match) return match.type;
        return (this.nodeTypes && this.nodeTypes[0] && this.nodeTypes[0].type) || 'action';
    }

    stringifyState(value) {
        if (value == null) return '';
        if (typeof value === 'string') return value;
        try {
            return JSON.stringify(value);
        } catch (_error) {
            return String(value);
        }
    }

    parseJson(raw) {
        try {
            return JSON.parse(String(raw || ''));
        } catch (_error) {
            return null;
        }
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-workflow');
        this.stageEl = this.container.querySelector('[data-role="stage"]');
        this.linesEl = this.container.querySelector('[data-role="lines"]');
        this.nodesEl = this.container.querySelector('[data-role="nodes"]');
        this.jsonEl = this.container.querySelector('[data-role="json"]');
        this.statusEl = this.container.querySelector('[data-role="status"]');
        this.issuesEl = this.container.querySelector('[data-role="issues"]');
        this.modalEl = this.container.querySelector('[data-role="modal"]');
        this.dialogEl = this.container.querySelector('[data-role="dialog"]');
        this.stepSelectEl = this.container.querySelector('[data-field="processStep"]');
        this.stepSearchEl = this.container.querySelector('[data-field="processStepSearch"]');
        this.serializedStateEl = this.container.querySelector('[data-field="serializedState"]');
        this.nodeTypesEl = this.container.querySelector('[data-role="node-types"]');
        this.connectionInspectorEl = this.container.querySelector('[data-role="connection-inspector"]');
        this.connectionSummaryEl = this.container.querySelector('[data-role="connection-summary"]');
        this.connectionConditionEl = this.container.querySelector('[data-field="connection-condition"]');
        this.undoBtn = this.element.querySelector('[data-action="undo"]');
        this.redoBtn = this.element.querySelector('[data-action="redo"]');

        this.projectSlot('title');
        this.projectSlot('summary');
        this.projectSlot('actions');

        this.element.addEventListener('click', this.boundClick);
        this.element.addEventListener('pointerdown', this.boundPointerDown);
        this.element.addEventListener('dragstart', this.boundDragStart);
        this.element.addEventListener('pointerenter', this.boundPointerEnter);
        this.element.addEventListener('pointerleave', this.boundPointerLeave);
        document.addEventListener('pointermove', this.boundPointerMove);
        document.addEventListener('pointerup', this.boundPointerUp);
        document.addEventListener('keydown', this.boundKeyDown);
        this.stageEl.addEventListener('dragover', this.boundDragOver);
        this.stageEl.addEventListener('drop', this.boundDrop);
        this.dialogEl.addEventListener('submit', this.boundSubmit);
        this.stepSelectEl.addEventListener('change', this.boundStepChange);
        this.stepSearchEl?.addEventListener('input', this.boundStepSearch);
        this.connectionConditionEl?.addEventListener('input', this.boundConnectionCondition);
        this.element.dataset.readonly = this.readonly ? 'true' : 'false';

        this.renderNodeTypes();
        this.renderAll();
        this.pushHistory(); // baseline snapshot for undo
    }

    renderAll() {
        this.renderNodes();
        this.renderConnections();
        this.renderJson();
        this.renderIssues();
        this.renderStatus();
    }

    renderNodes() {
        const fragment = document.createDocumentFragment();
        this.graph.nodes.forEach((node) => {
            const nodeFragment = this.cloneTemplate('workflow-node-template');
            const el = nodeFragment.querySelector('[data-role="node"]');
            el.dataset.nodeId = node.id;
            el.dataset.nodeType = node.type;
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;
            el.classList.toggle('is-selected', node.id === this.selectedNodeId);
            el.classList.toggle('is-dragging', node.id === this.dragState?.nodeId);
            el.classList.toggle('is-linking', this.linking?.from === node.id);
            el.querySelector('[data-role="title"]').textContent = node.title;
            el.querySelector('[data-role="type"]').textContent = this.getNodeTypeLabel(node.type);
            el.querySelector('[data-role="step"]').textContent = node.processStepLabel || 'No process step selected';
            this.renderOutputPorts(el, node);
            fragment.appendChild(nodeFragment);
        });
        this.nodesEl.replaceChildren(fragment);
    }

    /** Outgoing branch labels for a node's type (configurable); a single 'default' when none declared. */
    getNodeBranches(node) {
        const def = (this.nodeTypes || []).find((nt) => nt.type === node?.type);
        const branches = Array.isArray(def?.branches)
            ? def.branches.map((branch) => String(branch || '').trim()).filter(Boolean)
            : [];
        return branches.length ? branches : ['default'];
    }

    getNodeTypeLabel(type) {
        const def = (this.nodeTypes || []).find((nt) => nt.type === type);
        return def?.label || String(type || '');
    }

    /** Vertical position (0..1) of a branch's output port on a node's right edge. */
    getBranchPortFraction(node, branch) {
        const branches = this.getNodeBranches(node);
        let index = branches.indexOf(String(branch || 'default'));
        if (index < 0) index = 0;
        return (index + 1) / (branches.length + 1);
    }

    /** Render one draggable output port per branch on the right edge of a node. */
    renderOutputPorts(nodeEl, node) {
        const branches = this.getNodeBranches(node);
        const labelled = branches.length > 1 || (branches[0] && branches[0] !== 'default');
        branches.forEach((branch, index) => {
            const portFragment = this.cloneTemplate('workflow-port-template');
            const port = portFragment.querySelector('[data-role="port-out"]');
            port.dataset.branch = branch;
            port.style.top = `${((index + 1) / (branches.length + 1)) * 100}%`;
            port.title = labelled ? `Drag to connect (${branch})` : 'Drag to a target node to connect';
            const label = port.querySelector('[data-role="port-label"]');
            if (label) label.textContent = labelled ? branch : '';
            nodeEl.appendChild(portFragment);
        });
    }

    renderConnections() {
        this.linesEl.replaceChildren();
        this.graph.connections.forEach((connection) => {
            const from = this.getNode(connection.from);
            const to = this.getNode(connection.to);
            if (!from || !to) return;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const startX = from.x + NODE_SIZE.width;
            const startY = from.y + NODE_SIZE.height * this.getBranchPortFraction(from, connection.branch);
            const endX = to.x;
            const endY = to.y + NODE_SIZE.height / 2;
            const mid = Math.max(48, Math.abs(endX - startX) / 2);
            path.setAttribute('d', `M ${startX} ${startY} C ${startX + mid} ${startY}, ${endX - mid} ${endY}, ${endX} ${endY}`);
            path.dataset.connectionId = connection.id;
            path.dataset.branch = connection.branch;
            path.classList.toggle('is-selected', connection.id === this.selectedConnectionId);
            path.classList.toggle('has-condition', Boolean(connection.condition));
            path.setAttribute('tabindex', this.readonly ? '-1' : '0');
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = connection.condition
                ? `${connection.branch}: ${connection.condition}`
                : connection.branch;
            path.appendChild(title);
            this.linesEl.appendChild(path);
        });

        // Rubber-band line while dragging from an output port.
        if (this.linking?.mode === 'drag' && this.linking.pointer) {
            const from = this.getNode(this.linking.from);
            if (from) {
                const startX = from.x + NODE_SIZE.width;
                const startY = from.y + NODE_SIZE.height * this.getBranchPortFraction(from, this.linking.branch);
                const { x: endX, y: endY } = this.linking.pointer;
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const mid = Math.max(48, Math.abs(endX - startX) / 2);
                path.setAttribute('d', `M ${startX} ${startY} C ${startX + mid} ${startY}, ${endX - mid} ${endY}, ${endX} ${endY}`);
                path.classList.add('is-linking');
                this.linesEl.appendChild(path);
            }
        }

        this.renderConnectionInspector();
    }

    /** Show the condition editor for the selected connection; hide it when nothing is selected. */
    renderConnectionInspector() {
        if (!this.connectionInspectorEl) return;
        const connection = this.selectedConnectionId ? this.getConnection(this.selectedConnectionId) : null;
        if (!connection || this.readonly) {
            this.connectionInspectorEl.hidden = true;
            return;
        }
        this.connectionInspectorEl.hidden = false;
        if (this.connectionSummaryEl) {
            this.connectionSummaryEl.textContent = `${connection.from} -> ${connection.to} (${connection.branch})`;
        }
        // Don't clobber the caret while the author is typing in this same field.
        if (this.connectionConditionEl && document.activeElement !== this.connectionConditionEl) {
            this.connectionConditionEl.value = connection.condition || '';
        }
    }

    /** Persist the inspector's condition input onto the selected connection. */
    applyConnectionCondition() {
        if (this.readonly) return;
        const connection = this.getConnection(this.selectedConnectionId);
        if (!connection) return;
        connection.condition = this.connectionConditionEl.value;
        this.renderConnections();
        this.notifyChange();
    }

    renderJson() {
        if (this.jsonEl) this.jsonEl.value = JSON.stringify(this.exportGraph(), null, 2);
    }

    renderStatus(message = '') {
        if (!this.statusEl) return;
        if (message) {
            this.statusEl.textContent = message;
            return;
        }
        if (this.linking) {
            this.statusEl.textContent = `Choose a target node for the ${this.linking.branch} branch.`;
            return;
        }
        if (this.selectedConnectionId) {
            const connection = this.getConnection(this.selectedConnectionId);
            this.statusEl.textContent = connection
                ? `Selected connection: ${connection.from} -> ${connection.to} (${connection.branch})`
                : '';
            return;
        }
        this.statusEl.textContent = `${this.graph.nodes.length} nodes, ${this.graph.connections.length} connections`;
    }

    renderIssues() {
        if (!this.issuesEl) return;
        this.issuesEl.replaceChildren();
        (this.validation.issues || []).slice(0, 6).forEach((issue) => {
            const item = document.createElement('li');
            item.textContent = issue.message;
            this.issuesEl.appendChild(item);
        });
    }

    renderNodeTypes() {
        if (!this.nodeTypesEl) return;
        this.nodeTypesEl.replaceChildren();
        (this.nodeTypes || []).forEach((nodeType) => {
            const type = String(nodeType?.type || '').trim();
            if (!type) return;
            const fragment = this.cloneTemplate('workflow-node-type-template');
            const button = fragment.querySelector('[data-role="node-type"]');
            button.dataset.nodeType = type;
            button.textContent = nodeType.label || type;
            this.nodeTypesEl.appendChild(fragment);
        });
    }

    handleClick(event) {
        const actionEl = event.target.closest('[data-action]');
        const nodeEl = event.target.closest('[data-role="node"]');
        const connectionEl = event.target.closest('[data-connection-id]');
        // Resolve everything to plain strings up-front: any handler below may re-render and detach
        // these elements, so we must not read from them afterwards.
        const action = actionEl && this.element.contains(actionEl) ? actionEl.getAttribute('data-action') : '';
        const nodeId = nodeEl ? nodeEl.dataset.nodeId : '';

        if (connectionEl && this.linesEl.contains(connectionEl)) {
            this.selectConnection(connectionEl.dataset.connectionId);
            return;
        }

        // Click a toolbox node type to add a node of that type (also draggable onto the canvas).
        const typeEl = event.target.closest('[data-role="node-type"]');
        if (typeEl && !this.readonly) {
            this.addNode(typeEl.dataset.nodeType);
            return;
        }

        // A command button (toolbar or on a node) — run the action. Handled before any node
        // selection re-render, so the button element isn't detached out from under us.
        if (action) {
            if (action === 'validate') this.validateAndReport();
            if (action === 'save') this.saveWorkflow();
            if (this.readonly && !['validate', 'export-json', 'close-dialog', 'save'].includes(action)) return;
            if (action === 'undo') this.undo();
            if (action === 'redo') this.redo();
            if (action === 'auto-layout') this.autoLayout();
            if (action === 'remove-connection') this.removeSelectedConnection();
            if (action === 'export-json') this.exportWorkflow();
            if (action === 'import-json') this.importWorkflow();
            if (action === 'clear') this.clearWorkflow();
            if (action === 'edit-node' && nodeId) this.openDialog(nodeId);
            if (action === 'close-dialog') this.closeDialog();
            if (action === 'delete-node') this.deleteEditingNode();
            if (action === 'disconnect-node') this.disconnectEditingNode();
            return;
        }

        // Plain click on a node body — select it.
        if (nodeId) this.selectNode(nodeId);
    }

    handlePointerDown(event) {
        if (this.readonly) return;
        const nodeEl = event.target.closest('[data-role="node"]');
        if (!nodeEl || !this.nodesEl.contains(nodeEl)) return;

        // Drag from a branch output port to draw a connection to a target node.
        const portEl = event.target.closest('[data-role="port-out"]');
        if (portEl) {
            const source = this.getNode(nodeEl.dataset.nodeId);
            if (!source) return;
            const branch = portEl.dataset.branch || 'default';
            this.linking = { from: source.id, branch, mode: 'drag', pointer: null };
            this.selectedNodeId = source.id;
            this.selectedConnectionId = '';
            event.preventDefault();
            this.renderNodes();
            this.renderStatus();
            return;
        }

        if (event.target.closest('button, input, select, textarea, label')) return;
        const node = this.getNode(nodeEl.dataset.nodeId);
        if (!node) return;
        this.dragState = {
            nodeId: node.id,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startX: node.x,
            startY: node.y,
            moved: false
        };
        this.selectedNodeId = node.id;
        this.selectedConnectionId = '';
        nodeEl.setPointerCapture?.(event.pointerId);
        nodeEl.classList.add('is-dragging');
    }

    handlePointerMove(event) {
        if (this.linking?.mode === 'drag') {
            const rect = this.stageEl.getBoundingClientRect();
            this.linking.pointer = {
                x: event.clientX - rect.left + this.stageEl.scrollLeft,
                y: event.clientY - rect.top + this.stageEl.scrollTop
            };
            this.renderConnections();
            return;
        }
        if (!this.dragState) return;
        const node = this.getNode(this.dragState.nodeId);
        if (!node) return;
        const dx = event.clientX - this.dragState.startClientX;
        const dy = event.clientY - this.dragState.startClientY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.dragState.moved = true;
        node.x = Math.max(20, this.dragState.startX + dx);
        node.y = Math.max(20, this.dragState.startY + dy);
        const nodeEl = this.nodesEl.querySelector(`[data-node-id="${node.id}"]`);
        if (nodeEl) {
            nodeEl.style.left = `${node.x}px`;
            nodeEl.style.top = `${node.y}px`;
        }
        this.renderConnections();
        this.renderJson();
    }

    handlePointerUp(event) {
        // Finish a port drag: connect to whatever node is under the pointer.
        if (this.linking?.mode === 'drag') {
            const under = event ? document.elementFromPoint(event.clientX, event.clientY) : null;
            const targetEl = under?.closest?.('[data-role="node"]');
            const targetId = targetEl && this.nodesEl.contains(targetEl) ? targetEl.dataset.nodeId : '';
            if (targetId && targetId !== this.linking.from) {
                this.completeConnection(targetId);
            } else {
                this.linking = null;
                this.renderAll();
            }
            return;
        }
        if (!this.dragState) return;
        const moved = this.dragState.moved;
        this.dragState = null;
        this.renderNodes();
        this.renderConnections();
        this.renderStatus();
        if (moved) this.notifyChange();
    }

    handleKeyDown(event) {
        if (event.key === 'Escape') {
            if (this.modalEl && !this.modalEl.hidden) {
                this.closeDialog();
                return;
            }
            if (this.linking) {
                this.linking = null;
                this.renderAll();
            }
            return;
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
            // Only when pointing at this builder, not readonly, dialog closed, and not typing in a field.
            if (this.readonly || !this.hovering) return;
            if (this.modalEl && !this.modalEl.hidden) return;
            const tag = String(document.activeElement?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            if (this.selectedConnectionId) {
                event.preventDefault();
                this.removeSelectedConnection();
            } else if (this.selectedNodeId) {
                event.preventDefault();
                this.deleteNode(this.selectedNodeId);
            }
        }
    }

    handleDragStart(event) {
        const source = event.target.closest('[data-node-type]');
        if (!source) return;
        this.draggedType = source.dataset.nodeType;
        event.dataTransfer?.setData?.('text/plain', this.draggedType);
    }

    handleDrop(event) {
        event.preventDefault();
        if (this.readonly) return;
        const type = event.dataTransfer?.getData?.('text/plain') || this.draggedType || 'action';
        const rect = this.stageEl.getBoundingClientRect();
        const x = event.clientX - rect.left + this.stageEl.scrollLeft - NODE_SIZE.width / 2;
        const y = event.clientY - rect.top + this.stageEl.scrollTop - NODE_SIZE.height / 2;
        this.addNode(type, x, y);
    }

    addNode(type, x = 80, y = 80) {
        if (this.readonly) return;
        const node = this.normalizeNode({
            id: this.nextNodeId(),
            type: this.resolveNodeType(type),
            x: Math.max(20, x),
            y: Math.max(20, y)
        });
        this.graph.nodes.push(node);
        this.selectedNodeId = node.id;
        this.renderAll();
        this.notifyChange();
    }

    selectNode(id) {
        this.selectedNodeId = String(id || '');
        this.selectedConnectionId = '';
        this.renderNodes();
        this.renderConnections();
        this.renderStatus();
    }

    selectConnection(id) {
        this.selectedConnectionId = String(id || '');
        this.selectedNodeId = '';
        this.linking = null;
        this.renderNodes();
        this.renderConnections();
        this.renderStatus();
    }

    completeConnection(to) {
        if (!this.linking || this.linking.from === to) return;
        const branch = this.linking.branch || 'default';
        const existing = this.graph.connections.find((connection) => connection.from === this.linking.from && connection.branch === branch);
        if (existing) existing.to = to;
        else {
            this.graph.connections.push({
                id: this.nextConnectionId(),
                from: this.linking.from,
                to,
                branch,
                condition: ''
            });
        }
        this.linking = null;
        this.renderAll();
        this.notifyChange();
    }

    removeSelectedConnection() {
        if (this.readonly) return;
        if (!this.selectedConnectionId) {
            this.renderStatus('Select a connection line before removing it.');
            return;
        }
        this.graph.connections = this.graph.connections.filter((connection) => connection.id !== this.selectedConnectionId);
        this.selectedConnectionId = '';
        this.renderAll();
        this.notifyChange();
    }

    openDialog(id) {
        if (this.readonly) return;
        const node = this.getNode(id);
        if (!node) return;
        this.editingNodeId = id;
        this.container.querySelector('[data-role="dialog-title"]').textContent = `Configure ${node.title}`;
        this.container.querySelector('[data-field="title"]').value = node.title;
        if (this.stepSearchEl) this.stepSearchEl.value = '';
        this.renderStepOptions(node.processStepId, '');
        this.serializedStateEl.value = node.serializedState || '';
        this.modalEl.hidden = false;
    }

    renderStepOptions(selectedId = '', filter = '') {
        this.stepSelectEl.replaceChildren();
        const empty = this.cloneTemplate('workflow-step-option-template').querySelector('option');
        empty.value = '';
        empty.textContent = 'Select a process step';
        this.stepSelectEl.appendChild(empty);
        const query = String(filter || '').trim().toLowerCase();
        this.steps
            .filter((step) => !query
                || step.label.toLowerCase().includes(query)
                || String(step.description || '').toLowerCase().includes(query))
            .forEach((step) => {
                const option = this.cloneTemplate('workflow-step-option-template').querySelector('option');
                option.value = step.id;
                option.textContent = step.label;
                option.selected = step.id === selectedId;
                this.stepSelectEl.appendChild(option);
            });
    }

    handleStepSearch() {
        this.renderStepOptions(this.stepSelectEl.value, this.stepSearchEl?.value || '');
    }

    applySelectedStepToDialog() {
        const step = this.getStep(this.stepSelectEl.value);
        this.serializedStateEl.value = step?.serializedState || '';
    }

    handleDialogSubmit(event) {
        event.preventDefault();
        const node = this.getNode(this.editingNodeId);
        if (!node) return;
        const title = this.container.querySelector('[data-field="title"]').value.trim();
        const step = this.getStep(this.stepSelectEl.value);
        node.title = title || node.title;
        node.processStepId = step?.id || '';
        node.processStepLabel = step?.label || '';
        node.serializedState = step?.serializedState || '';
        this.closeDialog();
        this.renderAll();
        this.notifyChange();
    }

    closeDialog() {
        this.modalEl.hidden = true;
        this.editingNodeId = '';
    }

    deleteNode(id) {
        if (this.readonly || !id) return;
        this.graph.nodes = this.graph.nodes.filter((node) => node.id !== id);
        this.graph.connections = this.graph.connections.filter((connection) => connection.from !== id && connection.to !== id);
        if (this.selectedNodeId === id) this.selectedNodeId = '';
        this.renderAll();
        this.notifyChange();
    }

    deleteEditingNode() {
        if (this.readonly || !this.editingNodeId) return;
        const id = this.editingNodeId;
        this.closeDialog();
        this.deleteNode(id);
    }

    disconnectEditingNode() {
        if (this.readonly) return;
        if (!this.editingNodeId) return;
        this.graph.connections = this.graph.connections.filter((connection) => connection.from !== this.editingNodeId);
        this.closeDialog();
        this.renderAll();
        this.notifyChange();
    }

    autoLayout() {
        if (this.readonly) return;
        const levels = this.computeLevels();
        const rows = {};
        this.graph.nodes.forEach((node) => {
            const level = levels[node.id] ?? 0;
            if (!rows[level]) rows[level] = [];
            rows[level].push(node);
        });
        Object.keys(rows).forEach((levelKey) => {
            rows[levelKey].forEach((node, index) => {
                node.x = 60 + Number(levelKey) * 280;
                node.y = 60 + index * 170;
            });
        });
        this.renderAll();
        this.notifyChange();
    }

    computeLevels() {
        const levels = {};
        const incoming = new Map(this.graph.nodes.map((node) => [node.id, 0]));
        this.graph.connections.forEach((connection) => {
            incoming.set(connection.to, (incoming.get(connection.to) || 0) + 1);
        });
        const queue = this.graph.nodes.filter((node) => (incoming.get(node.id) || 0) === 0).map((node) => node.id);
        if (!queue.length && this.graph.nodes[0]) queue.push(this.graph.nodes[0].id);
        queue.forEach((id) => { levels[id] = 0; });
        while (queue.length) {
            const id = queue.shift();
            this.graph.connections.filter((connection) => connection.from === id).forEach((connection) => {
                const nextLevel = (levels[id] || 0) + 1;
                if (levels[connection.to] == null || levels[connection.to] < nextLevel) {
                    levels[connection.to] = nextLevel;
                    queue.push(connection.to);
                }
            });
        }
        return levels;
    }

    exportWorkflow() {
        this.renderJson();
        this.dispatchWorkflowEvent('workflowexport');
    }

    importWorkflow() {
        if (this.readonly) return;
        const payload = this.parseJson(this.jsonEl?.value || '');
        if (!payload) {
            this.renderStatus('Import failed: invalid JSON.');
            this.validation = {
                valid: false,
                issues: [{ code: 'invalid_json', message: 'Import failed: invalid JSON.' }]
            };
            this.renderIssues();
            return;
        }
        const validation = this.validatePayloadShape(payload);
        if (!validation.valid) {
            this.validation = validation;
            this.renderIssues();
            this.renderStatus('Import failed: workflow schema is invalid.');
            this.dispatchValidationEvent(validation);
            return;
        }
        this.graph = this.normalizeGraph(payload);
        this.linking = null;
        this.selectedNodeId = '';
        this.selectedConnectionId = '';
        this.validation = this.validateWorkflow();
        this.renderAll();
        this.notifyChange();
    }

    clearWorkflow() {
        if (this.readonly) return;
        this.graph = this.createEmptyGraph();
        this.linking = null;
        this.selectedNodeId = '';
        this.selectedConnectionId = '';
        this.renderAll();
        this.notifyChange();
    }

    // -------------------------------------------------------------------------
    // Save + history (undo/redo)
    // -------------------------------------------------------------------------

    /** Validate and emit a cancelable `workflowsave` — the host persists the exported graph. */
    saveWorkflow() {
        this.validation = this.validateWorkflow();
        this.renderIssues();
        this.renderStatus(this.validation.valid
            ? 'Workflow ready to save.'
            : 'Workflow has validation issues.');
        this.element.dispatchEvent(new CustomEvent('workflowsave', {
            detail: { workflow: this.exportGraph(), validation: this.validation },
            cancelable: true
        }));
    }

    /** Record a change: snapshot for undo, then notify listeners. */
    notifyChange() {
        this.pushHistory();
        this.dispatchWorkflowEvent('workflowchange');
    }

    pushHistory() {
        if (this.isApplyingHistory) return;
        const snapshot = JSON.stringify(this.exportGraph());
        // Drop any redo tail, append, and cap the stack depth.
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(snapshot);
        if (this.history.length > this.maxHistory) this.history.shift();
        this.historyIndex = this.history.length - 1;
        this.updateUndoRedoState();
    }

    undo() {
        if (this.readonly) return;
        if (this.historyIndex <= 0) {
            this.renderStatus('Nothing to undo.');
            return;
        }
        this.historyIndex -= 1;
        this.applyHistorySnapshot(this.history[this.historyIndex]);
    }

    redo() {
        if (this.readonly) return;
        if (this.historyIndex >= this.history.length - 1) {
            this.renderStatus('Nothing to redo.');
            return;
        }
        this.historyIndex += 1;
        this.applyHistorySnapshot(this.history[this.historyIndex]);
    }

    applyHistorySnapshot(snapshot) {
        this.isApplyingHistory = true;
        try {
            this.graph = this.normalizeGraph(this.parseJson(snapshot) || this.createEmptyGraph());
            this.selectedNodeId = '';
            this.selectedConnectionId = '';
            this.linking = null;
            this.renderAll();
            this.dispatchWorkflowEvent('workflowchange');
        } finally {
            this.isApplyingHistory = false;
        }
        this.updateUndoRedoState();
    }

    updateUndoRedoState() {
        if (this.undoBtn) this.undoBtn.disabled = this.readonly || this.historyIndex <= 0;
        if (this.redoBtn) this.redoBtn.disabled = this.readonly || this.historyIndex >= this.history.length - 1;
    }

    validateAndReport() {
        this.validation = this.validateWorkflow();
        this.renderIssues();
        this.renderStatus(this.validation.valid ? 'Workflow validation passed.' : 'Workflow validation found issues.');
        this.dispatchValidationEvent(this.validation);
        return this.validation;
    }

    validatePayloadShape(payload = {}) {
        const issues = [];
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            issues.push({ code: 'payload_type', message: 'Workflow import must be a JSON object.' });
        }
        if (payload.nodes != null && !Array.isArray(payload.nodes)) {
            issues.push({ code: 'nodes_type', message: 'Workflow nodes must be an array.' });
        }
        if (payload.connections != null && !Array.isArray(payload.connections)) {
            issues.push({ code: 'connections_type', message: 'Workflow connections must be an array.' });
        }
        (Array.isArray(payload.nodes) ? payload.nodes : []).forEach((node, index) => {
            if (!node || typeof node !== 'object' || Array.isArray(node)) {
                issues.push({ code: 'node_type', message: `Node ${index + 1} must be an object.` });
                return;
            }
            if (node.id != null && String(node.id).trim() === '') {
                issues.push({ code: 'node_id', message: `Node ${index + 1} has an empty id.` });
            }
        });
        (Array.isArray(payload.connections) ? payload.connections : []).forEach((connection, index) => {
            if (!connection || typeof connection !== 'object' || Array.isArray(connection)) {
                issues.push({ code: 'connection_type', message: `Connection ${index + 1} must be an object.` });
            }
        });
        return { valid: issues.length === 0, issues };
    }

    validateWorkflow(graph = this.graph) {
        const issues = [];
        const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
        const connections = Array.isArray(graph.connections) ? graph.connections : [];
        const nodeIds = new Set();

        nodes.forEach((node) => {
            if (!node.id) {
                issues.push({ code: 'missing_node_id', message: 'A node is missing an id.' });
                return;
            }
            if (nodeIds.has(node.id)) {
                issues.push({ code: 'duplicate_node_id', message: `Duplicate node id: ${node.id}.`, nodeId: node.id });
            }
            nodeIds.add(node.id);
            if (this.requireProcessSteps && !node.processStepId) {
                issues.push({ code: 'missing_process_step', message: `${node.title || node.id} has no process step selected.`, nodeId: node.id });
            }
            // Branch validation, generic over each node type's declared branches. A multi-branch
            // node (a gate) must have a connection for every declared branch, and no connection may
            // use an undeclared branch.
            const declaredBranches = this.getNodeBranches(node);
            const outgoing = connections.filter((connection) => connection.from === node.id);
            const usedBranches = new Set(outgoing.map((connection) => connection.branch));
            if (declaredBranches.length > 1) {
                declaredBranches.forEach((branch) => {
                    if (!usedBranches.has(branch)) {
                        issues.push({ code: 'missing_branch', message: `${node.title || node.id} is missing a "${branch}" branch.`, nodeId: node.id });
                    }
                });
            }
            outgoing.forEach((connection) => {
                if (!declaredBranches.includes(connection.branch)) {
                    issues.push({ code: 'unknown_branch', message: `${node.title || node.id} has a connection on an undeclared branch "${connection.branch}".`, connectionId: connection.id });
                }
            });
        });

        connections.forEach((connection) => {
            if (!nodeIds.has(connection.from)) {
                issues.push({ code: 'missing_connection_source', message: `Connection ${connection.id} has an unknown source node.`, connectionId: connection.id });
            }
            if (!nodeIds.has(connection.to)) {
                issues.push({ code: 'missing_connection_target', message: `Connection ${connection.id} has an unknown target node.`, connectionId: connection.id });
            }
        });

        const startNodes = nodes.filter((node) => !connections.some((connection) => connection.to === node.id));
        if (this.requireSingleStart && nodes.length > 0 && startNodes.length !== 1) {
            issues.push({ code: 'start_node_count', message: `Workflow must have exactly one start node; found ${startNodes.length}.` });
        }

        if (!this.allowCycles && this.hasCycle(nodes, connections)) {
            issues.push({ code: 'cycle_detected', message: 'Workflow contains a cycle.' });
        }

        return { valid: issues.length === 0, issues };
    }

    hasCycle(nodes = [], connections = []) {
        const visiting = new Set();
        const visited = new Set();
        const adjacency = new Map(nodes.map((node) => [node.id, []]));
        connections.forEach((connection) => {
            if (adjacency.has(connection.from)) adjacency.get(connection.from).push(connection.to);
        });

        const visit = (id) => {
            if (visiting.has(id)) return true;
            if (visited.has(id)) return false;
            visiting.add(id);
            const cyclic = (adjacency.get(id) || []).some((next) => visit(next));
            visiting.delete(id);
            visited.add(id);
            return cyclic;
        };

        return nodes.some((node) => visit(node.id));
    }

    exportGraph() {
        return JSON.parse(JSON.stringify(this.graph));
    }

    dispatchWorkflowEvent(name) {
        this.element.dispatchEvent(new CustomEvent(name, {
            detail: { workflow: this.exportGraph() },
            cancelable: true
        }));
    }

    dispatchValidationEvent(validation) {
        this.element.dispatchEvent(new CustomEvent('workflowvalidate', {
            detail: {
                workflow: this.exportGraph(),
                validation
            },
            cancelable: true
        }));
    }

    getNode(id) {
        return this.graph.nodes.find((node) => node.id === String(id || '')) || null;
    }

    getConnection(id) {
        return this.graph.connections.find((connection) => connection.id === String(id || '')) || null;
    }

    getStep(id) {
        return this.steps.find((step) => step.id === String(id || '')) || null;
    }

    nextNodeId() {
        let index = this.graph.nodes.length + 1;
        let id = `node_${index}`;
        const used = new Set(this.graph.nodes.map((node) => node.id));
        while (used.has(id)) {
            index += 1;
            id = `node_${index}`;
        }
        return id;
    }

    nextConnectionId() {
        let index = this.graph.connections.length + 1;
        let id = `connection_${index}`;
        const used = new Set(this.graph.connections.map((connection) => connection.id));
        while (used.has(id)) {
            index += 1;
            id = `connection_${index}`;
        }
        return id;
    }

    cloneTemplate(id) {
        const template = TemplateRegistry.getTemplate(id);
        if (!(template instanceof HTMLTemplateElement)) {
            throw new Error(`Template "${id}" not found`);
        }
        return template.content.cloneNode(true);
    }

    destroy() {
        this.element?.removeEventListener('click', this.boundClick);
        this.element?.removeEventListener('pointerdown', this.boundPointerDown);
        this.element?.removeEventListener('dragstart', this.boundDragStart);
        this.element?.removeEventListener('pointerenter', this.boundPointerEnter);
        this.element?.removeEventListener('pointerleave', this.boundPointerLeave);
        document.removeEventListener('pointermove', this.boundPointerMove);
        document.removeEventListener('pointerup', this.boundPointerUp);
        document.removeEventListener('keydown', this.boundKeyDown);
        this.stageEl?.removeEventListener('dragover', this.boundDragOver);
        this.stageEl?.removeEventListener('drop', this.boundDrop);
        this.dialogEl?.removeEventListener('submit', this.boundSubmit);
        this.stepSelectEl?.removeEventListener('change', this.boundStepChange);
        this.stepSearchEl?.removeEventListener('input', this.boundStepSearch);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.WorkflowComponent = WorkflowComponent;
}

export { WorkflowComponent };
