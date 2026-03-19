import { ComponentRegistry } from './component_registry.js';

// Central declarative dependency bus.
// Sources publish "component changed" notifications; subscribers decide whether
// to recompute locally, refetch remotely, partially redraw, or ignore.
class ComponentPPR {
    static nextAutoId = 1;

    static sourceAttrNames = ['data-ppr-listen', 'data-ppr-source'];
    static targetAttrNames = ['data-ppr-render', 'data-ppr-update', 'render', 'update'];
    static componentSelectors = [
        '[data-holi-component-class]',
        '[component]',
        '[role]',
        'dropdown',
        'region',
        'tabs',
        'holi-form',
        'holi-input',
        'holi-select'
    ].join(', ');

    constructor(component) {
        this.component = component;
        this.container = component?.container || null;
        this.boundDocumentChange = (event) => this.handleDocumentChange(event);
        this.boundOwnChange = (event) => this.handleOwnChange(event);
        this.initialSyncTimer = null;
    }

    install() {
        if (!(this.container instanceof Element)) return;

        this.ensureComponentId();

        if (this.hasInboundSubscriptions()) {
            document.addEventListener('holi:ppr-change', this.boundDocumentChange);
            this.scheduleInitialSync();
        }

        if (this.hasOutboundTargets()) {
            this.container.addEventListener('holi:ppr-change', this.boundOwnChange);
        }
    }

    uninstall() {
        if (this.initialSyncTimer) {
            clearTimeout(this.initialSyncTimer);
            this.initialSyncTimer = null;
        }
        document.removeEventListener('holi:ppr-change', this.boundDocumentChange);
        this.container?.removeEventListener('holi:ppr-change', this.boundOwnChange);
    }

    ensureComponentId() {
        if (!this.container || this.container.getAttribute('data-component-id')) return;
        this.container.setAttribute('data-component-id', `holi-${ComponentPPR.nextAutoId++}`);
    }

    scheduleInitialSync() {
        if (this.initialSyncTimer) clearTimeout(this.initialSyncTimer);
        this.initialSyncTimer = setTimeout(() => {
            this.initialSyncTimer = null;
            this.performInitialSync();
        }, 0);
    }

    performInitialSync() {
        if (!(this.container instanceof Element)) return;
        const sourceExpr = this.readFirstAttr(ComponentPPR.sourceAttrNames);
        const sources = this.resolveElements(sourceExpr);
        sources.forEach((sourceEl) => {
            if (!(sourceEl instanceof Element) || sourceEl === this.container) return;
            const instances = ComponentRegistry.getElementInstances(sourceEl);
            const sourceComponent = instances[0] || null;
            const snapshot = typeof sourceComponent?.getStateSnapshot === 'function'
                ? sourceComponent.getStateSnapshot()
                : {};
            this.applyInboundUpdate({
                sourceElement: sourceEl,
                sourceComponent,
                path: '',
                value: snapshot,
                snapshot,
                initial: true
            });
        });
    }

    hasInboundSubscriptions() {
        return !!this.readFirstAttr(ComponentPPR.sourceAttrNames);
    }

    hasOutboundTargets() {
        return !!this.readFirstAttr(ComponentPPR.targetAttrNames);
    }

    readFirstAttr(names) {
        for (let i = 0; i < names.length; i += 1) {
            const value = this.container?.getAttribute?.(names[i]);
            if (value && String(value).trim()) {
                return String(value).trim();
            }
        }
        return '';
    }

    handleDocumentChange(event) {
        const sourceEl = event.target;
        if (!(sourceEl instanceof Element) || sourceEl === this.container) return;
        if (!this.matchesInboundSource(sourceEl)) return;

        const detail = event.detail || {};
        const instances = ComponentRegistry.getElementInstances(sourceEl);
        const sourceComponent = detail.component || instances[0] || null;
        const snapshot = typeof sourceComponent?.getStateSnapshot === 'function'
            ? sourceComponent.getStateSnapshot()
            : {};
        this.applyInboundUpdate({
            sourceElement: sourceEl,
            sourceComponent,
            path: detail.path || '',
            value: detail.value,
            snapshot,
            initial: false
        });
    }

    handleOwnChange(event) {
        if (event.target !== this.container) return;
        const detail = event.detail || {};
        this.applyTargets(this.readFirstAttr(ComponentPPR.targetAttrNames), {
            sourceElement: this.container,
            sourceComponent: this.component,
            path: detail.path || '',
            value: detail.value,
            snapshot: typeof this.component?.getStateSnapshot === 'function'
                ? this.component.getStateSnapshot()
                : {},
            initial: !!detail.initial
        });
    }

