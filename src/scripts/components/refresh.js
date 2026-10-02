import { Component } from './component.js';

class RefreshComponent extends Component {
    static get selector() {
        return 'refresh';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'refresh';
    }

    static templateId = 'refresh-template';

    static getNativeSelectors() {
        return ['[data-pull-refresh]'];
    }

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = RefreshComponent.templateId;
        this.threshold = this.parseNumber(options.threshold ?? this.readAttr('threshold', '72'), 72);
        this.refreshThreshold = this.parseNumber(options.refreshThreshold ?? this.readAttr('refresh-threshold', '108'), 108);
        this.maxPull = this.parseNumber(options.maxPull ?? this.readAttr('max-pull', '148'), 148);
        this.completeDelay = this.parseNumber(options.completeDelay ?? this.readAttr('complete-delay', '1200'), 1200);
        this.disabled = this.readBooleanAttr('disabled', false);
        this.triggerLabel = this.readAttr('label', 'Pull to refresh');
        this.releaseLabel = this.readAttr('release-label', 'Release to refresh');
        this.loadingLabel = this.readAttr('loading-label', 'Refreshing...');
        this.completeLabel = this.readAttr('complete-label', 'Updated just now');
        this.pointerId = null;
        this.startY = 0;
        this.currentY = 0;
        this.pullDistance = 0;
        this.isPulling = false;
        this.isRefreshing = false;
        this.refreshTimer = null;
        this.boundPointerDown = (event) => this.onPointerDown(event);
        this.boundPointerMove = (event) => this.onPointerMove(event);
        this.boundPointerUp = (event) => this.onPointerUp(event);
        this.boundKeyDown = (event) => this.onKeyDown(event);
        this.init();
    }

    readAttr(name, fallback = '') {
        const direct = this.container.getAttribute(name);
        if (direct != null) return String(direct);
        const dataValue = this.container.getAttribute(`data-${name}`);
        return dataValue != null ? String(dataValue) : fallback;
    }

    readBooleanAttr(name, fallback = false) {
        if (!this.container.hasAttribute(name) && !this.container.hasAttribute(`data-${name}`)) return fallback;
        const raw = this.readAttr(name, '');
        if (!raw) return true;
        const value = raw.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(value)) return true;
        if (['false', '0', 'no', 'off'].includes(value)) return false;
        return fallback;
    }

    parseNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    async init() {
        this.validateStructure();
        await this.render();
        this.bindEvents();
    }

    async render() {
        const initialChildren = Array.from(this.container.childNodes);
        await super.render();
        this.element = this.container.querySelector('.holi-refresh');
        this.handleEl = this.container.querySelector('[data-role="handle"]');
        this.labelEl = this.container.querySelector('[data-role="label"]');
        this.progressEl = this.container.querySelector('[data-role="progress"]');
        this.contentEl = this.container.querySelector('[data-role="content"]');

        if (!this.element || !this.handleEl || !this.labelEl || !this.progressEl || !this.contentEl) {
            throw new Error('Refresh template is missing required nodes');
        }

        const templateRoot = this.element;
        initialChildren.forEach((node) => {
            if (node === templateRoot) return;
            this.contentEl.appendChild(node);
        });

        this.container.hidden = false;
        this.element.setAttribute('data-state', this.disabled ? 'disabled' : 'idle');
        this.setPullDistance(0);
        this.setLabel(this.triggerLabel);

        if (typeof this.container.refresh === 'undefined') {
            Object.defineProperty(this.container, 'refresh', {
                value: this,
                writable: false
            });
        }
    }

    bindEvents() {
        this.element?.addEventListener('pointerdown', this.boundPointerDown);
        this.element?.addEventListener('pointermove', this.boundPointerMove);
        this.element?.addEventListener('pointerup', this.boundPointerUp);
        this.element?.addEventListener('pointercancel', this.boundPointerUp);
        this.element?.addEventListener('lostpointercapture', this.boundPointerUp);
        this.element?.addEventListener('keydown', this.boundKeyDown);
    }

    onPointerDown(event) {
        if (this.disabled || this.isRefreshing) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (!this.canStartPull()) return;

        this.pointerId = event.pointerId;
        this.startY = event.clientY;
        this.currentY = event.clientY;
        this.pullDistance = 0;
        this.isPulling = true;
        this.element?.setPointerCapture?.(event.pointerId);
        this.element?.setAttribute('data-state', 'pulling');
        this.setLabel(this.triggerLabel);
    }

    onPointerMove(event) {
        if (!this.isPulling || this.pointerId !== event.pointerId || this.isRefreshing) return;
        this.currentY = event.clientY;
        const diff = this.currentY - this.startY;
        if (diff <= 0) {
            this.setPullDistance(0);
            this.setLabel(this.triggerLabel);
            return;
        }
        if (!this.isAtTop()) return;

        const damped = Math.min(this.maxPull, diff * 0.62);
        const progress = Math.min(damped / this.refreshThreshold, 1);
        this.setPullDistance(damped);
        this.element?.setAttribute('data-state', progress >= 1 ? 'armed' : 'pulling');
        this.setLabel(progress >= 1 ? this.releaseLabel : this.triggerLabel);
        if (event.cancelable) event.preventDefault();
    }

    onPointerUp(event) {
        if (!this.isPulling) return;
        if (event.pointerId != null && this.pointerId != null && event.pointerId !== this.pointerId) return;

        const shouldRefresh = this.pullDistance >= this.refreshThreshold;
        this.isPulling = false;
        this.pointerId = null;

        if (shouldRefresh) {
            this.trigger();
            return;
        }

        this.reset();
    }

    onKeyDown(event) {
        if (this.disabled || this.isRefreshing) return;
        if ((event.key === 'r' || event.key === 'R') && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            this.trigger();
        }
    }

    canStartPull() {
        const target = this.contentEl || this.container;
        return target instanceof HTMLElement ? target.scrollTop <= 0 : this.isAtTop();
    }

    isAtTop() {
        const target = this.contentEl || this.container;
        if (target instanceof HTMLElement && target.scrollHeight > target.clientHeight) {
            return target.scrollTop <= 0;
        }
        if (typeof window !== 'undefined') {
            return (window.scrollY || window.pageYOffset || 0) <= 0;
        }
        return true;
    }

    setPullDistance(distance) {
        this.pullDistance = Math.max(0, Math.min(this.maxPull, distance));
        const progress = Math.min(this.pullDistance / this.refreshThreshold, 1);
        this.element?.style?.setProperty('--refresh-pull-distance', `${this.pullDistance}px`);
        this.progressEl?.style?.setProperty('--refresh-progress', String(progress));
    }

    setLabel(label) {
        if (this.labelEl) {
            this.labelEl.textContent = String(label || '');
        }
    }

    trigger() {
        if (this.disabled || this.isRefreshing) return;
        this.isRefreshing = true;
        this.element?.setAttribute('data-state', 'refreshing');
        this.setPullDistance(this.threshold);
        this.setLabel(this.loadingLabel);

        let completed = false;
        const complete = (payload = {}) => {
            if (completed) return;
            completed = true;
            const success = payload?.success !== false;
            this.finishRefresh(success, payload?.message || '');
        };

        const event = new CustomEvent('pullrefresh', {
            detail: {
                source: 'pull-to-refresh',
                component: this,
                complete
            },
            bubbles: true
        });

        this.container.dispatchEvent(event);

        this.refreshTimer = window.setTimeout(() => complete({ success: true }), this.completeDelay);
    }

    finishRefresh(success = true, message = '') {
        if (this.refreshTimer && typeof window !== 'undefined') {
            window.clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = null;
        this.isRefreshing = false;
        this.element?.setAttribute('data-state', success ? 'complete' : 'idle');
        this.setLabel(message || (success ? this.completeLabel : this.triggerLabel));

        if (typeof window !== 'undefined') {
            window.setTimeout(() => this.reset(), success ? 420 : 0);
        } else {
            this.reset();
        }
    }

    reset() {
        this.isRefreshing = false;
        this.setPullDistance(0);
        this.element?.setAttribute('data-state', this.disabled ? 'disabled' : 'idle');
        this.setLabel(this.triggerLabel);
    }

    destroy() {
        if (this.refreshTimer && typeof window !== 'undefined') {
            window.clearTimeout(this.refreshTimer);
        }
        this.element?.removeEventListener('pointerdown', this.boundPointerDown);
        this.element?.removeEventListener('pointermove', this.boundPointerMove);
        this.element?.removeEventListener('pointerup', this.boundPointerUp);
        this.element?.removeEventListener('pointercancel', this.boundPointerUp);
        this.element?.removeEventListener('lostpointercapture', this.boundPointerUp);
        this.element?.removeEventListener('keydown', this.boundKeyDown);
        super.destroy();
    }

    static enable(container, options = {}) {
        container.setAttribute('data-pull-refresh', 'true');
        return container.refresh || new RefreshComponent(container, options);
    }
}

if (typeof window !== 'undefined') {
    window.RefreshComponent = RefreshComponent;
}

export { RefreshComponent };
