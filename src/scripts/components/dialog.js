import { Component } from './component.js';

class DialogComponent extends Component {
    static get selector() {
        return 'dialog';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'dialog';
    }

    static templateId = 'dialog-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = DialogComponent.templateId;
        this.id = this.container.getAttribute('id') || this.container.getAttribute('dialog-id') || '';
        this.size = this.resolveSize(this.container.getAttribute('size') || this.container.getAttribute('mode') || 'medium');
        this.titleText = this.container.getAttribute('title') || this.container.getAttribute('data-title') || '';
        this.footerMessage = this.container.getAttribute('footer-message') || this.container.getAttribute('data-footer-message') || '';
        this.closeOnBackdrop = !this.container.hasAttribute('no-backdrop-close');
        this.returnValue = '';
        this.isOpen = false;
        this.useNative = typeof window !== 'undefined'
            && typeof window.HTMLDialogElement !== 'undefined'
            && !this.container.hasAttribute('no-native');
        this.slotted = null;
        this.initialOpen = this.container.hasAttribute('open');
        this.init();
    }

    resolveSize(size) {
        const value = String(size || 'medium').trim().toLowerCase();
        return ['mini', 'small', 'medium', 'large', 'mega'].includes(value) ? value : 'medium';
    }

    captureSlottedContent() {
        const directChildren = Array.from(this.container.children).filter((child) => !child.classList.contains('holi-dialog-root'));
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
        this.bindEvents();
        if (this.initialOpen) {
            this.open();
        }
    }

    async render() {
        await super.render();
        this.root = this.container.querySelector('.holi-dialog-root');
        this.nativeDialog = this.root?.querySelector('.holi-dialog-native');
        this.fallback = this.root?.querySelector('[data-role="fallback"]');
        this.overlay = this.root?.querySelector('.holi-dialog-overlay');
        this.nativeHeader = this.root?.querySelector('[data-role="header"]');
        this.nativeTitle = this.root?.querySelector('[data-role="title"]');
        this.nativeBody = this.root?.querySelector('[data-role="body"]');
        this.nativeFooter = this.root?.querySelector('[data-role="footer"]');
        this.fallbackHeader = this.root?.querySelector('[data-role="fallback-header"]');
        this.fallbackTitle = this.root?.querySelector('[data-role="fallback-title"]');
        this.fallbackBody = this.root?.querySelector('[data-role="fallback-body"]');
        this.fallbackFooter = this.root?.querySelector('[data-role="fallback-footer"]');

        if (this.nativeDialog) {
            if (this.useNative) {
                this.nativeDialog.hidden = false;
                this.nativeDialog.style.display = '';
            } else {
                this.nativeDialog.hidden = true;
                this.nativeDialog.style.display = 'none';
                this.nativeDialog.removeAttribute('open');
            }
        }

        this.applyDialogContent();
        this.applyLayoutState();
    }

    applyDialogContent() {
        if (!this.slotted) return;
        const { header, footer, bodyNodes } = this.slotted;
        const toNative = !!this.useNative;

        if (toNative) {
            this.nativeBody?.replaceChildren(...bodyNodes);
            this.fallbackBody?.replaceChildren();
        } else {
            this.fallbackBody?.replaceChildren(...bodyNodes);
            this.nativeBody?.replaceChildren();
        }

        if (header) {
            if (toNative) {
                this.nativeHeader?.replaceChildren(header);
                this.fallbackHeader?.replaceChildren();
            } else {
                this.fallbackHeader?.replaceChildren(header);
                this.nativeHeader?.replaceChildren();
            }
        } else {
            if (this.nativeTitle) this.nativeTitle.textContent = this.titleText;
            if (this.fallbackTitle) this.fallbackTitle.textContent = this.titleText;
        }

        if (footer) {
            if (toNative) {
                this.nativeFooter?.replaceChildren(footer);
                this.fallbackFooter?.replaceChildren();
            } else {
                this.fallbackFooter?.replaceChildren(footer);
                this.nativeFooter?.replaceChildren();
            }
        } else if (this.footerMessage) {
            if (this.nativeFooter) this.nativeFooter.textContent = this.footerMessage;
            if (this.fallbackFooter) this.fallbackFooter.textContent = this.footerMessage;
        }

        const hasHeader = !!header || !!this.titleText;
        const hasFooter = !!footer || !!this.footerMessage;
        if (this.nativeHeader) this.nativeHeader.hidden = !hasHeader;
        if (this.fallbackHeader) this.fallbackHeader.hidden = !hasHeader;
        if (this.nativeFooter) this.nativeFooter.hidden = !hasFooter;
        if (this.fallbackFooter) this.fallbackFooter.hidden = !hasFooter;
    }

    applyLayoutState() {
        if (!this.root) return;
        this.root.setAttribute('data-size', this.size);
        this.root.setAttribute('data-state', this.isOpen ? 'open' : 'closed');
        if (this.nativeDialog) this.nativeDialog.setAttribute('data-size', this.size);
    }

    bindEvents() {
        const handleActionClick = (e) => {
            const action = e.target?.dataset?.action;
            if (action === 'close') {
                const value = e.target.getAttribute('data-value') || '';
                this.close(value);
                return;
            }
            if (action === 'backdrop' && this.closeOnBackdrop) {
                this.close('backdrop');
            }
        };

        this.root?.addEventListener('click', handleActionClick);
        this.nativeDialog?.addEventListener('click', handleActionClick);
        this.fallback?.addEventListener('click', handleActionClick);

        this.nativeDialog?.addEventListener('cancel', (e) => {
            e.preventDefault();
            this.close('cancel');
        });

        this.nativeDialog?.addEventListener('close', () => {
            this.onClosed();
        });

        if (this.id && typeof document !== 'undefined') {
            document.addEventListener('click', (e) => {
                const openTarget = e.target?.closest?.(`[data-dialog-open="${this.id}"]`);
                if (openTarget) {
                    this.open();
                    return;
                }
                const closeTarget = e.target?.closest?.(`[data-dialog-close="${this.id}"]`);
                if (closeTarget) {
                    this.close('trigger');
                }
            });
        }
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;
        this.applyLayoutState();

        if (this.useNative && this.nativeDialog?.showModal) {
            this.fallback.hidden = true;
            if (!this.nativeDialog.open) {
                this.nativeDialog.showModal();
            }
        } else {
            if (this.fallback) this.fallback.hidden = false;
        }

        this.dispatchEvent('dialogopen', { size: this.size });
    }

    close(value = '') {
        this.returnValue = value;
        if (!this.isOpen) return;
        this.isOpen = false;
        this.applyLayoutState();

        if (this.useNative && this.nativeDialog?.open) {
            this.nativeDialog.close(value);
            return;
        }

        this.onClosed();
    }

    onClosed() {
        if (this.fallback) this.fallback.hidden = true;
        this.applyLayoutState();
        this.dispatchEvent('dialogclose', { size: this.size, returnValue: this.returnValue });
    }

    toggle() {
        if (this.isOpen) {
            this.close('toggle');
        } else {
            this.open();
        }
    }

    setSize(nextSize) {
        this.size = this.resolveSize(nextSize);
        this.applyLayoutState();
    }
}

if (typeof window !== 'undefined') {
    window.DialogComponent = DialogComponent;
}

export { DialogComponent };
