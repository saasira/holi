const DEFAULT_NODE_SIZE = { width: 210, height: 118 };

function stringifyWorkflowState(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch (_error) {
        return String(value);
    }
}

function normalizeWorkflowStep(step = {}, index = 0) {
    const id = String(step?.id || step?.value || `step_${index + 1}`);
    const label = String(step?.label || step?.name || id);
    const serializedState = step?.serializedState ?? step?.state ?? step?.payload ?? step?.expression ?? '';
    return {
        id,
        label,
        description: String(step?.description || ''),
        engineHint: String(step?.engineHint || step?.engine || ''),
        serializedState: stringifyWorkflowState(serializedState)
    };
}

function normalizeWorkflowSteps(payload) {
    const rawSteps = Array.isArray(payload) ? payload : (Array.isArray(payload?.steps) ? payload.steps : []);
    return rawSteps.map((step, index) => normalizeWorkflowStep(step, index));
}

function normalizeNodeTypes(payload) {
    const source = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload?.types) ? payload.types : []);
    const types = source.map((type, index) => {
        const id = String(type?.id || type?.value || `type_${index + 1}`).trim().toLowerCase();
        const outputs = Array.isArray(type?.outputs) && type.outputs.length
            ? type.outputs.map((output) => String(output || '').trim()).filter(Boolean)
            : [id === 'decision' ? 'true' : 'default'];
        return {
            id,
            label: String(type?.label || type?.name || id),
            title: String(type?.title || type?.label || type?.name || id),
            outputs: outputs.length ? outputs : ['default']
        };
    }).filter((type) => type.id);

    if (types.length) return types;
    return [
        { id: 'action', label: 'Action Step', title: 'Action Step', outputs: ['default'] },
        { id: 'decision', label: 'Decision Gate', title: 'Decision Gate', outputs: ['true', 'false'] }
    ];
}

function getNodeType(nodeTypes = [], id = '') {
    return nodeTypes.find((type) => type.id === String(id || '').toLowerCase()) || nodeTypes[0] || null;
}

function normalizeWorkflowNode(node = {}, index = 0, options = {}) {
    const nodeTypes = normalizeNodeTypes(options.nodeTypes || []);
    const defaultType = nodeTypes[0]?.id || 'action';
    const requestedType = String(node.type || defaultType).toLowerCase();
    const typeConfig = getNodeType(nodeTypes, requestedType) || getNodeType(nodeTypes, defaultType);
    const type = typeConfig?.id || defaultType;
    const id = String(node.id || `node_${Date.now()}_${index + 1}`);
    return {
        id,
        type,
        title: String(node.title || typeConfig?.title || typeConfig?.label || `Node ${index + 1}`),
        processStepId: String(node.processStepId || ''),
        processStepLabel: String(node.processStepLabel || ''),
        engineHint: String(node.engineHint || ''),
        serializedState: stringifyWorkflowState(node.serializedState ?? node.processStepState ?? ''),
        x: Number.isFinite(Number(node.x)) ? Number(node.x) : 80 + index * 260,
        y: Number.isFinite(Number(node.y)) ? Number(node.y) : 80
    };
}

function normalizeWorkflowGraph(payload = {}, options = {}) {
    const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
    const connections = Array.isArray(payload.connections) ? payload.connections : [];
    return {
        schemaVersion: payload.schemaVersion || 'holi-workflow/v1',
        id: String(payload.id || options.workflowId || 'workflow'),
        title: String(payload.title || options.workflowTitle || 'Workflow'),
        nodes: nodes.map((node, index) => normalizeWorkflowNode(node, index, options)),
        connections: connections.map((connection, index) => ({
            id: String(connection.id || `connection_${index + 1}`),
            from: String(connection.from || ''),
            to: String(connection.to || ''),
            branch: String(connection.branch || 'default')
        })).filter((connection) => connection.from && connection.to)
    };
}

function validateWorkflowPayloadShape(payload = {}) {
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

function hasWorkflowCycle(nodes = [], connections = []) {
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

function validateWorkflowGraph(graph = {}, options = {}) {
    const issues = [];
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const connections = Array.isArray(graph.connections) ? graph.connections : [];
    const nodeTypes = normalizeNodeTypes(options.nodeTypes || []);
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
        if (options.requireProcessSteps !== false && !node.processStepId) {
            issues.push({ code: 'missing_process_step', message: `${node.title || node.id} has no process step selected.`, nodeId: node.id });
        }
        const typeConfig = getNodeType(nodeTypes, node.type);
        const requiredOutputs = (typeConfig?.outputs || []).filter((output) => output !== 'default');
        requiredOutputs.forEach((branch) => {
            const hasBranch = connections.some((connection) => connection.from === node.id && connection.branch === branch);
            if (!hasBranch) {
                issues.push({ code: 'missing_branch', message: `${node.title || node.id} is missing a ${branch} branch.`, nodeId: node.id, branch });
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
    if (options.requireSingleStart !== false && nodes.length > 0 && startNodes.length !== 1) {
        issues.push({ code: 'start_node_count', message: `Workflow must have exactly one start node; found ${startNodes.length}.` });
    }

    if (!options.allowCycles && hasWorkflowCycle(nodes, connections)) {
        issues.push({ code: 'cycle_detected', message: 'Workflow contains a cycle.' });
    }

    return { valid: issues.length === 0, issues };
}

function computeWorkflowLevels(graph = {}) {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const connections = Array.isArray(graph.connections) ? graph.connections : [];
    const levels = {};
    const incoming = new Map(nodes.map((node) => [node.id, 0]));
    connections.forEach((connection) => {
        incoming.set(connection.to, (incoming.get(connection.to) || 0) + 1);
    });
    const queue = nodes.filter((node) => (incoming.get(node.id) || 0) === 0).map((node) => node.id);
    if (!queue.length && nodes[0]) queue.push(nodes[0].id);
    queue.forEach((id) => { levels[id] = 0; });
    while (queue.length) {
        const id = queue.shift();
        connections.filter((connection) => connection.from === id).forEach((connection) => {
            const nextLevel = (levels[id] || 0) + 1;
            if (levels[connection.to] == null || levels[connection.to] < nextLevel) {
                levels[connection.to] = nextLevel;
                queue.push(connection.to);
            }
        });
    }
    return levels;
}

export {
    DEFAULT_NODE_SIZE,
    computeWorkflowLevels,
    getNodeType,
    normalizeNodeTypes,
    normalizeWorkflowGraph,
    normalizeWorkflowNode,
    normalizeWorkflowSteps,
    stringifyWorkflowState,
    validateWorkflowGraph,
    validateWorkflowPayloadShape
};
