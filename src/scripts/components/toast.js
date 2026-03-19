import { Component } from './component.js';

class ToastComponent extends Component {
    static get selector() {
        return 'toast';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'toast';
    }

    static templateId = 'toast-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = ToastComponent.templateId;
        this.toastId = this.container.getAttribute('id') || this.container.getAttribute('toast-id') || '';
        this.scope = this.resolveScope(this.container.getAttribute('scope') || this.container.getAttribute('data-scope') || 'page');
        this.blockParentSelector = this.resolveBlockParentSelector(
            this.container.getAttribute('block-parent') || this.container.getAttribute('data-block-parent') || ''
        );
        this.position = this.resolvePosition(this.container.getAttribute('position') || this.container.getAttribute('data-position') || 'top-right');
        this.defaultDuration = this.parseNumber(this.container.getAttribute('duration') || this.container.getAttribute('data-duration'), 4000);
        this.maxItems = this.parseNumber(this.container.getAttribute('max-items') || this.container.getAttribute('data-max-items'), 5);
        this.newestOnTop = !this.container.hasAttribute('newest-bottom');
        this.blockParentEl = null;
        this.appliedRelativeParent = false;
        this.items = [];
        this.counter = 0;
        this.init();
    }

    parseNumber(value, fallback) {
        const next = Number(value);
        return Number.isFinite(next) ? next : fallback;
    }

    resolvePosition(position) {
        const value = String(position || 'top-right').toLowerCase();
        const allowed = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center']);
        return allowed.has(value) ? value : 'top-right';
    }

    resolveScope(scope) {
        const value = String(scope || 'page').toLowerCase();
        if (value === 'inline' || value === 'block') return value;
        return 'page';
    }

    resolveBlockParentSelector(selector) {
        return String(selector || '').trim();
    }

    resolveBlockParent() {
        if (typeof document === 'undefined') return null;
        if (this.blockParentSelector) {
            return document.querySelector(this.blockParentSelector);
        }
        return this.container.parentElement || this.container;
    }

    ensureBlockParentPositionContext() {
        if (this.scope !== 'block' || !this.blockParentEl || typeof window === 'undefined') return;
        const computed = window.getComputedStyle(this.blockParentEl);
        if (computed.position === 'static') {
            this.blockParentEl.style.position = 'relative';
            this.appliedRelativeParent = true;
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
        this.bindEvents();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-toast-root');
        this.stackEl = this.container.querySelector('[data-role="stack"]');
        if (this.element) {
            this.element.setAttribute('data-position', this.position);
            this.element.setAttribute('data-scope', this.scope);
        }

        if (this.scope === 'block' && this.element) {
            this.blockParentEl = this.resolveBlockParent();
            if (this.blockParentEl && this.element.parentElement !== this.blockParentEl) {
                this.blockParentEl.appendChild(this.element);
                this.ensureBlockParentPositionContext();
            }
        }

        this.container.hidden = this.scope === 'block';
    }

    bindEvents() {
        this.element?.addEventListener('click', (e) => {
            const closeButton = e.target?.closest?.('[data-action="dismiss"]');
            if (!closeButton) return;
            const toastEl = closeButton.closest('[data-toast-item]');
            if (!toastEl) return;
            this.hide(toastEl.getAttribute('data-toast-item'), 'dismiss');
        });

        if (!this.toastId || typeof document === 'undefined') return;
        document.addEventListener('click', (e) => {
            const trigger = e.target?.closest?.(`[data-toast-target="${this.toastId}"]`);
            if (!trigger) return;
            this.show({
                type: trigger.getAttribute('data-toast-type') || 'info',
                title: trigger.getAttribute('data-toast-title') || '',
                message: trigger.getAttribute('data-toast-message') || '',
                duration: this.parseNumber(trigger.getAttribute('data-toast-duration'), this.defaultDuration)
            });
        });
    }

    normalizePayload(payload) {
        if (typeof payload === 'string') {
            return { message: payload, type: 'info', duration: this.defaultDuration };
        }

        const data = payload || {};
        return {
            type: String(data.type || 'info').toLowerCase(),
            title: String(data.title || ''),
            message: String(data.message || ''),
            duration: this.parseNumber(data.duration, this.defaultDuration)
        };
    }

    show(payload = {}) {
        if (!this.stackEl) return null;
        const item = this.normalizePayload(payload);
        if (!item.message && !item.title) return null;

        const id = `toast-${Date.now()}-${this.counter += 1}`;
        const toastNode = this.createToastNode(id, item);

        if (this.newestOnTop) {
            this.stackEl.prepend(toastNode);
        } else {
            this.stackEl.appendChild(toastNode);
        }

        this.items.push({ id, node: toastNode, timer: null, duration: item.duration });
        this.enforceMaxItems();

        requestAnimationFrame(() => {
            toastNode.setAttribute('data-state', 'shown');
        });

        if (item.duration > 0) {
            const target = this.items.find((entry) => entry.id === id);
            if (target) {
                target.timer = setTimeout(() => this.hide(id, 'timeout'), item.duration);
            }
        }

        this.dispatchEvent('toastshown', { id, ...item });
        return id;
    }

    createToastNode(id, item) {
        const toast = document.createElement('article');
        toast.className = `holi-toast-item toast-${item.type}`;
        toast.setAttribute('data-toast-item', id);
        toast.setAttribute('data-state', 'enter');
        toast.setAttribute('role', item.type === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-live', item.type === 'error' ? 'assertive' : 'polite');
        toast.setAttribute('aria-atomic', 'true');

        const body = document.createElement('div');
        body.className = 'holi-toast-body';

        if (item.title) {
            const title = document.createElement('strong');
            title.className = 'holi-toast-title';
            title.textContent = item.title;
            body.appendChild(title);
        }

        if (item.message) {
            const message = document.createElement('div');
            message.className = 'holi-toast-message';
            message.textContent = item.message;
            body.appendChild(message);
        }

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'holi-toast-close';
        close.setAttribute('data-action', 'dismiss');
        close.setAttribute('aria-label', 'Dismiss');
        close.textContent = 'x';

        toast.append(body, close);
        return toast;
    }

    hide(id, reason = 'manual') {
        const idx = this.items.findIndex((entry) => entry.id === id);
        if (idx < 0) return;

        const target = this.items[idx];
        clearTimeout(target.timer);
        target.node.setAttribute('data-state', 'hide');

        setTimeout(() => {
            target.node.remove();
            this.items.splice(idx, 1);
            this.dispatchEvent('toasthidden', { id, reason });
        }, 180);
    }

    clear() {
        const ids = this.items.map((entry) => entry.id);
        ids.forEach((id) => this.hide(id, 'clear'));
    }

    enforceMaxItems() {
        if (this.maxItems <= 0) return;
        while (this.items.length > this.maxItems) {
            const candidate = this.newestOnTop ? this.items[0] : this.items[this.items.length - 1];
            if (!candidate) break;
            this.hide(candidate.id, 'overflow');
        }
    }

    destroy() {
        if (this.appliedRelativeParent && this.blockParentEl) {
            this.blockParentEl.style.position = '';
        }
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.ToastComponent = ToastComponent;
}

export { ToastComponent };
