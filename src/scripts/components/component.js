
import { ComponentRegistry } from '../utils/component_registry.js';
import { Validator } from '../utils/validator.js';
import { ComponentStateBridge } from '../utils/component_state_bridge.js';
import { ComponentPPR } from '../utils/ppr.js';
import { TemplateRegistry } from '../utils/template_registry.js';

class Component {
    static nextComponentId = 1;
    static pprHookNames = ['refreshPpr', 'refresh', 'updateView'];

    // NEW: Auto-detection selector
    static get selector() {
        return null; // Override in subclasses
    }
    
    // NEW: Library isolation
    static get library() {
        return 'default'; // Override in subclasses
    }
    
    static matchesLibrary(element, libraryName) {
        const elLibrary = element.getAttribute('library');
        return !elLibrary || elLibrary === libraryName;
    }
    
    constructor(container, options = {}) {
        this.element = null;
        this.container = container;
        this.children = new Map();
        this.isDestroyed = false;
        this.ppr = {};
        this.pprMeta = {};
        Object.assign(this, options);
        if (this.container instanceof Element && !this.container.getAttribute('data-component-id')) {
            this.container.setAttribute('data-component-id', `holi-${Component.nextComponentId++}`);
        }
        // auto-expose instance on element; 
        // with this, all components now accessible as: el.modal, el.toast, el.loader, etc.
        this.instanceKey = this.constructor.name.toLowerCase();
        this.instanceClassAttr = 'data-holi-component-class';
        this.container?.setAttribute?.(this.instanceClassAttr, this.constructor.name);
        const existing = this.container?.[this.instanceKey];
        if (existing && existing !== this) {
            try {
                delete this.container[this.instanceKey];
            } catch (_error) {}
        }
        Object.defineProperty(this.container, this.instanceKey, {
            value: this,
            writable: false,
            configurable: true
        });

        this.stateBridge = new ComponentStateBridge(this);
        this.stateBridge.install();

        this.pprBridge = new ComponentPPR(this);
        this.pprBridge.install();

        ComponentRegistry.registerInstance(this.container, this);
    }
    
    init() {
        if (this.initializing) return;  // Prevent re-entry
        this.initializing = true;

        // Max 100ms per component (safety)
        const start = performance.now();
        super.init?.();

        this.validateStructure();

        if (performance.now() - start > 100) {
            console.warn('Component init slow:', this.constructor.name);
        }

        this.initializing = false;
    }

    static registerValidator(name, fn) {
        Validator.register(name, fn);
    }

    static unregisterValidator(name) {
        return Validator.unregister(name);
    }

    static parseValidators(raw) {
        return Validator.parseList(raw);
    }

    parseValidators(raw) {
        return Validator.parseList(raw);
    }

    runValidator(token, value, context = {}) {
        return Validator.validateToken(token, value, {
            component: this,
            ...context
        });
    }

    toCamelCase(value) {
        return String(value || '')
            .replace(/[-_\s]+(.)?/g, (_m, ch) => (ch ? ch.toUpperCase() : ''))
            .replace(/^(.)/, (m) => m.toLowerCase());
    }

    onStateReflect(path, value) {
        const key = String(path || '').trim();
        if (!key || key.includes('.')) return;
        if (this.isReflectingState) return;

        this.isReflectingState = true;
        try {
            const camelKey = this.toCamelCase(key);
            const textAlias = `${camelKey}Text`;

            if (camelKey in this && typeof this[camelKey] !== 'function') {
                this[camelKey] = value;
            }

            if (textAlias in this && typeof this[textAlias] !== 'function') {
                this[textAlias] = value == null ? '' : String(value);
            }

            if (this.config && typeof this.config === 'object') {
                if (Object.prototype.hasOwnProperty.call(this.config, key)) {
                    this.config[key] = value;
                } else if (Object.prototype.hasOwnProperty.call(this.config, camelKey)) {
                    this.config[camelKey] = value;
                }
            }

            if (typeof this.applyStateUpdate === 'function') {
                this.applyStateUpdate(camelKey, value);
                return;
            }

            if (typeof this.applyLayoutState === 'function') {
                this.applyLayoutState();
            }

            if (typeof this.applyDialogContent === 'function') {
                this.applyDialogContent();
            }

            if (typeof this.updateView === 'function') {
                this.updateView();
            }
        } finally {
            this.isReflectingState = false;
        }
    }

