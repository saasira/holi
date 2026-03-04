class StateHub {
    static stores = new Map();
    static nextId = 1;

    constructor(initialState = {}, options = {}) {
        this.state = { ...initialState };
        this.listeners = new Set();
        this.id = options.id || `hub_${StateHub.nextId++}`;
        this.proxy = this.createProxy(this.state, []);
        StateHub.stores.set(this.id, this);
    }

    static create(initialState = {}, options = {}) {
        return new StateHub(initialState, options);
    }

    static get(storeId) {
        return this.stores.get(storeId) || null;
    }

    static destroy(storeId) {
        const store = this.get(storeId);
        if (!store) return false;
        store.listeners.clear();
        this.stores.delete(storeId);
        return true;
    }

    static parsePath(pathExpr = '') {
        if (!pathExpr || typeof pathExpr !== 'string') return [];
        return pathExpr
            .replace(/\[(\w+)\]/g, '.$1')
            .split('.')
            .map((p) => p.trim())
            .filter(Boolean);
    }

    static getByPath(source, path) {
        const parts = Array.isArray(path) ? path : this.parsePath(path);
        return parts.reduce((acc, key) => (acc == null ? undefined : acc[key]), source);
    }

    static setByPath(target, path, value) {
        const parts = Array.isArray(path) ? path : this.parsePath(path);
        if (!parts.length) return false;

        let cursor = target;
        for (let i = 0; i < parts.length - 1; i += 1) {
            const key = parts[i];
            if (cursor[key] == null || typeof cursor[key] !== 'object') {
                cursor[key] = {};
            }
            cursor = cursor[key];
        }

        const last = parts[parts.length - 1];
        cursor[last] = value;
        return true;
    }

    createProxy(target, path = []) {
        if (target == null || typeof target !== 'object') return target;

        const hub = this;
        return new Proxy(target, {
            get(obj, key) {
                const value = obj[key];
                if (value != null && typeof value === 'object') {
                    return hub.createProxy(value, path.concat(String(key)));
                }
                return value;
            },
            set(obj, key, value) {
                const oldValue = obj[key];
                obj[key] = value;
                const changedPath = path.concat(String(key)).join('.');
                hub.notify(changedPath, value, oldValue);
                return true;
            },
            deleteProperty(obj, key) {
                if (!(key in obj)) return true;
                const oldValue = obj[key];
                delete obj[key];
                const changedPath = path.concat(String(key)).join('.');
                hub.notify(changedPath, undefined, oldValue);
                return true;
            }
        });
    }

    subscribe(callback, selector = null) {
        const listener = { callback, selector };
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify(path, value, oldValue) {
        this.listeners.forEach(({ callback, selector }) => {
            if (selector && !selector(this.proxy, { path, value, oldValue })) return;
            callback(this.proxy, { path, value, oldValue });
        });
    }

    batch(updates = {}) {
        Object.entries(updates).forEach(([key, value]) => {
            StateHub.setByPath(this.proxy, key, value);
        });
    }

    getSnapshot() {
        return JSON.parse(JSON.stringify(this.state));
    }
}

class StateConnector {
    static bindings = new WeakMap();

    static isInput(el) {
        return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
    }

    static readBoundValue(store, path) {
        if (!path) return store.proxy;
        return StateHub.getByPath(store.proxy, path);
    }

    static writeBoundValue(store, path, value) {
        if (!path) return;
        StateHub.setByPath(store.proxy, path, value);
    }

    static renderElement(el, value) {
        if (this.isInput(el)) {
            const next = value == null ? '' : String(value);
            if (el.value !== next) el.value = next;
            return;
        }
        el.textContent = value == null ? '' : String(value);
    }

    static disconnectElement(el) {
        const binding = this.bindings.get(el);
        if (!binding) return;
        el.removeEventListener('input', binding.onInput);
        binding.unsubscribe?.();
        this.bindings.delete(el);
    }

    static connectElement(el) {
        this.disconnectElement(el);

        const storeId = el.dataset.state;
        const path = el.dataset.statePath || '';
        const store = StateHub.get(storeId);
        if (!store) return;

        const render = () => this.renderElement(el, this.readBoundValue(store, path));
        const onInput = () => this.writeBoundValue(store, path, el.value);
        const unsubscribe = store.subscribe((_state, change) => {
            if (!path || change.path === path || change.path.startsWith(`${path}.`) || path.startsWith(`${change.path}.`)) {
                render();
            }
        });

        if (this.isInput(el)) {
            el.addEventListener('input', onInput);
        }

        this.bindings.set(el, { onInput, unsubscribe });
        render();
    }

    static connect(container = document) {
        container.querySelectorAll('[data-state]').forEach((el) => this.connectElement(el));
    }

    static disconnect(container = document) {
        container.querySelectorAll('[data-state]').forEach((el) => this.disconnectElement(el));
    }
}

if (typeof window !== 'undefined') {
    window.StateHub = StateHub;
    window.StateConnector = StateConnector;
}

export { StateHub, StateConnector };
