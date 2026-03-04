import { Component } from './component.js';

class InputComponent extends Component {
    static get selector() {
        return 'holi-input';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'input-field';
    }

    static templateId = 'input-field-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = InputComponent.templateId;
        const controlType = this.resolveControlType();
        const isAreaMode = controlType === 'area';
        this.config = {
            name: this.readAttr('name'),
            label: this.readAttr('label'),
            type: isAreaMode ? 'text' : controlType,
            controlType,
            isAreaMode,
            placeholder: this.readAttr('placeholder'),
            rows: Math.max(1, Number(this.readAttr('rows', '4')) || 4),
            cols: Math.max(1, Number(this.readAttr('cols', '30')) || 30),
            required: this.readBoolAttr('required', false),
            disabled: this.readBoolAttr('disabled', false),
            errorMessage: this.readAttr('error-message', 'Invalid value.'),
            validators: this.parseValidators(this.readAttr('data-validators'))
        };
        this.state = {
            label: this.config.label,
            required: this.config.required,
            name: this.config.name,
            type: this.config.type,
            placeholder: this.config.placeholder,
            rows: this.config.rows,
            cols: this.config.cols,
            isAreaMode: this.config.isAreaMode,
            isInputMode: !this.config.isAreaMode,
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
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        return String(raw)
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    resolveControlType() {
        const rawType = String(this.readAttr('type', 'text') || 'text').trim().toLowerCase();
        const rawRole = String(this.readAttr('role', '') || '').trim().toLowerCase();
        const roleToType = {
            text: 'text',
            email: 'email',
            number: 'number',
            password: 'password',
            url: 'url',
            tel: 'tel',
            search: 'search',
            textarea: 'area',
            area: 'area'
        };
        if (rawRole && roleToType[rawRole]) {
            if (rawType === 'text' || rawType === 'input') {
                return roleToType[rawRole];
            }
            if (rawType === 'area' || rawType === 'textarea') {
                return 'area';
            }
        }
        if (rawType === 'area' || rawType === 'textarea') return 'area';
        return rawType || 'text';
    }

    init() {
        this.validateStructure();
        void this.render();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-input');
        this.inputEl = this.container.querySelector('[data-role="control-input"]');
        this.areaEl = this.container.querySelector('[data-role="control-area"]');
        this.controlEl = this.areaEl || this.inputEl;
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
        if (!this.controlEl) return;

        this.controlEl.value = this.state.value;
        this.controlEl.name = this.config.name || '';
        this.controlEl.placeholder = this.config.placeholder || '';
        this.controlEl.required = !!this.config.required;
        this.controlEl.disabled = !!this.config.disabled;
        if (this.config.isAreaMode) {
            this.controlEl.rows = this.config.rows;
            this.controlEl.cols = this.config.cols;
        } else {
            this.controlEl.type = this.config.type || 'text';
        }

        const fieldId = this.controlEl.id || `holi-input-${Math.random().toString(16).slice(2)}`;
        this.controlEl.id = fieldId;
        if (this.labelEl && !this.labelEl.getAttribute('for')) {
            this.labelEl.setAttribute('for', fieldId);
        }
    }

    bindEvents() {
        if (!this.controlEl) return;
        this.controlEl.addEventListener('input', this.boundInput);
        this.controlEl.addEventListener('blur', this.boundBlur);
    }

    handleInput(event) {
        this.state.value = String(event?.target?.value || '');
        this.validate();
        this.updateView();
        this.dispatchEvent('inputchange', {
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
        if (this.config.required && !validators.includes('required')) {
            validators.unshift('required');
        }

        for (let i = 0; i < validators.length; i += 1) {
            const validator = validators[i];
            const result = this.runValidator(validator, this.state.value);
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
        const token = String(validator || '').trim();
        const input = String(value || '');
        if (!token) return { valid: true, message: '' };

        if (token === 'required') {
            const valid = input.trim().length > 0;
            return { valid, message: valid ? '' : 'This field is required.' };
        }

        if (token.startsWith('minLength:')) {
            const min = Number(token.split(':')[1]);
            const valid = Number.isFinite(min) ? input.length >= min : true;
            return { valid, message: valid ? '' : `Minimum length is ${min}.` };
        }

        if (token.startsWith('maxLength:')) {
            const max = Number(token.split(':')[1]);
            const valid = Number.isFinite(max) ? input.length <= max : true;
            return { valid, message: valid ? '' : `Maximum length is ${max}.` };
        }

        if (token === 'email') {
            const valid = !input || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
            return { valid, message: valid ? '' : 'Enter a valid email address.' };
        }

        if (token.startsWith('pattern:')) {
            const source = token.slice('pattern:'.length).trim();
            try {
                const regex = new RegExp(source);
                const valid = regex.test(input);
                return { valid, message: valid ? '' : this.config.errorMessage };
            } catch (_error) {
                return { valid: true, message: '' };
            }
        }

        return { valid: true, message: '' };
    }

    updateView() {
        if (!this.element || !this.controlEl) return;
        this.element.classList.toggle('is-invalid', this.state.invalid);
        this.controlEl.setAttribute('aria-invalid', this.state.invalid ? 'true' : 'false');
        if (this.errorEl) {
            this.errorEl.hidden = !this.state.invalid;
            this.errorEl.textContent = this.state.invalid ? (this.state.errorMessage || this.config.errorMessage) : '';
        }
    }

    get value() {
        return this.controlEl?.value || '';
    }

    set value(nextValue) {
        const value = nextValue == null ? '' : String(nextValue);
        this.state.value = value;
        if (this.controlEl) this.controlEl.value = value;
        this.validate();
        this.updateView();
    }

    destroy() {
        if (this.controlEl) {
            this.controlEl.removeEventListener('input', this.boundInput);
            this.controlEl.removeEventListener('blur', this.boundBlur);
        }
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.InputComponent = InputComponent;
}

export { InputComponent };