    // Pure component lifecycle
    async render() {
        const template = TemplateRegistry.getTemplate(this.templateId);
        if (!template || !template.content) {
            throw new Error(`Template "${this.templateId}" not found`);
        }
        this.fragment = template.content.cloneNode(true);
        this.populateSlots(this.fragment);
        this.bindAttributes(this.fragment);
        this.container.appendChild(this.fragment);
        await this.createChildren();
        this.syncChildren();
    }
	
    populateSlots(fragment) {
        // Fill named slots with user content
        const slots = fragment.querySelectorAll('[slot]');
        slots.forEach(slot => {
            const userContent = this.container.querySelector(`[slot="${slot.name}"]`);
            if (userContent) slot.appendChild(userContent);
        });
    }
	
    bindAttributes(fragment) {
        const context = this.getBindingContext();
        this.applyBindings(fragment, context);
    }
	
    refresh() {
        this.refreshChildren();
    }

    // Declarative dependency-update contract:
    // the framework routes source notifications here, and the subscriber picks
    // its own update strategy through refreshPpr/refresh/updateView.
    handlePprUpdate(payload = {}) {
        const handler = this.resolvePprHandler();
        if (!handler) {
            this.reportMissingPprContract(payload);
            return false;
        }
        handler(payload);
        return true;
    }

    receiveDependencyUpdate(payload = {}) {
        this.recordDependencySnapshot(payload);
        this.isApplyingDependencyUpdate = true;
        try {
            return this.handlePprUpdate(payload);
        } finally {
            this.isApplyingDependencyUpdate = false;
        }
    }

    recordDependencySnapshot(payload = {}) {
        const sourceElement = payload?.sourceElement;
        const snapshot = payload?.snapshot;
        if (!(sourceElement instanceof Element)) return;
        if (!this.ppr || typeof this.ppr !== 'object') this.ppr = {};

        const aliases = this.resolveDependencyAliases(sourceElement);
        aliases.forEach((alias) => {
            this.ppr[alias] = snapshot;
        });
        this.pprMeta = {
            source: aliases[0] || '',
            path: payload?.path || '',
            initial: !!payload?.initial
        };
    }

    resolveDependencyAliases(element) {
        if (!(element instanceof Element)) return [];
        const aliases = [];
        const values = [
            element.id,
            element.getAttribute('data-ppr-id'),
            element.getAttribute('data-component-id'),
            element.getAttribute('component'),
            element.getAttribute('role'),
            element.getAttribute('data-holi-component-class'),
            String(element.tagName || '').toLowerCase()
        ];
        values.forEach((value) => {
            const raw = String(value || '').trim();
            const lower = raw.toLowerCase();
            [raw, lower].forEach((next) => {
                if (next && !aliases.includes(next)) aliases.push(next);
            });
        });
        return aliases;
    }

    resolvePprHandler() {
        const hookNames = Array.isArray(this.constructor?.pprHookNames)
            ? this.constructor.pprHookNames
            : Component.pprHookNames;

        for (let i = 0; i < hookNames.length; i += 1) {
            const hookName = hookNames[i];
            const candidate = this[hookName];
            if (typeof candidate === 'function') {
                return candidate.bind(this);
            }
        }
        return null;
    }

    getPprMissingHookPolicy() {
        const attrValue = this.container?.getAttribute?.('data-ppr-missing-hook-policy');
        const globalValue = typeof window !== 'undefined' ? window.HoliPprMissingHookPolicy : '';
        const value = String(attrValue || globalValue || 'warn').trim().toLowerCase();
        if (value === 'throw' || value === 'ignore') return value;
        return 'warn';
    }

    reportMissingPprContract(payload = {}) {
        const policy = this.getPprMissingHookPolicy();
        if (policy === 'ignore') return;

        const hostLabel = this.container?.id
            || this.container?.getAttribute?.('data-component-id')
            || this.constructor?.name
            || 'component';
        const sourceLabel = payload?.sourceElement?.id
            || payload?.sourceElement?.getAttribute?.('data-component-id')
            || payload?.sourceComponent?.constructor?.name
            || 'unknown-source';
        const message = `PPR target "${hostLabel}" cannot handle updates from "${sourceLabel}". Implement one of: ${Component.pprHookNames.join(', ')}`;

        if (policy === 'throw') {
            throw new Error(message);
        }

        console.warn(message, {
            component: this,
            payload
        });
    }

