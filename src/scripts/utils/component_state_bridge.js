import { StateHub } from './state.js';

class ComponentStateBridge {
    constructor(component) {
        this.component = component;
        this.container = component?.container || null;
        this.stateKey = this.resolveStateKey();
        this.stateStoreId = this.resolveStateStoreId();
        this.stateMap = {};
        this.stateHydratedFromAttr = false;
        this.stateInternal = {};
        this.isPublishingState = false;
        this.isApplyingExternalState = false;
        this.isApplyingMappedState = false;
        this.stateUnsubscribe = null;
        this.stateMapUnsubscribers = [];
        this.stateProxyCache = new WeakMap();
    }

    resolveStateKey() {
        const explicitKey = this.container?.getAttribute?.('data-state-key');
        if (explicitKey) return String(explicitKey).trim();

        const fromComponentAttr = this.container?.getAttribute?.('component');
        const componentName = fromComponentAttr
            || this.container?.getAttribute?.('role')
            || (() => {
                const tag = String(this.container?.tagName || '').toLowerCase();
                if (tag.startsWith('holi-')) return tag.slice('holi-'.length);
                return tag || (this.component?.constructor?.name || 'component').replace(/component$/i, '').toLowerCase();
            })();

        const instanceId = this.container?.getAttribute?.('data-component-id')
            || this.container?.id
            || 'component';
        return `${String(componentName || 'component').trim().toLowerCase()}.${String(instanceId).trim()}`;
    }

    resolveStateStoreId() {
        const explicit = this.container?.getAttribute?.('data-state-store');
        return explicit ? String(explicit).trim() : StateHub.defaultStoreId;
    }

    install() {
        if (!this.container) return;
        this.stateMap = this.resolveStateMap();

        Object.defineProperty(this.component, 'state', {
            get: () => this.stateInternal,
            set: (nextValue) => {
                const source = nextValue && typeof nextValue === 'object' ? nextValue : {};
                this.stateInternal = this.createStateProxy(source);
                this.hydrateStateFromAttribute();
                this.publishStateSnapshot();
            },
            configurable: true,
            enumerable: true
        });

        this.component.state = {};

        this.stateUnsubscribe = StateHub.subscribe(this.stateKey, (nextValue) => {
            if (this.isPublishingState || this.isApplyingExternalState) return;
            if (!nextValue || typeof nextValue !== 'object') return;
            this.isApplyingExternalState = true;
            try {
                Object.keys(nextValue).forEach((key) => {
                    this.stateInternal[key] = nextValue[key];
                });
            } finally {
                this.isApplyingExternalState = false;
            }
        }, this.stateStoreId);

        this.bindMappedStateSubscriptions();
    }

    uninstall() {
        this.stateUnsubscribe?.();
        this.stateUnsubscribe = null;
        this.stateMapUnsubscribers.forEach((unsubscribe) => unsubscribe?.());
        this.stateMapUnsubscribers = [];
    }

