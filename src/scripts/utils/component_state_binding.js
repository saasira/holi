import { StateHub } from './state.js';

class ComponentStateBinding {
    constructor(component, options = {}) {
        this.component = component;
        this.options = {
            storeAttr: 'data-state-store',
            pathAttr: 'data-state-path',
            modeAttr: 'data-state-sync',
            debounceAttr: 'data-state-debounce-ms',
            defaultPath: options.defaultPath || component?.constructor?.componentName || 'component',
            eventName: options.eventName || 'stateupdate',
            getSnapshot: options.getSnapshot || (() => ({})),
            applySnapshot: options.applySnapshot || (() => {}),
            ...options
        };
        this.unsubscribe = null;
        this.boundOnComponentEvent = (event) => this.handleComponentEvent(event);
        this.pushTimer = null;
        this.applyingFromStore = false;
        this.pushingToStore = false;
        this.lastPushedJson = '';
        this.mode = 'both';
        this.debounceMs = 0;
    }

    resolveMode(rawMode) {
        const value = String(rawMode || 'both').trim().toLowerCase();
        if (value === 'in' || value === 'out' || value === 'both') return value;
        if (value === 'none' || value === 'off') return 'none';
        return 'both';
    }

    connect() {
        const container = this.component?.container;
        const element = this.component?.element;
        if (!(container instanceof HTMLElement) || !(element instanceof HTMLElement)) return;

        const storeId = String(container.getAttribute(this.options.storeAttr) || '').trim();
        if (!storeId) return;

        const store = StateHub.get(storeId);
        if (!store) return;

        this.store = store;
        this.storeId = storeId;
        this.path = String(container.getAttribute(this.options.pathAttr) || this.options.defaultPath || '').trim();
        this.mode = this.resolveMode(container.getAttribute(this.options.modeAttr));
        this.debounceMs = Math.max(0, Number(container.getAttribute(this.options.debounceAttr) || 0) || 0);
        const existingSnapshot = this.path ? StateHub.getByPath(store.proxy, this.path) : undefined;

        if (this.mode === 'none') return;
        if (this.mode === 'in' || this.mode === 'both') {
            this.unsubscribe = store.subscribe((_state, change) => {
                const targetPath = this.path;
                if (!targetPath) return;
                if (!change?.path) return;
                if (change.path === targetPath || change.path.startsWith(`${targetPath}.`) || targetPath.startsWith(`${change.path}.`)) {
                    this.pullFromStore();
                }
            });
            this.pullFromStore();
        }

        if (this.mode === 'out' || this.mode === 'both') {
            element.addEventListener(this.options.eventName, this.boundOnComponentEvent);
            if (existingSnapshot === undefined) {
                this.pushToStore(this.options.getSnapshot(this.component), true);
            }
        }
    }

    cloneSerializable(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_error) {
            return value;
        }
    }

    toJson(value) {
        try {
            return JSON.stringify(value);
        } catch (_error) {
            return '';
        }
    }

    pullFromStore() {
        if (!this.store || !this.path || this.pushingToStore) return;
        const snapshot = StateHub.getByPath(this.store.proxy, this.path);
        if (snapshot == null) return;

        const nextJson = this.toJson(snapshot);
        if (nextJson && nextJson === this.lastPushedJson) return;
        this.lastPushedJson = nextJson;

        this.applyingFromStore = true;
        try {
            this.options.applySnapshot(this.component, this.cloneSerializable(snapshot));
        } finally {
            this.applyingFromStore = false;
        }
    }

    handleComponentEvent(_event) {
        if (!this.store || !this.path || this.applyingFromStore) return;
        const snapshot = this.options.getSnapshot(this.component);
        if (this.debounceMs > 0) {
            if (this.pushTimer) clearTimeout(this.pushTimer);
            this.pushTimer = setTimeout(() => {
                this.pushTimer = null;
                this.pushToStore(snapshot, false);
            }, this.debounceMs);
            return;
        }
        this.pushToStore(snapshot, false);
    }

    pushToStore(snapshot, force) {
        if (!this.store || !this.path) return;
        const serializable = this.cloneSerializable(snapshot);
        const nextJson = this.toJson(serializable);
        if (!force && nextJson && nextJson === this.lastPushedJson) return;
        this.pushingToStore = true;
        try {
            StateHub.setByPath(this.store.proxy, this.path, serializable);
            this.lastPushedJson = nextJson;
        } finally {
            this.pushingToStore = false;
        }
    }

    disconnect() {
        if (this.pushTimer) {
            clearTimeout(this.pushTimer);
            this.pushTimer = null;
        }
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.component?.element?.removeEventListener(this.options.eventName, this.boundOnComponentEvent);
    }
}

function attachComponentStateBinding(component, options = {}) {
    const binding = new ComponentStateBinding(component, options);
    binding.connect();
    return binding;
}

export { ComponentStateBinding, attachComponentStateBinding };