    async createChildren() {
        const scope = this.element || this.container;
        if (!(scope instanceof Element)) return;
        ComponentRegistry.initAll(scope, { includeRoleSelectors: false });
    }

    syncChildren() {
        const scope = this.element || this.container;
        if (!(scope instanceof Element)) return;
        const discovered = ComponentRegistry.collectInstances(scope, true)
            .filter((instance) => instance && instance !== this && !instance.isDestroyed);

        this.children.clear();
        discovered.forEach((child, index) => {
            const host = child.container;
            const hostKey = host?.id || host?.getAttribute?.('data-component-id') || `child-${index}`;
            const key = `${child.constructor?.name || 'Component'}:${hostKey}:${index}`;
            this.children.set(key, child);
        });
    }

    refreshChildren() {
        this.syncChildren();
        this.children.forEach((child) => {
            if (typeof child.refresh === 'function') child.refresh();
        });
    }
	
    destroy() {
        this.pprBridge?.uninstall?.();
        this.stateBridge?.uninstall?.();
        this.children.forEach(child => child.destroy());
        this.children.clear();
        this.element?.remove();
        this.isDestroyed = true;
        this.dispatchEvent('destroy', { component: this });
        ComponentRegistry.unregisterInstance(this.container, this);
        if (this.container?.getAttribute?.(this.instanceClassAttr) === this.constructor.name) {
            this.container.removeAttribute(this.instanceClassAttr);
        }
        if (this.container && this.instanceKey && this.container[this.instanceKey] === this) {
            try {
                delete this.container[this.instanceKey];
            } catch (_error) {}
        }
    }
    
    // Child management (universal)
     // NEW: Library-aware child registration
    registerChild(name, child) {
        this.children.set(name, child);
        child.on('destroy', () => this.children.delete(name));
    }
    
    // Pure event system
    on(event, handler) {
        this.element?.addEventListener(event, handler);
    }
    
    dispatchEvent(eventName, detail = {}) {
        this.element?.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
    
    validateStructure() {
        if (!this.templateId) {
            throw new Error(`${this.constructor.name} must define templateId`);
        }
    }

    getBindingContext(extra = {}) {
        return {
            ...(window.appState || {}),
            ...(window.pageContext || {}),
            ...this,
            ...(this.state || {}),
            data: this.data,
            ppr: this.ppr || {},
            pprMeta: this.pprMeta || {},
            ...extra
        };
    }

    getStateSnapshot() {
        if (this.stateBridge && typeof this.stateBridge.cloneSerializable === 'function') {
            return this.stateBridge.cloneSerializable(this.state || {});
        }
        try {
            return JSON.parse(JSON.stringify(this.state || {}));
        } catch (_error) {
            return this.state || {};
        }
    }

    applyBindings(root, context = {}) {
        this.processRepeats(root, context);
        this.processConditionals(root, context);
        this.processTextInterpolation(root, context);
        this.processAttributeInterpolation(root, context);
    }

    processRepeats(root, context) {
        const repeatNodes = Array.from(root.querySelectorAll('[data-repeat]'));
        repeatNodes.forEach((node) => {
            if (!node.parentNode) return;

            const expr = this.extractExpression(node.getAttribute('data-repeat'));
            const repeatSource = this.evaluateExpression(expr, context);
            const items = Array.isArray(repeatSource) ? repeatSource : [];
            const itemKey = node.getAttribute('data-for') || 'item';

            items.forEach((item, index) => {
                const clone = node.cloneNode(true);
                clone.removeAttribute('data-repeat');
                clone.removeAttribute('data-for');
                const repeatContext = this.getBindingContext({
                    ...context,
                    [itemKey]: item,
                    item,
                    index
                });
                this.applyBindings(clone, repeatContext);
                node.parentNode.insertBefore(clone, node);
            });

            node.remove();
        });
    }

    processConditionals(root, context) {
        const conditionalNodes = Array.from(root.querySelectorAll('[data-if], [data-show], [data-open], [visible]'));
        conditionalNodes.forEach((node) => {
            if (node.hasAttribute('data-if')) {
                const expr = this.extractExpression(node.getAttribute('data-if'));
                const visible = !!this.evaluateExpression(expr, context);
                if (!visible) {
                    node.remove();
                    return;
                }
            }

            if (node.hasAttribute('data-show')) {
                const expr = this.extractExpression(node.getAttribute('data-show'));
                const visible = !!this.evaluateExpression(expr, context);
                node.hidden = !visible;
            }

            if (node.hasAttribute('visible')) {
                const expr = this.extractExpression(node.getAttribute('visible'));
                const visible = !!this.evaluateExpression(expr, context);
                node.hidden = !visible;
            }

            if (node.hasAttribute('data-open')) {
                const expr = this.extractExpression(node.getAttribute('data-open'));
                const isOpen = !!this.evaluateExpression(expr, context);
                if (isOpen) {
                    node.setAttribute('open', '');
                } else {
                    node.removeAttribute('open');
                }
            }
        });
    }

    processTextInterpolation(root, context) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let current = walker.nextNode();
        while (current) {
            nodes.push(current);
            current = walker.nextNode();
        }

        nodes.forEach((textNode) => {
            const raw = textNode.textContent;
            if (!raw || raw.indexOf('@{') === -1) return;
            const resolved = this.resolveTemplateString(raw, context);
            textNode.textContent = resolved == null ? '' : String(resolved);
        });
    }

