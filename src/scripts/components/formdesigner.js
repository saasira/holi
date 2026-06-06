import { Component } from './component.js';
import { TemplateRegistry } from '../utils/template_registry.js';
import { evaluateHoliCondition, getConditionFields } from '../utils/form_conditions.js';

const FIELD_TYPES_WITH_OPTIONS = new Set(['select', 'radio', 'checkbox']);

class FormDesignerComponent extends Component {
    static get selector() {
        return 'formdesigner, holi-formdesigner, form-designer';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'formdesigner';
    }

    static templateId = 'formdesigner-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = FormDesignerComponent.templateId;
        this.definitionEndpoint = this.container.getAttribute('data-endpoint') || '';
        this.submitEndpoint = this.container.getAttribute('data-submit-endpoint') || '';
        this.selected = { type: 'section', sectionId: '', fieldId: '' };
        this.previewValues = {};
        this.definition = this.createEmptyDefinition();
        this.boundClick = (event) => this.handleClick(event);
        this.boundInspectInput = (event) => this.handleInspectInput(event);
        this.boundPreviewInput = () => this.handlePreviewInput();
        this.boundPreviewSubmit = (event) => {
            event.preventDefault();
            void this.handlePreviewSubmit();
        };
        this.init();
    }

    async init() {
        this.validateStructure();
        await this.loadInitialDefinition();
        await this.render();
    }

    createEmptyDefinition() {
        return {
            schemaVersion: 'holi-formdesigner/v1',
            id: this.container.getAttribute('data-form-id') || 'application_form',
            title: this.container.getAttribute('data-title') || 'Application Form',
            sections: [
                {
                    id: 'section_1',
                    label: 'Clinical Details',
                    description: '',
                    displayed: '',
                    fields: [
                        {
                            id: 'field_1',
                            name: 'disease',
                            label: 'Disease',
                            type: 'select',
                            required: true,
                            displayed: '',
                            fieldset: '',
                            placeholder: '',
                            helpText: '',
                            options: [
                                { value: 'diabetes', label: 'Diabetes' },
                                { value: 'hypertension', label: 'Hypertension' }
                            ]
                        },
                        {
                            id: 'field_2',
                            name: 'diabetes_type',
                            label: 'Type',
                            type: 'select',
                            required: false,
                            displayed: "@{disease eq 'diabetes'}",
                            fieldset: '',
                            placeholder: '',
                            helpText: '',
                            options: [
                                { value: 'type_i', label: 'Type I' },
                                { value: 'type_ii', label: 'Type II' }
                            ]
                        }
                    ]
                }
            ]
        };
    }

    async loadInitialDefinition() {
        const source = this.container.getAttribute('data-source') || '';
        const inline = this.container.getAttribute('data-definition') || '';
        let payload = null;

        if (inline.trim()) {
            payload = this.parseJson(inline);
        } else if (source.trim()) {
            payload = await this.fetchDefinition(source);
        }

        if (payload) {
            this.definition = this.normalizeDefinition(payload);
        } else {
            this.definition = this.normalizeDefinition(this.definition);
        }
        this.ensureSelection();
    }

    async fetchDefinition(source) {
        const value = String(source || '').trim();
        if (!value) return null;
        if (value.startsWith('{')) return this.parseJson(value);
        try {
            const response = await fetch(value, { credentials: 'same-origin' });
            if (!response.ok) return null;
            return await response.json();
        } catch (_error) {
            return null;
        }
    }

    parseJson(raw) {
        try {
            return JSON.parse(String(raw || ''));
        } catch (_error) {
            return null;
        }
    }

    normalizeDefinition(definition = {}) {
        const sections = Array.isArray(definition.sections) ? definition.sections : [];
        return {
            schemaVersion: definition.schemaVersion || 'holi-formdesigner/v1',
            id: definition.id || 'application_form',
            title: definition.title || 'Application Form',
            sections: sections.map((section, sectionIndex) => ({
                id: String(section.id || `section_${sectionIndex + 1}`),
                label: String(section.label || `Section ${sectionIndex + 1}`),
                description: String(section.description || ''),
                displayed: String(section.displayed || ''),
                dependsOn: Array.isArray(section.dependsOn) ? section.dependsOn : getConditionFields(section.displayed || ''),
                fields: (Array.isArray(section.fields) ? section.fields : []).map((field, fieldIndex) => this.normalizeField(field, fieldIndex))
            }))
        };
    }

    normalizeField(field = {}, index = 0) {
        const name = String(field.name || field.id || `field_${index + 1}`).trim();
        return {
            id: String(field.id || name || `field_${index + 1}`),
            name,
            label: String(field.label || name || `Field ${index + 1}`),
            type: String(field.type || 'text').toLowerCase(),
            fieldset: String(field.fieldset || ''),
            required: !!field.required,
            placeholder: String(field.placeholder || ''),
            helpText: String(field.helpText || field.description || ''),
            displayed: String(field.displayed || ''),
            dependsOn: Array.isArray(field.dependsOn) ? field.dependsOn : getConditionFields(field.displayed || ''),
            options: this.normalizeOptions(field.options)
        };
    }

    normalizeOptions(options = []) {
        if (!Array.isArray(options)) return [];
        return options.map((option, index) => {
            if (option && typeof option === 'object') {
                const value = option.value == null ? option.label : option.value;
                return {
                    value: String(value == null ? index : value),
                    label: String(option.label == null ? value : option.label)
                };
            }
            return { value: String(option), label: String(option) };
        });
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-formdesigner');
        this.sectionsEl = this.container.querySelector('[data-role="sections"]');
        this.inspectorEl = this.container.querySelector('[data-role="inspector"]');
        this.definitionJsonEl = this.container.querySelector('[data-role="definition-json"]');
        this.filledJsonEl = this.container.querySelector('[data-role="filled-json"]');
        this.previewEl = this.container.querySelector('[data-role="preview"]');

        this.projectSlot('title');
        this.projectSlot('summary');
        this.projectSlot('actions');

        this.element.addEventListener('click', this.boundClick);
        this.inspectorEl.addEventListener('input', this.boundInspectInput);
        this.inspectorEl.addEventListener('change', this.boundInspectInput);
        this.previewEl.addEventListener('input', this.boundPreviewInput);
        this.previewEl.addEventListener('change', this.boundPreviewInput);
        this.previewEl.addEventListener('submit', this.boundPreviewSubmit);

        this.renderAll();
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

    renderAll() {
        this.ensureSelection();
        this.renderStructure();
        this.renderInspector();
        this.renderDefinitionJson();
        this.renderPreview();
    }

    ensureSelection() {
        const firstSection = this.definition.sections[0];
        if (!firstSection) {
            this.selected = { type: '', sectionId: '', fieldId: '' };
            return;
        }

        const selectedSection = this.getSelectedSection();
        if (this.selected.type === 'field') {
            const field = this.getSelectedField();
            if (selectedSection && field) return;
        } else if (selectedSection) {
            return;
        }

        this.selected = { type: 'section', sectionId: firstSection.id, fieldId: '' };
    }

    renderStructure() {
        const fragment = document.createDocumentFragment();
        this.definition.sections.forEach((section) => {
            const node = this.cloneTemplate('formdesigner-section-template');
            const item = node.querySelector('[data-role="section-item"]');
            const button = node.querySelector('[data-action="select-section"]');
            const label = node.querySelector('[data-role="label"]');
            const condition = node.querySelector('[data-role="condition"]');
            const fields = node.querySelector('[data-role="field-list"]');

            item.dataset.sectionId = section.id;
            button.dataset.sectionId = section.id;
            item.classList.toggle('is-selected', this.selected.type === 'section' && this.selected.sectionId === section.id);
            label.textContent = section.label;
            condition.textContent = section.displayed ? section.displayed : 'Always displayed';

            section.fields.forEach((field) => {
                const fieldNode = this.cloneTemplate('formdesigner-field-template');
                const fieldButton = fieldNode.querySelector('[data-action="select-field"]');
                fieldButton.dataset.sectionId = section.id;
                fieldButton.dataset.fieldId = field.id;
                fieldButton.classList.toggle('is-selected', this.selected.type === 'field' && this.selected.fieldId === field.id);
                fieldNode.querySelector('[data-role="label"]').textContent = field.label;
                fieldNode.querySelector('[data-role="type"]').textContent = field.type;
                fields.appendChild(fieldNode);
            });

            fragment.appendChild(node);
        });
        this.sectionsEl.replaceChildren(fragment);
    }

    renderInspector() {
        const target = this.selected.type === 'field' ? this.getSelectedField() : this.getSelectedSection();
        const isField = this.selected.type === 'field';
        this.inspectorEl.querySelectorAll('[data-inspect]').forEach((control) => {
            const key = control.getAttribute('data-inspect');
            if (key === 'options') {
                control.value = this.optionsToText(target?.options || []);
                return;
            }
            if (control.type === 'checkbox') {
                control.checked = !!target?.[key];
                return;
            }
            control.value = target?.[key] == null ? '' : String(target[key]);
        });

        this.setInspectorRowState('field-type-row', isField);
        this.setInspectorRowState('fieldset-row', isField);
        this.setInspectorRowState('placeholder-row', isField);
        this.setInspectorRowState('required-row', isField);
        this.setInspectorRowState('options-row', isField && FIELD_TYPES_WITH_OPTIONS.has(String(target?.type || '')));
    }

    setInspectorRowState(role, visible) {
        const row = this.inspectorEl.querySelector(`[data-role="${role}"]`);
        if (row) row.hidden = !visible;
    }

    renderDefinitionJson() {
        this.refreshDependencies();
        if (this.definitionJsonEl) {
            this.definitionJsonEl.value = JSON.stringify(this.definition, null, 2);
        }
    }

    renderPreview() {
        const fragment = document.createDocumentFragment();
        const visible = this.getVisibleTree();

        visible.sections.forEach((section) => {
            const sectionNode = this.cloneTemplate('formdesigner-preview-section-template');
            sectionNode.querySelector('[data-role="label"]').textContent = section.label;
            const description = sectionNode.querySelector('[data-role="description"]');
            description.textContent = section.description || '';
            description.hidden = !section.description;
            const fieldsEl = sectionNode.querySelector('[data-role="fields"]');

            section.fields.forEach((field) => {
                fieldsEl.appendChild(this.createPreviewField(field));
            });

            fragment.appendChild(sectionNode);
        });

        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.textContent = 'Submit Preview';
        fragment.appendChild(submit);
        this.previewEl.replaceChildren(fragment);
        this.renderFilledJson();
    }

    createPreviewField(field) {
        if (field.type === 'textarea') return this.createTextareaField(field);
        if (field.type === 'select') return this.createSelectField(field);
        if (field.type === 'radio' || field.type === 'checkbox') return this.createChoiceField(field);
        return this.createInputField(field);
    }

    createInputField(field) {
        const node = this.cloneTemplate('formdesigner-preview-field-template');
        const input = node.querySelector('[data-role="control"]');
        this.applyControlAttrs(input, field);
        input.type = field.type || 'text';
        input.value = this.previewValues[field.name] == null ? '' : String(this.previewValues[field.name]);
        this.applyPreviewText(node, field);
        return node;
    }

    createTextareaField(field) {
        const node = this.cloneTemplate('formdesigner-preview-textarea-template');
        const input = node.querySelector('[data-role="control"]');
        this.applyControlAttrs(input, field);
        input.value = this.previewValues[field.name] == null ? '' : String(this.previewValues[field.name]);
        this.applyPreviewText(node, field);
        return node;
    }

    createSelectField(field) {
        const node = this.cloneTemplate('formdesigner-preview-select-template');
        const input = node.querySelector('[data-role="control"]');
        this.applyControlAttrs(input, field);
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = '';
        input.appendChild(blank);
        field.options.forEach((option) => {
            const optionEl = document.createElement('option');
            optionEl.value = option.value;
            optionEl.textContent = option.label;
            optionEl.selected = String(this.previewValues[field.name] ?? '') === option.value;
            input.appendChild(optionEl);
        });
        this.applyPreviewText(node, field);
        return node;
    }

    createChoiceField(field) {
        const node = this.cloneTemplate('formdesigner-preview-choice-template');
        const optionsEl = node.querySelector('[data-role="options"]');
        const current = this.previewValues[field.name];
        const selectedValues = Array.isArray(current) ? current : [current];
        field.options.forEach((option) => {
            const optionNode = this.cloneTemplate('formdesigner-preview-option-template');
            const input = optionNode.querySelector('[data-role="control"]');
            input.type = field.type;
            input.name = field.name;
            input.value = option.value;
            input.checked = selectedValues.map(String).includes(option.value);
            input.required = !!field.required && field.type === 'radio';
            optionNode.querySelector('[data-role="label"]').textContent = option.label;
            optionsEl.appendChild(optionNode);
        });
        this.applyPreviewText(node, field);
        return node;
    }

    applyControlAttrs(control, field) {
        control.name = field.name;
        control.required = !!field.required;
        if (field.placeholder && 'placeholder' in control) control.placeholder = field.placeholder;
    }

    applyPreviewText(node, field) {
        const label = node.querySelector('[data-role="label"]');
        const help = node.querySelector('[data-role="help"]');
        if (label) label.textContent = field.label;
        if (help) {
            help.textContent = field.helpText || '';
            help.hidden = !field.helpText;
        }
    }

    renderFilledJson() {
        if (!this.filledJsonEl) return;
        this.filledJsonEl.value = JSON.stringify(this.createFilledPayload(), null, 2);
    }

    handleClick(event) {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl || !this.element.contains(actionEl)) return;
        const action = actionEl.getAttribute('data-action');

        if (action === 'select-section') {
            this.selected = { type: 'section', sectionId: actionEl.dataset.sectionId, fieldId: '' };
            this.renderAll();
            return;
        }
        if (action === 'select-field') {
            this.selected = {
                type: 'field',
                sectionId: actionEl.dataset.sectionId,
                fieldId: actionEl.dataset.fieldId
            };
            this.renderAll();
            return;
        }
        if (action === 'add-section') this.addSection();
        if (action === 'add-field') this.addField();
        if (action === 'duplicate') this.duplicateSelected();
        if (action === 'remove') this.removeSelected();
        if (action === 'export-json') this.exportDefinition();
        if (action === 'save-definition') void this.saveDefinition();
    }

    handleInspectInput(event) {
        const control = event.target.closest('[data-inspect]');
        if (!control) return;
        const target = this.selected.type === 'field' ? this.getSelectedField() : this.getSelectedSection();
        if (!target) return;
        const key = control.getAttribute('data-inspect');
        let value = control.type === 'checkbox' ? control.checked : control.value;

        if (key === 'options') {
            target.options = this.textToOptions(value);
        } else {
            target[key] = value;
        }

        if (key === 'id' && this.selected.type === 'section') this.selected.sectionId = String(value || target.id);
        if (key === 'id' && this.selected.type === 'field') this.selected.fieldId = String(value || target.id);
        if (key === 'name' && this.selected.type === 'field' && !target.id) target.id = String(value || target.id);

        this.renderAll();
    }

    handlePreviewInput() {
        this.previewValues = this.collectPreviewValues();
        this.renderPreview();
    }

    async handlePreviewSubmit() {
        const payload = this.createFilledPayload();
        const submitEvent = new CustomEvent('formdesignersubmit', { detail: payload, cancelable: true });
        const shouldContinue = this.element.dispatchEvent(submitEvent);
        if (!shouldContinue || !this.submitEndpoint) return;

        await fetch(this.submitEndpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    addSection() {
        const id = this.nextId('section');
        this.definition.sections.push({
            id,
            label: `Section ${this.definition.sections.length + 1}`,
            description: '',
            displayed: '',
            dependsOn: [],
            fields: []
        });
        this.selected = { type: 'section', sectionId: id, fieldId: '' };
        this.renderAll();
    }

    addField() {
        const section = this.getSelectedSection() || this.definition.sections[0];
        if (!section) return;
        const id = this.nextId('field');
        const field = this.normalizeField({
            id,
            name: id,
            label: `Field ${section.fields.length + 1}`,
            type: 'text'
        }, section.fields.length);
        section.fields.push(field);
        this.selected = { type: 'field', sectionId: section.id, fieldId: field.id };
        this.renderAll();
    }

    duplicateSelected() {
        if (this.selected.type === 'field') {
            const section = this.getSelectedSection();
            const field = this.getSelectedField();
            if (!section || !field) return;
            const copy = this.normalizeField(JSON.parse(JSON.stringify(field)), section.fields.length);
            copy.id = this.nextId('field');
            copy.name = copy.id;
            copy.label = `${field.label} Copy`;
            section.fields.push(copy);
            this.selected = { type: 'field', sectionId: section.id, fieldId: copy.id };
        } else {
            const section = this.getSelectedSection();
            if (!section) return;
            const copy = JSON.parse(JSON.stringify(section));
            copy.id = this.nextId('section');
            copy.label = `${section.label} Copy`;
            this.definition.sections.push(copy);
            this.selected = { type: 'section', sectionId: copy.id, fieldId: '' };
        }
        this.renderAll();
    }

    removeSelected() {
        if (this.selected.type === 'field') {
            const section = this.getSelectedSection();
            if (!section) return;
            section.fields = section.fields.filter((field) => field.id !== this.selected.fieldId);
        } else {
            this.definition.sections = this.definition.sections.filter((section) => section.id !== this.selected.sectionId);
        }
        this.ensureSelection();
        this.renderAll();
    }

    exportDefinition() {
        const detail = { definition: this.definition };
        this.element.dispatchEvent(new CustomEvent('formdesignerexport', { detail }));
        this.renderDefinitionJson();
    }

    async saveDefinition() {
        const detail = { definition: this.definition };
        const saveEvent = new CustomEvent('formdesignersave', { detail, cancelable: true });
        const shouldContinue = this.element.dispatchEvent(saveEvent);
        if (!shouldContinue || !this.definitionEndpoint) return;

        await fetch(this.definitionEndpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.definition)
        });
    }

    getVisibleTree() {
        const context = { ...this.previewValues };
        const sections = [];
        this.definition.sections.forEach((section) => {
            const sectionVisible = evaluateHoliCondition(section.displayed, context);
            if (!sectionVisible) return;
            const fields = [];
            section.fields.forEach((field) => {
                if (evaluateHoliCondition(field.displayed, context)) fields.push(field);
            });
            sections.push({ ...section, fields });
        });
        return { sections };
    }

    createFilledPayload() {
        const values = { ...this.previewValues };
        const sections = [];

        this.definition.sections.forEach((section) => {
            const matched = evaluateHoliCondition(section.displayed, values);
            if (!matched) return;
            const fields = section.fields
                .filter((field) => evaluateHoliCondition(field.displayed, values))
                .map((field) => ({
                    id: field.id,
                    name: field.name,
                    label: field.label,
                    value: values[field.name],
                    displayed: field.displayed,
                    matched: true,
                    dependsOn: field.dependsOn || []
                }));
            sections.push({
                id: section.id,
                label: section.label,
                displayed: section.displayed,
                matched: true,
                dependsOn: section.dependsOn || [],
                fields
            });
        });

        return {
            schemaVersion: 'holi-filled-form/v1',
            formId: this.definition.id,
            formTitle: this.definition.title,
            values,
            traversal: { sections }
        };
    }

    collectPreviewValues() {
        const formData = new FormData(this.previewEl);
        const values = {};
        formData.forEach((value, key) => {
            if (Object.prototype.hasOwnProperty.call(values, key)) {
                values[key] = Array.isArray(values[key]) ? [...values[key], value] : [values[key], value];
            } else {
                values[key] = value;
            }
        });
        return values;
    }

    refreshDependencies() {
        this.definition.sections.forEach((section) => {
            section.dependsOn = getConditionFields(section.displayed || '');
            section.fields.forEach((field) => {
                field.dependsOn = getConditionFields(field.displayed || '');
            });
        });
    }

    optionsToText(options = []) {
        return options.map((option) => `${option.value}|${option.label}`).join('\n');
    }

    textToOptions(text = '') {
        return String(text || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const separator = line.indexOf('|');
                if (separator < 0) return { value: line, label: line };
                return {
                    value: line.slice(0, separator).trim(),
                    label: line.slice(separator + 1).trim()
                };
            });
    }

    getSelectedSection() {
        return this.definition.sections.find((section) => section.id === this.selected.sectionId) || null;
    }

    getSelectedField() {
        const section = this.getSelectedSection();
        return section?.fields.find((field) => field.id === this.selected.fieldId) || null;
    }

    nextId(prefix) {
        const existing = new Set();
        this.definition.sections.forEach((section) => {
            existing.add(section.id);
            section.fields.forEach((field) => existing.add(field.id));
        });
        let index = 1;
        let candidate = `${prefix}_${index}`;
        while (existing.has(candidate)) {
            index += 1;
            candidate = `${prefix}_${index}`;
        }
        return candidate;
    }

    cloneTemplate(id) {
        const template = TemplateRegistry.getTemplate(id);
        if (!(template instanceof HTMLTemplateElement)) {
            throw new Error(`Template "${id}" not found`);
        }
        return template.content.cloneNode(true);
    }

    destroy() {
        this.element?.removeEventListener('click', this.boundClick);
        this.inspectorEl?.removeEventListener('input', this.boundInspectInput);
        this.inspectorEl?.removeEventListener('change', this.boundInspectInput);
        this.previewEl?.removeEventListener('input', this.boundPreviewInput);
        this.previewEl?.removeEventListener('change', this.boundPreviewInput);
        this.previewEl?.removeEventListener('submit', this.boundPreviewSubmit);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.FormDesignerComponent = FormDesignerComponent;
}

export { FormDesignerComponent };
