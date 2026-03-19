import { Component } from './component.js';
import { Validator } from '../utils/validator.js';

class TextAreaComponent extends Component {
    static get selector() {
        return 'holi-textarea';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'textarea-field';
    }

    static templateId = 'textarea-field-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = TextAreaComponent.templateId;
        this.config = {
            name: this.readAttr('name'),
            label: this.readAttr('label'),
            placeholder: this.readAttr('placeholder'),
            rows: Number(this.readAttr('rows', '4')) || 4,
            required: this.readBoolAttr('required', false),
            disabled: this.readBoolAttr('disabled', false),
            validators: this.parseValidators(
                this.readAttr('data-validator') || this.readAttr('data-validators')
            )
        };
        this.state = {
            name: this.config.name,
            label: this.config.label,
            placeholder: this.config.placeholder,
            rows: this.config.rows,
            required: this.config.required,
            disabled: this.config.disabled,
            value: this.readAttr('value', ''),
            invalid: false,
            errorMessage: ''
        };
        this.boundInput = (event) => this.handleInput(event);
        this.boundBlur = () => this.handleBlur();
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

    parseValidators(raw) {
        return Validator.parseList(raw);
    }

    init() {
        this.validateStructure();
        void this.render();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-textarea');
        this.inputEl = this.container.querySelector('[data-role="control"]');
        this.labelEl = this.container.querySelector('[data-role="label"]');
        this.errorEl = this.container.querySelector('[data-role="error"]');

        this.projectSlot('label');
        this.projectSlot('helper');
        this.projectSlot('error');

        this.applyFieldAttributes();
        this.bindEvents();
        this.validate();
        this.updateView();
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

    applyFieldAttributes() {
        if (!this.inputEl) return;
        this.inputEl.value = this.state.value;
        this.inputEl.name = this.config.name || '';
        this.inputEl.placeholder = this.config.placeholder || '';
        this.inputEl.rows = this.config.rows;
        this.inputEl.required = !!this.config.required;
        this.inputEl.disabled = !!this.config.disabled;

        const fieldId = this.inputEl.id || `holi-textarea-${Math.random().toString(16).slice(2)}`;
        this.inputEl.id = fieldId;
        if (this.labelEl && !this.labelEl.getAttribute('for')) this.labelEl.setAttribute('for', fieldId);
    }

    bindEvents() {
        if (!this.inputEl) return;
        this.inputEl.addEventListener('input', this.boundInput);
        this.inputEl.addEventListener('blur', this.boundBlur);
    }

    handleInput(event) {
        this.state.value = String(event?.target?.value || '');
        this.validate();
        this.updateView();
        this.dispatchEvent('textareachange', {
            value: this.state.value,
            invalid: this.state.invalid
        });
    }

    handleBlur() {
        this.validate();
        this.updateView();
    }

    validate() {
        const validators = [...this.config.validators];
        if (this.config.required && !validators.includes('required')) validators.unshift('required');

        for (let i = 0; i < validators.length; i += 1) {
            const token = validators[i];
            const result = this.runValidator(token, this.state.value);
            if (!result.valid) {
                this.state.invalid = true;
                this.state.errorMessage = result.message;
                return false;
            }
        }

        this.state.invalid = false;
        this.state.errorMessage = '';
        return true;
    }

    runValidator(validator, value) {
        return Validator.validateToken(validator, value, {
            element: this.inputEl,
            component: this
        });
    }

    updateView() {
        if (!this.element || !this.inputEl) return;
        this.element.classList.toggle('is-invalid', this.state.invalid);
        this.inputEl.setAttribute('aria-invalid', this.state.invalid ? 'true' : 'false');
        if (this.errorEl) {
            this.errorEl.hidden = !this.state.invalid;
            this.errorEl.textContent = this.state.invalid ? this.state.errorMessage : '';
        }
    }

    get value() {
        return this.inputEl?.value || '';
    }

    set value(nextValue) {
        const value = nextValue == null ? '' : String(nextValue);
        this.state.value = value;
        if (this.inputEl) this.inputEl.value = value;
        this.validate();
        this.updateView();
    }

    destroy() {
        if (this.inputEl) {
            this.inputEl.removeEventListener('input', this.boundInput);
            this.inputEl.removeEventListener('blur', this.boundBlur);
        }
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.TextAreaComponent = TextAreaComponent;
}

export { TextAreaComponent };
