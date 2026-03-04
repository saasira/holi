import { Component } from './component.js';

class RadioGroupComponent extends Component {
    static get selector() {
        return 'holi-radio';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'radio-group';
    }

    static templateId = 'radio-group-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = RadioGroupComponent.templateId;
        this.config = {
            legend: this.container.getAttribute('legend') || '',
            name: this.container.getAttribute('name') || '',
            required: this.readBoolAttr('required', false),
            requiredMessage: this.container.getAttribute('data-required-message') || 'Please select one option.',
            options: this.parseOptions(this.container.getAttribute('data-options'))
        };
        this.state = {
            legend: this.config.legend,
            name: this.config.name,
            required: this.config.required,
            options: this.config.options,
            value: '',
            invalid: false,
            errorMessage: ''
        };
        this.boundChange = () => this.handleChange();
        this.init();
    }

    readBoolAttr(name, fallback = false) {
        if (!this.container.hasAttribute(name)) return fallback;
        const value = String(this.container.getAttribute(name) || '').trim().toLowerCase();
        if (!value) return true;
        return value !== 'false' && value !== '0' && value !== 'no';
    }

    parseOptions(raw) {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.map((item) => {
                if (item && typeof item === 'object') return item;
                return { value: item, label: String(item) };
            });
        } catch (_error) {
            return [];
        }
    }

    init() {
        this.validateStructure();
        void this.render();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-radio-group');
        this.optionsHost = this.container.querySelector('[data-role="options"]');
        this.errorEl = this.container.querySelector('[data-role="error"]');

        this.projectSlot('legend');
        this.projectSlot('options');
        this.projectSlot('actions');

        this.applyOptionAttributes();
        this.syncState();
        this.validate();
        this.element?.addEventListener('change', this.boundChange);
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

    applyOptionAttributes() {
        if (!this.optionsHost) return;
        const inputs = this.optionsHost.querySelectorAll('input[type="radio"]');
        inputs.forEach((input) => {
            if (this.config.name) input.name = this.config.name;
            if (this.config.required) input.required = true;
        });
    }

    syncState() {
        if (!this.optionsHost) return;
        const selected = this.optionsHost.querySelector('input[type="radio"]:checked');
        this.state.value = selected?.value || '';
    }

    handleChange() {
        this.syncState();
        this.validate();
        this.dispatchEvent('radiochange', { value: this.state.value });
    }

    validate() {
        const invalid = !!this.config.required && !this.state.value;
        this.state.invalid = invalid;
        this.state.errorMessage = invalid ? this.config.requiredMessage : '';

        if (this.element) this.element.classList.toggle('is-invalid', invalid);
        if (this.errorEl) {
            this.errorEl.hidden = !invalid;
            this.errorEl.textContent = this.state.errorMessage;
        }
        return !invalid;
    }

    get value() {
        return this.state.value || '';
    }

    set value(nextValue) {
        const wanted = nextValue == null ? '' : String(nextValue);
        const radios = Array.from(this.optionsHost?.querySelectorAll('input[type="radio"]') || []);
        radios.forEach((radio) => {
            radio.checked = radio.value === wanted;
        });
        this.syncState();
        this.validate();
    }

    destroy() {
        this.element?.removeEventListener('change', this.boundChange);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.RadioGroupComponent = RadioGroupComponent;
}

export { RadioGroupComponent };
