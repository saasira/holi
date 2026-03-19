import { DropdownComponent } from './dropdown.js';
import { copyAttributes, readNativeValue, serializeSelectOptions } from '../utils/native_host.js';

class SelectComponent extends DropdownComponent {
    static get selector() {
        return 'holi-select';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'select-field';
    }

    static templateId = 'select-field-template';

    static getNativeSelectors() {
        return [
            'select[component="select"]',
            'select[role="select"]',
            'select[component="select-field"]',
            'select[role="select-field"]'
        ];
    }

    static prepareHost(element) {
        if (!(element instanceof HTMLSelectElement)) return element;

        const host = document.createElement('section');
        copyAttributes(element, host, {
            exclude: ['component', 'role']
        });
        host.setAttribute('component', 'select-field');
        host.setAttribute('data-items', JSON.stringify(serializeSelectOptions(element)));
        host.setAttribute('value', readNativeValue(element));
        element.replaceWith(host);
        return host;
    }

    getBindingContext(extra = {}) {
        return super.getBindingContext({
            label: this.container?.getAttribute('label') || this.container?.getAttribute('data-label') || '',
            ...extra
        });
    }

    async render() {
        await super.render();
        if (!this.boundBlur) this.boundBlur = () => this.validate();
        this.fieldRoot = this.container.querySelector('.holi-select-field') || this.element;
        this.labelEl = this.container.querySelector('[data-role="label"]');
        this.errorEl = this.container.querySelector('[data-role="error"]');

        this.projectSlot('label');
        this.projectSlot('helper');
        this.projectSlot('error');

        this.applyFieldAttributes();
        this.input?.addEventListener('blur', this.boundBlur);
        this.validate();
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

    readBoolAttr(attrName, defaultValue) {
        return super.readBooleanAttr(attrName, defaultValue);
    }

    applyFieldAttributes() {
        const name = this.container.getAttribute('name') || this.container.getAttribute('data-name') || '';
        const required = this.readBoolAttr('required', false) || this.readBoolAttr('data-required', false);
        const requiredMessage = this.container.getAttribute('data-required-message') || 'Please select an option.';

        this.required = required;
        this.requiredMessage = requiredMessage;

        if (this.valueInput && name) this.valueInput.name = name;
        if (this.input) {
            this.input.required = required;
            this.input.setAttribute('aria-required', required ? 'true' : 'false');
        }

        const fieldId = this.input?.id || `holi-select-${Math.random().toString(16).slice(2)}`;
        if (this.input) this.input.id = fieldId;
        if (this.labelEl && !this.labelEl.getAttribute('for')) {
            this.labelEl.setAttribute('for', fieldId);
        }

        const defaultValue = this.container.getAttribute('value') || this.container.getAttribute('data-value');
        if (defaultValue) this.value = defaultValue;
    }

    validate() {
        const invalid = !!this.required && !this.value;
        if (this.fieldRoot) this.fieldRoot.classList.toggle('is-invalid', invalid);
        if (this.errorEl) {
            this.errorEl.hidden = !invalid;
            this.errorEl.textContent = invalid ? this.requiredMessage : '';
        }
        if (this.input) this.input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
        return !invalid;
    }

    selectItem(item) {
        super.selectItem(item);
        this.validate();
    }

    destroy() {
        this.input?.removeEventListener('blur', this.boundBlur);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.SelectComponent = SelectComponent;
}

export { SelectComponent };
