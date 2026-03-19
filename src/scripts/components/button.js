import { Component } from './component.js';

class ButtonComponent extends Component {
    static get selector() {
        return 'holi-button';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'button-control';
    }

    static templateId = 'button-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = ButtonComponent.templateId;
        this.config = {
            label: this.readAttr('label', 'Button'),
            type: this.readAttr('type', 'button'),
            variant: this.readAttr('variant', 'primary'),
            disabled: this.readBoolAttr('disabled', false)
        };
        this.state = {
            label: this.config.label,
            type: this.config.type,
            disabled: this.config.disabled
        };
        this.boundClick = (event) => this.handleClick(event);
        this.init();
    }

    readAttr(name, fallback = '') {
        const value = this.container.getAttribute(name);
        return value == null ? fallback : String(value);
    }

    readBoolAttr(name, fallback = false) {
        if (!this.container.hasAttribute(name)) return fallback;
        const value = String(this.container.getAttribute(name) || '').trim().toLowerCase();
        if (!value) return true;
        return value !== 'false' && value !== '0' && value !== 'no';
    }

    init() {
        this.validateStructure();
        void this.render();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-button');
        this.buttonEl = this.container.querySelector('[data-role="button"]');

        this.projectSlot('prefix');
        this.projectSlot('label');
        this.projectSlot('suffix');

        this.applyAttributes();
        this.buttonEl?.addEventListener('click', this.boundClick);
    }

    projectSlot(name) {
        const slotNode = this.container.querySelector(`slot[name="${name}"]`);
        if (!slotNode) return;
        const slotted = Array.from(this.container.querySelectorAll(`[slot="${name}"]`));
        if (!slotted.length) return;

        const fragment = document.createDocumentFragment();
        slotted.forEach((node) => {
            node.removeAttribute('slot');
            fragment.appendChild(node);
        });
        slotNode.replaceWith(fragment);
    }

    applyAttributes() {
        if (!this.buttonEl) return;
        this.buttonEl.type = this.config.type || 'button';
        this.buttonEl.disabled = !!this.config.disabled;
        this.buttonEl.setAttribute('data-variant', this.config.variant || 'primary');
    }

    handleClick(event) {
        this.dispatchEvent('buttonclick', {
            nativeEvent: event,
            type: this.buttonEl?.type || 'button'
        });
    }

    destroy() {
        this.buttonEl?.removeEventListener('click', this.boundClick);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.ButtonComponent = ButtonComponent;
}

export { ButtonComponent };
