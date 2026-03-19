import { Component } from './component.js';
import { buildChoiceProjection, copyAttributes } from '../utils/native_host.js';

class CheckboxGroupComponent extends Component {
    static get selector() {
        return 'holi-checkbox';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'checkbox-group';
    }

    static templateId = 'checkbox-group-template';

    static getNativeSelectors() {
        return [
            'input[type="checkbox"][component="checkbox"]',
            'input[type="checkbox"][role="checkbox"]'
        ];
    }

    static prepareHost(element) {
        if (!(element instanceof HTMLInputElement) || element.type !== 'checkbox') {
            return element;
        }

        const host = document.createElement('section');
        copyAttributes(element, host, {
            exclude: ['component', 'role', 'type', 'checked', 'value']
        });
        host.setAttribute('component', 'checkbox-group');
        host.setAttribute('type', 'checkbox');

        const originalId = element.getAttribute('id');
        if (originalId) {
            host.setAttribute('id', originalId);
            element.removeAttribute('id');
        }

        const projectedOption = buildChoiceProjection(element);
        const replaceTarget = projectedOption === element.parentElement ? projectedOption : element;
        replaceTarget.replaceWith(host);
        if (projectedOption) host.appendChild(projectedOption);
        return host;
    }

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = CheckboxGroupComponent.templateId;
        this.config = {
            legend: this.container.getAttribute('legend') || '',
            name: this.container.getAttribute('name') || '',
            type: this.container.getAttribute('type') || 'checkbox',
            options: this.parseOptions(this.container.getAttribute('data-options'))
        };
        this.state = {
            legend: this.config.legend,
            name: this.config.name,
            type: this.config.type,
            options: this.config.options,
            values: []
        };
        this.boundChange = () => this.syncState();
        this.init();
    }

    parseOptions(raw) {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
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
        this.element = this.container.querySelector('.holi-checkbox-group');
        this.optionsHost = this.container.querySelector('[data-role="options"]');

        this.projectSlot('legend');
        this.projectSlot('options');
        this.projectSlot('actions');

        const hasProjectedOptions = this.optionsHost?.querySelector('input[type="checkbox"], input[type="radio"]');
        if (!hasProjectedOptions && this.config.options.length > 0) {
            this.renderConfiguredOptions();
        }

        this.applyNameToInputs();
        this.syncState();
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

    renderConfiguredOptions() {
        if (!this.optionsHost) return;
        const fragment = document.createDocumentFragment();

        this.config.options.forEach((item, index) => {
            const normalized = item && typeof item === 'object'
                ? item
                : { value: item, label: String(item) };
            const wrapper = document.createElement('label');
            wrapper.className = 'holi-checkbox-option';

            const input = document.createElement('input');
            input.type = this.config.type === 'radio' ? 'radio' : 'checkbox';
            input.value = normalized.value == null ? '' : String(normalized.value);
            input.checked = !!normalized.checked;
            input.name = this.config.name || `holi-checkbox-${index}`;

            const text = document.createElement('span');
            text.textContent = normalized.label == null ? String(normalized.value || '') : String(normalized.label);

            wrapper.append(input, text);
            fragment.appendChild(wrapper);
        });

        this.optionsHost.appendChild(fragment);
    }

    applyNameToInputs() {
        if (!this.optionsHost || !this.config.name) return;
        const inputs = this.optionsHost.querySelectorAll('input[type="checkbox"], input[type="radio"]');
        inputs.forEach((input) => {
            if (!input.name) input.name = this.config.name;
        });
    }

    syncState() {
        if (!this.optionsHost) return;
        const selected = Array.from(this.optionsHost.querySelectorAll('input[type="checkbox"], input[type="radio"]'))
            .filter((input) => input.checked)
            .map((input) => input.value);
        this.state.values = selected;
        this.dispatchEvent('checkboxchange', { values: [...this.state.values] });
    }

    get value() {
        return [...this.state.values];
    }

    validate() {
        return true;
    }

    destroy() {
        this.element?.removeEventListener('change', this.boundChange);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.CheckboxGroupComponent = CheckboxGroupComponent;
}

export { CheckboxGroupComponent };