    resolveStateMap() {
        const raw = this.container?.getAttribute?.('data-state-map');
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return {};
            const map = {};
            Object.keys(parsed).forEach((localPath) => {
                const local = String(localPath || '').trim();
                const target = String(parsed[localPath] || '').trim();
                if (!local || !target) return;
                map[local] = target;
            });
            return map;
        } catch (_error) {
            return {};
        }
    }

    bindMappedStateSubscriptions() {
        this.stateMapUnsubscribers.forEach((unsubscribe) => unsubscribe?.());
        this.stateMapUnsubscribers = [];

        Object.entries(this.stateMap).forEach(([localPath, targetPath]) => {
            const unsubscribe = StateHub.subscribe(targetPath, (value, meta = {}) => {
                if (this.isPublishingState || this.isApplyingExternalState || this.isApplyingMappedState) return;
                if (typeof value === 'undefined' && meta?.initial) return;
                this.isApplyingMappedState = true;
                try {
                    this.setStatePath(localPath, value);
                } finally {
                    this.isApplyingMappedState = false;
                }
            }, this.stateStoreId);
            this.stateMapUnsubscribers.push(unsubscribe);
        });
    }

    hydrateStateFromAttribute() {
        if (this.stateHydratedFromAttr) return;
        this.stateHydratedFromAttr = true;
        const raw = this.container?.getAttribute?.('state');
        if (!raw) return;

        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;
            const resolved = this.resolveStateExpressions(parsed);
            Object.keys(resolved).forEach((key) => {
                this.stateInternal[key] = resolved[key];
            });
        } catch (_error) {}
    }

    resolveStateExpressions(value) {
        if (Array.isArray(value)) {
            return value.map((item) => this.resolveStateExpressions(item));
        }
        if (value && typeof value === 'object') {
            const out = {};
            Object.keys(value).forEach((key) => {
                out[key] = this.resolveStateExpressions(value[key]);
            });
            return out;
        }
        if (typeof value !== 'string') return value;

        const raw = value.trim();
        const exprOnly = raw.match(/^@\{(.+)\}$/);
        if (!exprOnly) return value;

        const expr = exprOnly[1].trim();
        const context = {
            ...(typeof window !== 'undefined' ? (window.appState || {}) : {}),
            ...(typeof window !== 'undefined' ? (window.pageContext || {}) : {}),
            ...this.stateInternal
        };

        try {
            if (typeof this.component?.evaluateExpression === 'function') {
                return this.component.evaluateExpression(expr, context);
            }
        } catch (_error) {}
        return value;
    }

    createStateProxy(target, path = []) {
        if (target == null || typeof target !== 'object') return target;
        if (this.stateProxyCache.has(target)) {
            return this.stateProxyCache.get(target);
        }

        const proxy = new Proxy(target, {
            get: (obj, key) => {
                const value = obj[key];
                if (value != null && typeof value === 'object') {
                    return this.createStateProxy(value, path.concat(String(key)));
                }
                return value;
            },
            set: (obj, key, value) => {
                obj[key] = value;
                const changedPath = path.concat(String(key)).join('.');
                this.reflectStateValue(changedPath, value);
                if (!this.isApplyingExternalState && !this.isApplyingMappedState) {
                    this.publishStateChange(changedPath, value);
                }
                return true;
            },
            deleteProperty: (obj, key) => {
                if (!(key in obj)) return true;
                delete obj[key];
                const changedPath = path.concat(String(key)).join('.');
                if (!this.isApplyingExternalState && !this.isApplyingMappedState) {
                    this.publishStateChange(changedPath, undefined);
                }
                return true;
            }
        });
        this.stateProxyCache.set(target, proxy);
        return proxy;
    }

    setStatePath(pathExpr, value) {
        const path = String(pathExpr || '').replace(/\[(\w+)\]/g, '.$1').split('.').filter(Boolean);
        if (!path.length) return;
        let cursor = this.stateInternal;
        for (let i = 0; i < path.length - 1; i += 1) {
            const key = path[i];
            if (cursor[key] == null || typeof cursor[key] !== 'object') {
                cursor[key] = {};
            }
            cursor = cursor[key];
        }
        cursor[path[path.length - 1]] = value;
    }

    getStatePath(pathExpr) {
        const path = String(pathExpr || '').replace(/\[(\w+)\]/g, '.$1').split('.').filter(Boolean);
        return path.reduce((acc, key) => (acc == null ? undefined : acc[key]), this.stateInternal);
    }

    resolveMappedPath(localPath) {
        const cleanPath = String(localPath || '').trim();
        if (!cleanPath) return '';
        const entries = Object.entries(this.stateMap);
        for (let i = 0; i < entries.length; i += 1) {
            const [localBase, targetBase] = entries[i];
            if (cleanPath === localBase) return targetBase;
            if (cleanPath.startsWith(`${localBase}.`)) {
                const suffix = cleanPath.slice(localBase.length);
                return `${targetBase}${suffix}`;
            }
        }
        return '';
    }

    cloneSerializable(value) {
        return this.snapshotValue(value);
    }

    snapshotValue(value, seen = new WeakSet()) {
        if (value == null || typeof value !== 'object') return value;
        if (seen.has(value)) return null;
        seen.add(value);

        if (Array.isArray(value)) {
            return value.map((item) => this.snapshotValue(item, seen));
        }

        const output = {};
        Object.keys(value).forEach((key) => {
            output[key] = this.snapshotValue(value[key], seen);
        });
        return output;
    }

    toKebabCase(value) {
        return String(value || '')
            .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
            .replace(/[_\s]+/g, '-')
            .toLowerCase();
    }

    reflectStateValue(path, value) {
        const cleanPath = String(path || '').trim();
        if (!cleanPath || cleanPath.includes('.')) return;

        const attrName = this.toKebabCase(cleanPath);
        if (value == null) {
            this.container?.removeAttribute?.(attrName);
        } else if (typeof value !== 'object') {
            this.container?.setAttribute?.(attrName, String(value));
        }

        if (cleanPath in this.component && typeof this.component[cleanPath] !== 'function') {
            this.component[cleanPath] = value;
        }

        if (typeof this.component?.onStateReflect === 'function') {
            this.component.onStateReflect(cleanPath, value);
        }
    }

    publishStateSnapshot() {
        const snapshot = this.cloneSerializable(this.stateInternal || {});
        if (this.shouldDispatchPpr('', snapshot, true)) {
            this.dispatchPprChange('', snapshot, true);
        }
        this.isPublishingState = true;
        try {
            StateHub.publish(this.stateKey, snapshot, this.stateStoreId);
            Object.entries(this.stateMap).forEach(([localPath, targetPath]) => {
                const mappedValue = this.cloneSerializable(this.getStatePath(localPath));
                if (typeof mappedValue === 'undefined') return;
                StateHub.publish(targetPath, mappedValue, this.stateStoreId);
            });
        } finally {
            this.isPublishingState = false;
        }
    }

    publishStateChange(path, value) {
        const cleanPath = String(path || '').trim();
        if (!cleanPath) {
            this.publishStateSnapshot();
            return;
        }
        if (this.shouldDispatchPpr(cleanPath, value, false)) {
            this.dispatchPprChange(cleanPath, value, false);
        }
        this.isPublishingState = true;
        try {
            StateHub.publish(`${this.stateKey}.${cleanPath}`, this.cloneSerializable(value), this.stateStoreId);
            const mappedPath = this.resolveMappedPath(cleanPath);
            if (mappedPath) {
                StateHub.publish(mappedPath, this.cloneSerializable(value), this.stateStoreId);
            }
        } finally {
            this.isPublishingState = false;
        }
    }

    dispatchPprChange(path, value, initial) {
        if (!(this.container instanceof Element)) return;
        this.container.dispatchEvent(new CustomEvent('holi:ppr-change', {
            detail: {
                component: this.component,
                path,
                value: this.cloneSerializable(value),
                initial: !!initial
            },
            bubbles: true
        }));
    }

    shouldDispatchPpr(path, value, initial) {
        if (this.component?.isApplyingDependencyUpdate) {
            return false;
        }
        if (typeof this.component?.shouldDispatchPprChange === 'function') {
            return this.component.shouldDispatchPprChange(path, value, initial) !== false;
        }
        return true;
    }
}

export { ComponentStateBridge };
