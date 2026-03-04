import { Component } from './component.js';

class DrawerComponent extends Component {
    static activeInstance = null;
    static rails = new Map();
    static idCounter = 0;
    static panelCounter = 0;

    static get selector() {
        return 'drawer';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'drawer';
    }

    static templateId = 'drawer-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = DrawerComponent.templateId;
        this.drawerId = this.ensureDrawerId();
        this.panelId = this.ensurePanelId();
        this.direction = this.resolveDirection(this.container.getAttribute('direction') || this.container.getAttribute('position') || 'left');
        this.breakpoint = this.parseNumber(this.container.getAttribute('breakpoint'), 768);
        this.maxSize = this.container.getAttribute('max-size') || this.defaultMaxSize(this.direction);
        this.maxHeight = this.container.getAttribute('max-height') || '90vh';
        this.showEdgeTrigger = !this.container.hasAttribute('no-edge-trigger');
        this.railName = (this.container.getAttribute('rail') || '').trim();
        this.triggerLabel = this.container.getAttribute('trigger-label') || this.drawerId || 'Open';
        this.triggerIcon = this.container.getAttribute('trigger-icon') || '';
        this.backdropEnabled = !this.container.hasAttribute('no-backdrop');
        this.closeOnOverlay = !this.container.hasAttribute('no-overlay-close');
        this.closeOnEscape = !this.container.hasAttribute('no-escape-close');
        this.initialOpen = this.container.hasAttribute('open');
        this.isOpen = false;
        this.isDesktop = false;
        this.mediaQueryList = null;
        this.mediaQueryHandler = null;
        this.edgeTrigger = null;
        this.railElement = null;
        this.ownsRail = false;
        this.previousFocusedElement = null;
        this.lastTriggerElement = null;
        this.documentKeydownHandler = null;
        this.slotted = null;
        this.init();
    }

    ensureDrawerId() {
        const existing = this.container.getAttribute('id') || this.container.getAttribute('drawer-id');
        if (existing) return existing;
        DrawerComponent.idCounter += 1;
        const nextId = `drawer-${DrawerComponent.idCounter}`;
        this.container.setAttribute('id', nextId);
        return nextId;
    }

    ensurePanelId() {
        const existing = this.container.getAttribute('panel-id');
        if (existing) return existing;
        DrawerComponent.panelCounter += 1;
        return `drawer-panel-${DrawerComponent.panelCounter}`;
    }

    parseNumber(value, fallback) {
        const next = Number(value);
        return Number.isFinite(next) ? next : fallback;
    }

    resolveDirection(direction) {
        const value = String(direction || 'left').trim().toLowerCase();
        return ['left', 'right', 'top', 'bottom', 'center'].includes(value) ? value : 'left';
    }

    defaultMaxSize(direction) {
        if (direction === 'center') return '760px';
        return direction === 'left' || direction === 'right' ? '380px' : '42vh';
    }

    captureSlottedContent() {
        const directChildren = Array.from(this.container.children).filter((child) => !child.classList.contains('holi-drawer-root'));
        const header = directChildren.find((node) => node.getAttribute('slot') === 'header') || null;
        const footer = directChildren.find((node) => node.getAttribute('slot') === 'footer') || null;
        const bodyNodes = directChildren.filter((node) => {
            const slot = node.getAttribute('slot');
            return !slot || slot === 'content' || slot === 'body';
        });
        this.slotted = { header, footer, bodyNodes };
    }

    async init() {
        this.captureSlottedContent();
        this.validateStructure();
        await this.render();
        this.setupResponsive();
        this.bindEvents();
        if (this.initialOpen) {
            this.open();
        } else {
            this.close('initial');
        }
    }

    async render() {
        await super.render();
        this.root = this.container.querySelector('.holi-drawer-root');
        this.overlay = this.container.querySelector('[data-role="overlay"]');
        this.panel = this.container.querySelector('[data-role="panel"]');
        this.header = this.container.querySelector('[data-role="header"]');
        this.footer = this.container.querySelector('[data-role="footer"]');
        this.body = this.container.querySelector('[data-role="body"]');
        this.edgeTrigger = this.container.querySelector('[data-role="edge-trigger"]');
        this.root?.setAttribute('data-direction', this.direction);
        this.root?.style.setProperty('--drawer-max-size', this.maxSize);
        this.root?.style.setProperty('--drawer-max-height', this.maxHeight);
        if (this.panel) {
            this.panel.id = this.panelId;
            this.panel.setAttribute('role', this.direction === 'center' ? 'dialog' : 'complementary');
            this.panel.setAttribute('aria-hidden', 'true');
            this.panel.setAttribute('tabindex', '-1');
        }
        this.setupEdgeTrigger();
        this.decorateExternalTriggers();
        this.applySlotContent();
        this.applyState();
    }

    setupEdgeTrigger() {
        if (!this.edgeTrigger || !this.root) return;
        if (!this.showEdgeTrigger) {
            this.edgeTrigger.remove();
            this.edgeTrigger = null;
            return;
        }

        const labelParts = [this.triggerIcon, this.triggerLabel].filter(Boolean);
        this.edgeTrigger.textContent = labelParts.join(' ').trim();
        this.edgeTrigger.setAttribute('aria-label', this.triggerLabel);
        this.edgeTrigger.setAttribute('aria-controls', this.panelId);
        this.edgeTrigger.setAttribute('aria-expanded', 'false');
        this.edgeTrigger.setAttribute('data-drawer-toggle', this.drawerId);

        if (!this.railName) return;

        const railKey = `${this.direction}:${this.railName}`;
        let rail = DrawerComponent.rails.get(railKey);
        if (!rail && typeof document !== 'undefined') {
            rail = document.createElement('nav');
            rail.className = 'holi-drawer-rail';
            rail.setAttribute('data-rail', this.railName);
            rail.setAttribute('data-direction', this.direction);
            document.body.appendChild(rail);
            DrawerComponent.rails.set(railKey, rail);
            this.ownsRail = true;
        }

        this.railElement = rail || null;
        if (this.railElement) {
            this.edgeTrigger.setAttribute('data-in-rail', 'true');
            this.railElement.appendChild(this.edgeTrigger);
        }
    }

    decorateExternalTriggers() {
        if (typeof document === 'undefined') return;
        const selectors = [
            `[data-drawer-open="${this.drawerId}"]`,
            `[data-drawer-toggle="${this.drawerId}"]`,
            `[data-drawer-close="${this.drawerId}"]`
        ];
        selectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((el) => {
                el.setAttribute('aria-controls', this.panelId);
                if (el.matches('[data-drawer-open], [data-drawer-toggle]')) {
                    el.setAttribute('aria-expanded', this.isOpen ? 'true' : 'false');
                }
            });
        });
    }

    applySlotContent() {
        if (!this.slotted) return;
        const { header, footer, bodyNodes } = this.slotted;

        if (this.body) {
            this.body.replaceChildren(...bodyNodes);
        }

        if (header && this.header) {
            this.header.replaceChildren(header);
            this.header.hidden = false;
        } else if (this.header) {
            this.header.hidden = true;
        }

        if (footer && this.footer) {
            this.footer.replaceChildren(footer);
            this.footer.hidden = false;
        } else if (this.footer) {
            this.footer.hidden = true;
        }
    }

    setupResponsive() {
        if (typeof window === 'undefined') return;
        const media = window.matchMedia(`(min-width: ${this.breakpoint}px)`);
        this.mediaQueryList = media;
        this.isDesktop = media.matches;
        this.mediaQueryHandler = (e) => {
            this.isDesktop = e.matches;
            // Viewport switch should not force-open all drawer instances.
            this.applyState();
        };

        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', this.mediaQueryHandler);
        } else if (typeof media.addListener === 'function') {
            media.addListener(this.mediaQueryHandler);
        }
    }

    bindEvents() {
        this.container.addEventListener('click', (e) => {
            const action = e.target?.dataset?.action;
            if (!action) return;
            if (action === 'close') {
                this.close('button');
                return;
            }
            if (action === 'backdrop' && this.closeOnOverlay) {
                this.close('overlay');
            }
        });

        if (this.drawerId && typeof document !== 'undefined') {
            document.addEventListener('click', (e) => {
                const openTarget = e.target?.closest?.(`[data-drawer-open="${this.drawerId}"]`);
                if (openTarget) {
                    e.preventDefault();
                    this.lastTriggerElement = openTarget;
                    this.open();
                    return;
                }
                const toggleTarget = e.target?.closest?.(`[data-drawer-toggle="${this.drawerId}"]`);
                if (toggleTarget) {
                    e.preventDefault();
                    this.lastTriggerElement = toggleTarget;
                    this.toggle();
                    return;
                }
                const closeTarget = e.target?.closest?.(`[data-drawer-close="${this.drawerId}"]`);
                if (closeTarget) {
                    e.preventDefault();
                    this.lastTriggerElement = closeTarget;
                    this.close('trigger');
                }
            });
        }

        if (this.closeOnEscape && typeof document !== 'undefined') {
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.close('escape');
                }
            });
        }

        if (typeof document !== 'undefined') {
            this.documentKeydownHandler = (e) => {
                if (!this.isOpen || DrawerComponent.activeInstance !== this) return;
                if (e.key !== 'Tab') return;
                this.trapFocus(e);
            };
            document.addEventListener('keydown', this.documentKeydownHandler);
        }
    }

    open() {
        if (DrawerComponent.activeInstance && DrawerComponent.activeInstance !== this) {
            DrawerComponent.activeInstance.close('switch');
        }

        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
            this.previousFocusedElement = document.activeElement;
        }

        const changed = !this.isOpen;
        this.setOpen(true);
        DrawerComponent.activeInstance = this;
        this.focusFirstElement();
        if (!changed) return;
        this.dispatchEvent('draweropen', { id: this.drawerId, direction: this.direction });
    }

    close(reason = 'manual') {
        const changed = this.isOpen;
        this.setOpen(false);
        if (DrawerComponent.activeInstance === this) {
            DrawerComponent.activeInstance = null;
        }
        this.restoreFocus(reason);
        if (!changed) return;
        this.dispatchEvent('drawerclose', { id: this.drawerId, direction: this.direction, reason });
    }

    toggle() {
        if (this.isOpen) {
            this.close('toggle');
        } else {
            this.open();
        }
    }

    setDirection(nextDirection) {
        this.direction = this.resolveDirection(nextDirection);
        this.root?.setAttribute('data-direction', this.direction);
    }

    setMaxSize(value) {
        this.maxSize = value || this.defaultMaxSize(this.direction);
        this.root?.style.setProperty('--drawer-max-size', this.maxSize);
    }

    setOpen(nextOpen) {
        this.isOpen = !!nextOpen;
        this.container.toggleAttribute('open', this.isOpen);
        if (this.edgeTrigger) {
            this.edgeTrigger.setAttribute('aria-expanded', this.isOpen ? 'true' : 'false');
        }
        this.updateTriggerAriaExpanded();
        this.applyState();
    }

    updateTriggerAriaExpanded() {
        if (typeof document === 'undefined') return;
        const selectors = [
            `[data-drawer-open="${this.drawerId}"]`,
            `[data-drawer-toggle="${this.drawerId}"]`
        ];
        selectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((el) => {
                el.setAttribute('aria-expanded', this.isOpen ? 'true' : 'false');
            });
        });
    }

    applyState() {
        if (!this.root || !this.panel) return;

        this.root.setAttribute('data-state', this.isOpen ? 'open' : 'closed');
        this.root.setAttribute('data-desktop', this.isDesktop ? 'true' : 'false');

        const showOverlay = this.backdropEnabled && this.isOpen && (!this.isDesktop || this.direction === 'center');
        if (this.overlay) {
            this.overlay.hidden = !showOverlay;
            this.overlay.setAttribute('aria-hidden', showOverlay ? 'false' : 'true');
        }
        if (this.panel) {
            this.panel.setAttribute('aria-hidden', this.isOpen ? 'false' : 'true');
            this.panel.setAttribute('aria-modal', this.isOpen && showOverlay ? 'true' : 'false');
        }

        if (typeof document !== 'undefined') {
            if (showOverlay) {
                document.body.classList.add('holi-drawer-lock');
            } else {
                document.body.classList.remove('holi-drawer-lock');
            }
        }

        this.applyInlinePanelState();
    }

    applyInlinePanelState() {
        if (!this.panel) return;
        this.panel.style.transition = 'transform 220ms ease, opacity 220ms ease, border-radius 220ms ease';

        if (this.direction === 'center') {
            this.panel.style.width = 'fit-content';
            this.panel.style.maxWidth = `min(${this.maxSize}, 92vw)`;
            this.panel.style.height = 'auto';
            this.panel.style.maxHeight = this.maxHeight;
            this.panel.style.transformOrigin = 'center center';
            this.panel.style.borderRadius = this.isOpen ? '12px' : '999px';
            this.panel.style.opacity = this.isOpen ? '1' : '0.25';
            this.panel.style.transform = this.isOpen
                ? 'translate(-50%, -50%) scale(1)'
                : 'translate(-50%, -50%) scale(0.02)';
            return;
        }

        if (this.direction === 'left' || this.direction === 'right') {
            this.panel.style.width = `min(${this.maxSize}, 92vw)`;
            this.panel.style.height = '100dvh';
        } else {
            this.panel.style.width = '100vw';
            this.panel.style.height = `min(${this.maxSize}, 92vh)`;
        }
        this.panel.style.maxHeight = '';
        this.panel.style.transformOrigin = '';
        this.panel.style.borderRadius = '';
        this.panel.style.opacity = '';

        if (this.isOpen) {
            this.panel.style.transform = 'translate(0, 0)';
            return;
        }

        if (this.direction === 'left') {
            this.panel.style.transform = 'translateX(-100%)';
            return;
        }
        if (this.direction === 'right') {
            this.panel.style.transform = 'translateX(100%)';
            return;
        }
        if (this.direction === 'top') {
            this.panel.style.transform = 'translateY(-100%)';
            return;
        }
        this.panel.style.transform = 'translateY(100%)';
    }

    getFocusableElements() {
        if (!this.panel) return [];
        const selector = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])'
        ].join(',');
        return Array.from(this.panel.querySelectorAll(selector))
            .filter((el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true');
    }

    focusFirstElement() {
        if (!this.panel) return;
        requestAnimationFrame(() => {
            if (!this.isOpen) return;
            const focusables = this.getFocusableElements();
            const target = focusables[0] || this.panel;
            target.focus?.();
        });
    }

    trapFocus(event) {
        if (!this.panel) return;
        const focusables = this.getFocusableElements();
        if (!focusables.length) {
            event.preventDefault();
            this.panel.focus();
            return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
            return;
        }

        if (event.shiftKey && (active === first || active === this.panel)) {
            event.preventDefault();
            last.focus();
        }
    }

    restoreFocus(reason) {
        if (reason === 'switch') return;
        const target = (this.lastTriggerElement && this.lastTriggerElement.isConnected)
            ? this.lastTriggerElement
            : this.previousFocusedElement;
        if (target && target.isConnected && typeof target.focus === 'function') {
            target.focus();
        } else if (this.edgeTrigger && typeof this.edgeTrigger.focus === 'function') {
            this.edgeTrigger.focus();
        }
    }

    destroy() {
        if (DrawerComponent.activeInstance === this) {
            DrawerComponent.activeInstance = null;
        }

        if (this.edgeTrigger && this.edgeTrigger.parentNode) {
            this.edgeTrigger.remove();
        }

        if (this.railElement && this.ownsRail && this.railElement.childElementCount === 0) {
            const railKey = `${this.direction}:${this.railName}`;
            this.railElement.remove();
            DrawerComponent.rails.delete(railKey);
        }

        if (this.mediaQueryList && this.mediaQueryHandler) {
            if (typeof this.mediaQueryList.removeEventListener === 'function') {
                this.mediaQueryList.removeEventListener('change', this.mediaQueryHandler);
            } else if (typeof this.mediaQueryList.removeListener === 'function') {
                this.mediaQueryList.removeListener(this.mediaQueryHandler);
            }
        }

        if (this.documentKeydownHandler && typeof document !== 'undefined') {
            document.removeEventListener('keydown', this.documentKeydownHandler);
            this.documentKeydownHandler = null;
        }

        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.DrawerComponent = DrawerComponent;
}

export { DrawerComponent };
