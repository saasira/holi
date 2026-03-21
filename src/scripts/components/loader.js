import { Component } from './component.js';

class LoaderComponent extends Component {
    static get selector() {
        return 'loader';
    }

    static getNativeSelectors() {
        return ['[data-loader]'];
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'loader';
    }

    static templateId = 'loader-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = LoaderComponent.templateId;
        this.scope = this.resolveScope(this.readAttr('scope', 'inline'));
        this.message = this.readAttr('message', 'Loading...');
        this.visible = this.readBooleanAttr('visible', false);
        this.size = this.resolveSize(this.readAttr('size', 'md'));
        this.type = this.resolveType(this.readAttr('type', this.readAttr('shape', 'spinner')));
        this.hostSelector = this.readAttr('host', '');
        this.host = null;
        this.appliedRelativeHost = false;
        this.init();
    }

    readAttr(name, fallback = '') {
        const direct = this.container.getAttribute(name);
        if (direct != null) return String(direct);
        const dataValue = this.container.getAttribute(`data-${name}`);
        return dataValue != null ? String(dataValue) : fallback;
    }

    readBooleanAttr(name, fallback) {
        const raw = this.readAttr(name, '');
        if (!raw) return fallback;
        const value = raw.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(value)) return true;
        if (['false', '0', 'no', 'off'].includes(value)) return false;
        return fallback;
    }

    resolveScope(scope) {
        const value = String(scope || 'inline').trim().toLowerCase();
        if (value === 'page' || value === 'block' || value === 'inline') return value;
        return 'inline';
    }

    resolveSize(size) {
        const value = String(size || 'md').trim().toLowerCase();
        if (value === 'sm' || value === 'md' || value === 'lg') return value;
        return 'md';
    }

    resolveType(type) {
        const value = String(type || 'spinner').trim().toLowerCase();
        if (value === 'spinner' || value === 'circle') return 'spinner';
        if (value === 'dots' || value === 'dot') return 'dots';
        return 'spinner';
    }

    resolveHost() {
        if (this.scope === 'page' || typeof document === 'undefined') return null;
        if (this.hostSelector) {
            const found = document.querySelector(this.hostSelector);
            if (found) return found;
        }
        return this.container.parentElement || this.container;
    }

    ensureHostPositionContext() {
        if (!this.host || this.scope === 'page' || typeof window === 'undefined') return;
        const computed = window.getComputedStyle(this.host);
        if (computed.position === 'static') {
            this.host.style.position = 'relative';
            this.appliedRelativeHost = true;
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-loader');
        this.messageEl = this.container.querySelector('[data-role="loader-message"]');
        this.spinnerEl = this.container.querySelector('[data-role="loader-spinner"]');
        if (!this.element || !this.messageEl) {
            throw new Error('Loader template is missing required nodes');
        }

        this.element.setAttribute('data-scope', this.scope);
        this.element.setAttribute('data-size', this.size);
        this.element.setAttribute('data-type', this.type);
        if (this.spinnerEl) {
            this.spinnerEl.setAttribute('data-type', this.type);
        }

        if (this.scope === 'block') {
            this.host = this.resolveHost();
            if (this.host && this.element.parentElement !== this.host) {
                this.host.appendChild(this.element);
                this.ensureHostPositionContext();
            }
            this.container.hidden = true;
        } else {
            this.container.hidden = false;
        }

        this.setMessage(this.message);
        this.setVisible(this.visible);

        if (typeof this.container.loader === 'undefined') {
            Object.defineProperty(this.container, 'loader', {
                value: this,
                writable: false
            });
        }
    }

    setMessage(message) {
        const text = String(message || 'Loading...');
        this.message = text;
        if (this.messageEl) this.messageEl.textContent = text;
    }

    setVisible(visible) {
        this.visible = !!visible;
        if (!this.element) return;
        this.element.hidden = !this.visible;
        this.element.setAttribute('aria-hidden', this.visible ? 'false' : 'true');
    }

    show(message = '') {
        if (message) this.setMessage(message);
        this.setVisible(true);
    }

    hide() {
        this.setVisible(false);
    }

    setLoading(loading, message = '') {
        if (loading) {
            this.show(message);
            return;
        }
        this.hide();
    }

    destroy() {
        if (this.appliedRelativeHost && this.host) {
            this.host.style.position = '';
        }
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.LoaderComponent = LoaderComponent;
}

export { LoaderComponent };