    matchesInboundSource(sourceEl) {
        const sourceExpr = this.readFirstAttr(ComponentPPR.sourceAttrNames);
        const resolved = this.resolveElements(sourceExpr);
        return resolved.includes(sourceEl);
    }

    applyInboundUpdate(detail) {
        this.component?.recordDependencySnapshot?.(detail);
        const targetExpr = this.readFirstAttr(ComponentPPR.targetAttrNames) || '@this';
        this.applyTargets(targetExpr, detail);
    }

    getElementAliases(element) {
        if (!(element instanceof Element)) return [];
        const aliases = [];
        const id = String(element.id || '').trim();
        const explicit = String(element.getAttribute('data-ppr-id') || '').trim();
        const autoId = String(element.getAttribute('data-component-id') || '').trim();
        const componentName = String(
            element.getAttribute('component')
            || element.getAttribute('role')
            || element.getAttribute('data-holi-component-class')
            || element.tagName
        ).trim().toLowerCase();

        [id, explicit, autoId, componentName].forEach((value) => {
            if (value && !aliases.includes(value)) aliases.push(value);
        });

        return aliases;
    }

    applyTargets(expression, detail) {
        const targets = this.resolveElements(expression);
        const visited = new Set();

        targets.forEach((targetEl) => {
            if (!(targetEl instanceof Element) || visited.has(targetEl)) return;
            visited.add(targetEl);
            this.updateTarget(targetEl, detail);
        });
    }

    updateTarget(targetEl, detail) {
        const instances = ComponentRegistry.getElementInstances(targetEl);
        const primary = instances[0] || null;
        const payload = {
            ...detail,
            targetElement: targetEl,
            targetComponent: primary,
            subscriberComponent: this.component
        };

        targetEl.dispatchEvent(new CustomEvent('holi:ppr-update', {
            detail: payload,
            bubbles: true
        }));

        if (!primary || primary.isDestroyed) return;
        if (typeof primary.receiveDependencyUpdate === 'function') {
            primary.receiveDependencyUpdate(payload);
            return;
        }
        if (typeof primary.handlePprUpdate === 'function') {
            primary.handlePprUpdate(payload);
        }
    }

    resolveElements(expression) {
        const tokens = this.tokenize(expression);
        const resolved = [];
        const seen = new Set();

        tokens.forEach((token) => {
            const matches = this.resolveToken(token);
            matches.forEach((match) => {
                if (!(match instanceof Element) || seen.has(match)) return;
                seen.add(match);
                resolved.push(match);
            });
        });

        return resolved;
    }

    tokenize(expression) {
        return String(expression || '')
            .split(/[\s,]+/)
            .map((token) => token.trim())
            .filter(Boolean);
    }

    resolveToken(token) {
        if (!token || token === '@none') return [];
        if (!(this.container instanceof Element)) return [];

        if (token === '@this') return [this.container];
        if (token === '@parent') {
            const parent = this.findClosestComponentHost(this.container.parentElement);
            return parent ? [parent] : [];
        }
        if (token === '@form') {
            const formHost = this.container.closest('form, holi-form, [component="form-shell"], [role="form-shell"]');
            return formHost ? [formHost] : [];
        }
        if (token === '@all') {
            return ComponentRegistry.collectInstances(document)
                .map((instance) => instance?.container)
                .filter((el) => el instanceof Element);
        }
        if (token === '@root') {
            return [document.documentElement];
        }
        if (token.startsWith('#')) {
            const bySelector = document.querySelector(token);
            return bySelector ? [bySelector] : [];
        }

        const byId = document.getElementById(token);
        if (byId) return [byId];

        const byDataId = document.querySelector(`[data-component-id="${token}"], [data-ppr-id="${token}"]`);
        if (byDataId) return [byDataId];

        const scoped = this.container.closest('[data-component-id], form, body') || document;
        if (scoped.querySelectorAll) {
            const matches = Array.from(scoped.querySelectorAll(`[id="${token}"], [data-component-id="${token}"], [data-ppr-id="${token}"]`));
            if (matches.length) return matches;
        }

        return [];
    }

    findClosestComponentHost(start) {
        let cursor = start;
        while (cursor instanceof Element) {
            if (this.isComponentHost(cursor)) return cursor;
            cursor = cursor.parentElement;
        }
        return null;
    }

    isComponentHost(element) {
        if (!(element instanceof Element)) return false;
        if (ComponentRegistry.getElementInstances(element).length > 0) return true;
        return element.matches(ComponentPPR.componentSelectors);
    }
}

export { ComponentPPR };
