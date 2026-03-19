import { Component } from './component.js';

class FormComponent extends Component {
    static get selector() {
        return 'holi-form';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'form-shell';
    }

    static templateId = 'form-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = FormComponent.templateId;
        this.config = {
            endpoint: this.container.getAttribute('data-endpoint') || this.container.getAttribute('action') || '',
            method: (this.container.getAttribute('method') || 'post').toLowerCase(),
            submitLabel: this.container.getAttribute('data-submit-label') || 'Submit',
            resetLabel: this.container.getAttribute('data-reset-label') || 'Reset'
        };
        this.state = {
            submitError: '',
            submitting: false,
            formInvalid: false
        };
        this.boundSubmit = (event) => {
            void this.handleSubmit(event);
        };
        this.boundReset = () => this.handleReset();
        this.init();
    }

    init() {
        this.validateStructure();
        void this.render();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-form');
        this.errorEl = this.container.querySelector('[data-role="errors"]');
        this.submitBtn = this.container.querySelector('[data-role="submit"]');
        this.resetBtn = this.container.querySelector('[data-role="reset"]');

        this.projectSlot('fields');
        this.projectSlot('actions');
        this.projectSlot('errors');

        if (this.submitBtn) this.submitBtn.textContent = this.config.submitLabel;
        if (this.resetBtn) this.resetBtn.textContent = this.config.resetLabel;

        if (this.config.endpoint) this.element.setAttribute('action', this.config.endpoint);
        this.element.setAttribute('method', this.config.method);

        this.element.addEventListener('submit', this.boundSubmit);
        this.element.addEventListener('reset', this.boundReset);
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

    collectData() {
        const formData = new FormData(this.element);
        return Object.fromEntries(formData.entries());
    }

    validateChildren() {
        const hosts = this.element.querySelectorAll(
            'holi-input, [component="input-field"], [role="input-field"], holi-select, [component="select-field"], [role="select-field"], holi-checkbox, [component="checkbox-group"], [role="checkbox-group"], holi-radio, [component="radio-group"], [role="radio-group"]'
        );

        let valid = true;
        hosts.forEach((host) => {
            const instance = host.inputcomponent || host.selectcomponent || host.checkboxgroupcomponent || host.radiogroupcomponent;
            if (instance?.validate && instance.validate() === false) {
                valid = false;
            }
        });

        this.state.formInvalid = !this.element.checkValidity() || !valid;
        return !this.state.formInvalid;
    }

    setError(message) {
        this.state.submitError = message ? String(message) : '';
        if (this.errorEl) {
            this.errorEl.hidden = !this.state.submitError;
            this.errorEl.textContent = this.state.submitError;
        }
    }

    async handleSubmit(event) {
        event.preventDefault();
        if (!this.element) return;
        if (!this.validateChildren()) {
            this.setError('Please fix validation errors before submitting.');
            return;
        }

        this.setError('');
        const detail = { data: this.collectData() };
        const submitEvent = new CustomEvent('formsubmit', { detail, cancelable: true });
        const shouldContinue = this.element.dispatchEvent(submitEvent);
        if (!shouldContinue) return;

        if (!this.config.endpoint) return;

        this.state.submitting = true;
        try {
            const response = await fetch(this.config.endpoint, {
                method: this.config.method.toUpperCase(),
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(detail.data)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            let payload = null;
            try {
                payload = await response.json();
            } catch (_error) {}

            this.element.dispatchEvent(new CustomEvent('formsuccess', {
                detail: {
                    data: detail.data,
                    response: payload
                }
            }));
        } catch (error) {
            const message = 'Form submission failed.';
            this.setError(message);
            this.element.dispatchEvent(new CustomEvent('formerror', {
                detail: {
                    error: String(error?.message || error || message)
                }
            }));
        } finally {
            this.state.submitting = false;
        }
    }

    handleReset() {
        this.setError('');
        this.state.formInvalid = false;
        this.element?.dispatchEvent(new CustomEvent('formreset', { detail: {} }));
    }

    destroy() {
        this.element?.removeEventListener('submit', this.boundSubmit);
        this.element?.removeEventListener('reset', this.boundReset);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.FormComponent = FormComponent;
}

export { FormComponent };