    processAttributeInterpolation(root, context) {
        const nodes = [];
        if (root.nodeType === Node.ELEMENT_NODE) nodes.push(root);
        nodes.push(...root.querySelectorAll('*'));

        nodes.forEach((node) => {
            Array.from(node.attributes).forEach((attr) => {
                if (!attr.value || attr.value.indexOf('@{') === -1) return;
                const nextValue = this.resolveAttributeValue(attr.value, context);
                this.setBoundAttribute(node, attr.name, nextValue);
            });
        });
    }

    setBoundAttribute(node, name, value) {
        const booleanAttrs = new Set(['checked', 'disabled', 'selected', 'readonly', 'required', 'open', 'hidden']);
        if (booleanAttrs.has(name)) {
            if (value) {
                node.setAttribute(name, '');
                if (name in node) node[name] = true;
            } else {
                node.removeAttribute(name);
                if (name in node) node[name] = false;
            }
            return;
        }

        if (name === 'data-slot') {
            if (value == null || value === '') {
                node.removeAttribute('slot');
            } else {
                node.setAttribute('slot', String(value));
            }
            return;
        }

        node.setAttribute(name, value == null ? '' : String(value));
    }

    resolveAttributeValue(rawValue, context) {
        const exprOnly = rawValue.match(/^\s*@\{([^}]+)\}\s*$/);
        if (exprOnly) {
            return this.evaluateExpression(exprOnly[1].trim(), context);
        }
        return this.resolveTemplateString(rawValue, context);
    }

    resolveTemplateString(template, context) {
        return template.replace(/@\{([^}]+)\}/g, (_match, expr) => {
            const value = this.evaluateExpression(expr.trim(), context);
            return value == null ? '' : String(value);
        });
    }

    extractExpression(value) {
        if (!value) return '';
        const match = String(value).trim().match(/^@\{([^}]+)\}$/);
        return match ? match[1].trim() : String(value).trim();
    }

    evaluateExpression(expression, context) {
        if (!expression) return undefined;
        const normalized = this.normalizeExpression(expression);

        try {
            const EngineClass = window.ELEngine || (typeof ELEngine !== 'undefined' ? ELEngine : null);
            if (EngineClass) {
                const engine = new EngineClass(context);
                return engine.evaluate(normalized);
            }
        } catch (_error) {}

        return this.getPathValue(context, normalized);
    }

    normalizeExpression(expression) {
        return String(expression)
            .replace(/\s*===\s*/g, ' eq ')
            .replace(/\s*!==\s*/g, ' ne ')
            .replace(/\s*>=\s*/g, ' gteq ')
            .replace(/\s*<=\s*/g, ' lteq ')
            .replace(/\s*>\s*/g, ' gt ')
            .replace(/\s*<\s*/g, ' lt ')
            .replace(/\s*&&\s*/g, ' and ')
            .replace(/\s*\|\|\s*/g, ' or ')
            .trim();
    }

    getPathValue(source, pathExpr) {
        if (!source || !pathExpr) return undefined;
        const path = String(pathExpr).replace(/\[(\w+)\]/g, '.$1');
        if (!/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*|\.\d+)*$/.test(path)) {
            return undefined;
        }
        return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), source);
    }
}

if (typeof window !== 'undefined') {
    window.Component = Component;
    Validator.enableAutoBind();
}

export { Component };
