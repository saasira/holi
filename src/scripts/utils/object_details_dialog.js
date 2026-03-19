class ObjectDetailsDialog {
    constructor() {
        this.overlay = null;
        this.keyHandler = null;
    }

    open(options = {}) {
        const config = {
            title: 'Details',
            mode: 'view',
            fields: [],
            record: {},
            readonlyFields: [],
            onSave: null,
            ...options
        };

        this.close();

        const { fragment, overlay, header, body, footer } = this.createDialogScaffold();

        this.overlay = overlay;
        this.overlay.classList.add('holi-object-details-overlay');
        this.overlay.addEventListener('click', (event) => {
            if (event.target === this.overlay) this.close();
        });

        const fields = this.normalizeFields(config.fields, config.record, config.readonlyFields);
        let mode = this.normalizeMode(config.mode);
        let draft = this.clone(config.record || {});
        let saving = false;

        const render = () => {
            header.replaceChildren();
            body.replaceChildren();
            footer.replaceChildren();

            const titleEl = document.createElement('h2');
            titleEl.textContent = `${mode === 'add' ? 'Add' : mode === 'edit' ? 'Edit' : 'View'} ${config.title}`;
            header.appendChild(titleEl);

            const headerActions = document.createElement('div');
            headerActions.className = 'holi-object-details-header-actions';
            if (mode === 'view') {
                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'holi-object-details-btn';
                editBtn.textContent = 'Edit';
                editBtn.addEventListener('click', () => {
                    mode = 'edit';
                    render();
                });
                headerActions.appendChild(editBtn);
            }

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'holi-object-details-btn holi-object-details-btn-secondary';
            closeBtn.textContent = 'Close';
            closeBtn.addEventListener('click', () => this.close());
            headerActions.appendChild(closeBtn);
            header.appendChild(headerActions);

            if (mode === 'view') {
                fields.forEach((field) => {
                    const row = document.createElement('div');
                    row.className = 'holi-object-details-row';

                    const keyEl = document.createElement('strong');
                    keyEl.textContent = field.label;
                    const valueEl = document.createElement('span');
                    valueEl.textContent = this.stringifyValue(draft[field.name]);

                    row.append(keyEl, valueEl);
                    body.appendChild(row);
                });
                return;
            }

            const status = document.createElement('p');
            status.className = 'holi-object-details-status';
            body.appendChild(status);

            const fieldRefs = new Map();
            fields.forEach((field) => {
                const row = document.createElement('div');
                row.className = 'holi-object-details-field';

                const label = document.createElement('label');
                label.textContent = field.label;

                const control = this.createControl(field, draft[field.name]);
                control.disabled = !!field.readonly || saving;
                if (!field.readonly) {
                    control.addEventListener('input', () => {
                        draft[field.name] = this.readControlValue(control, field);
                        this.setFieldError(fieldRefs.get(field.name)?.errorEl, '');
                    });
                    control.addEventListener('change', () => {
                        draft[field.name] = this.readControlValue(control, field);
                        this.setFieldError(fieldRefs.get(field.name)?.errorEl, '');
                    });
                }

                const errorEl = document.createElement('p');
                errorEl.className = 'holi-object-details-field-error';

                row.append(label, control, errorEl);
                body.appendChild(row);
                fieldRefs.set(field.name, { field, control, errorEl });
            });

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'holi-object-details-btn holi-object-details-btn-secondary';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.disabled = saving;
            cancelBtn.addEventListener('click', () => {
                if (mode === 'add') {
                    this.close();
                    return;
                }
                draft = this.clone(config.record || {});
                mode = 'view';
                render();
            });
            footer.appendChild(cancelBtn);

            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'holi-object-details-btn';
            saveBtn.textContent = saving ? 'Saving...' : 'Save';
            saveBtn.disabled = saving;
            saveBtn.addEventListener('click', async () => {
                if (saving || typeof config.onSave !== 'function') return;
                const isValid = this.validateFields(fieldRefs, status);
                if (!isValid) return;

                saving = true;
                render();
                try {
                    const result = await Promise.resolve(config.onSave(this.clone(draft), mode));
                    if (result && typeof result === 'object') draft = this.clone(result);
                    mode = 'view';
                } finally {
                    saving = false;
                    render();
                }
            });
            footer.appendChild(saveBtn);
        };

        this.keyHandler = (event) => {
            if (event.key === 'Escape') this.close();
        };
        document.addEventListener('keydown', this.keyHandler);
        document.body.appendChild(fragment);
        render();
    }

    openLoading(options = {}) {
        const config = {
            title: 'Details',
            ...options
        };

        this.close();
        const { fragment, overlay, header, body } = this.createDialogScaffold();

        const titleEl = document.createElement('h2');
        titleEl.textContent = `Loading ${config.title}...`;
        header.appendChild(titleEl);

        const headerActions = document.createElement('div');
        headerActions.className = 'holi-object-details-header-actions';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'holi-object-details-btn holi-object-details-btn-secondary';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', () => this.close());
        headerActions.appendChild(closeBtn);
        header.appendChild(headerActions);

        const skeletonTemplate = document.getElementById('object-details-skeleton-template');
        if (skeletonTemplate && skeletonTemplate.content) {
            body.appendChild(skeletonTemplate.content.cloneNode(true));
        } else {
            const skeleton = document.createElement('div');
            skeleton.className = 'dg-skeleton';
            for (let i = 0; i < 4; i += 1) {
                const line = document.createElement('div');
                line.className = i === 0 ? 'sk-line sk-title' : 'sk-line';
                skeleton.appendChild(line);
            }
            body.appendChild(skeleton);
        }

        this.keyHandler = (event) => {
            if (event.key === 'Escape') this.close();
        };
        document.addEventListener('keydown', this.keyHandler);
        document.body.appendChild(fragment);
    }

    close() {
        if (this.keyHandler) {
            document.removeEventListener('keydown', this.keyHandler);
            this.keyHandler = null;
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    createDialogScaffold() {
        const template = document.getElementById('object-details-template');
        if (!template || !template.content) {
            throw new Error('Template "object-details-template" not found');
        }

        const fragment = template.content.cloneNode(true);
        const overlay = fragment.querySelector('.dialog-overlay');
        const header = fragment.querySelector('.dialog-header');
        const body = fragment.querySelector('.dialog-body');
        const footer = fragment.querySelector('.dialog-footer');
        if (!overlay || !header || !body || !footer) {
            throw new Error('object-details-template has invalid structure');
        }

        this.overlay = overlay;
        this.overlay.classList.add('holi-object-details-overlay');
        this.overlay.addEventListener('click', (event) => {
            if (event.target === this.overlay) this.close();
        });

        return { fragment, overlay, header, body, footer };
    }

    normalizeMode(mode) {
        const value = String(mode || 'view').trim().toLowerCase();
        if (value === 'add' || value === 'edit' || value === 'view') return value;
        return 'view';
    }

    normalizeFields(fields, record, readonlyFields) {
        const readonlySet = new Set((readonlyFields || []).map((v) => String(v)));
        const map = new Map();

        (fields || []).forEach((field) => {
            const name = String(field?.name || '').trim();
            if (!name || map.has(name)) return;
            map.set(name, this.normalizeField(field, record?.[name], readonlySet));
        });

        Object.keys(record || {}).forEach((name) => {
            if (map.has(name)) return;
            map.set(name, this.normalizeField({ name, label: name }, record?.[name], readonlySet));
        });

        return Array.from(map.values());
    }

    normalizeField(field, currentValue, readonlySet) {
        const constraints = field?.constraints && typeof field.constraints === 'object' ? field.constraints : {};
        const required = this.resolveRequired(field, constraints);
        const options = this.normalizeOptions(field?.lov || field?.options || constraints.lov);
        const typeRaw = field?.formFieldType || field?.type || constraints.type || this.inferType(currentValue);
        const type = this.normalizeFieldType(typeRaw, options);

        return {
            name: String(field?.name || ''),
            label: String(field?.label || field?.name || ''),
            type,
            required,
            readonly: !!field?.readonly || readonlySet.has(String(field?.name || '')),
            min: this.resolveConstraint(field, constraints, 'min'),
            max: this.resolveConstraint(field, constraints, 'max'),
            step: this.resolveConstraint(field, constraints, 'step'),
            minLength: this.resolveConstraint(field, constraints, 'minLength'),
            maxLength: this.resolveConstraint(field, constraints, 'maxLength'),
            pattern: this.resolveConstraint(field, constraints, 'pattern'),
            placeholder: String(field?.placeholder || constraints.placeholder || ''),
            options
        };
    }

    resolveRequired(field, constraints) {
        if (typeof field?.required === 'boolean') return field.required;
        if (typeof constraints?.required === 'boolean') return constraints.required;
        if (field?.optional === true || constraints?.optional === true) return false;
        return false;
    }

    resolveConstraint(field, constraints, key) {
        if (field?.[key] != null) return field[key];
        if (constraints?.[key] != null) return constraints[key];
        if (key === 'min' && Array.isArray(constraints?.range)) return constraints.range[0];
        if (key === 'max' && Array.isArray(constraints?.range)) return constraints.range[1];
        return null;
    }

    normalizeFieldType(type, options) {
        const value = String(type || 'text').trim().toLowerCase();
        if (options.length && (value === 'select' || value === 'lov' || value === 'text')) return 'select';
        if (value === 'textarea') return 'textarea';
        if (value === 'checkbox' || value === 'boolean') return 'boolean';
        if (value === 'number' || value === 'range') return 'number';
        if (value === 'date' || value === 'datetime-local' || value === 'time' || value === 'email' || value === 'url') {
            return value;
        }
        return 'text';
    }

    normalizeOptions(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.map((option) => {
            if (option && typeof option === 'object') {
                return {
                    value: option.value != null ? option.value : option.id,
                    label: option.label != null ? option.label : option.value
                };
            }
            return { value: option, label: option };
        }).filter((option) => option.value != null);
    }

    inferType(value) {
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        return 'text';
    }

    createControl(field, value) {
        if (field.type === 'select') {
            const select = document.createElement('select');
            if (!field.required) {
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.textContent = '-- Select --';
                select.appendChild(placeholder);
            }
            field.options.forEach((option) => {
                const opt = document.createElement('option');
                opt.value = option.value == null ? '' : String(option.value);
                opt.textContent = option.label == null ? '' : String(option.label);
                select.appendChild(opt);
            });
            select.value = value == null ? '' : String(value);
            this.applyControlConstraints(select, field);
            return select;
        }

        if (field.type === 'textarea') {
            const textarea = document.createElement('textarea');
            textarea.value = value == null ? '' : String(value);
            this.applyControlConstraints(textarea, field);
            return textarea;
        }

        const input = document.createElement('input');
        if (field.type === 'boolean') {
            input.type = 'checkbox';
            input.checked = !!value;
        } else {
            input.type = field.type === 'number' ? 'number' : field.type;
            input.value = value == null ? '' : String(value);
        }
        this.applyControlConstraints(input, field);
        return input;
    }

    applyControlConstraints(control, field) {
        if (field.required) control.required = true;
        if (field.placeholder && 'placeholder' in control) control.placeholder = field.placeholder;
        if (field.min != null && 'min' in control) control.min = String(field.min);
        if (field.max != null && 'max' in control) control.max = String(field.max);
        if (field.step != null && 'step' in control) control.step = String(field.step);
        if (field.minLength != null && 'minLength' in control) control.minLength = Number(field.minLength);
        if (field.maxLength != null && 'maxLength' in control) control.maxLength = Number(field.maxLength);
        if (field.pattern && 'pattern' in control && field.type !== 'select') control.pattern = String(field.pattern);
    }

    readControlValue(control, field) {
        if (field.type === 'boolean') return !!control.checked;
        if (field.type === 'number') {
            const text = String(control.value || '').trim();
            if (!text) return null;
            const parsed = Number(text);
            return Number.isNaN(parsed) ? null : parsed;
        }
        return control.value;
    }

    validateFields(fieldRefs, statusEl) {
        let valid = true;
        fieldRefs.forEach(({ field, control, errorEl }) => {
            this.setFieldError(errorEl, '');
            if (field.readonly) return;

            const value = this.readControlValue(control, field);
            if (field.required) {
                const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
                if (empty) {
                    valid = false;
                    this.setFieldError(errorEl, `${field.label} is required.`);
                    return;
                }
            }

            if (!control.checkValidity()) {
                valid = false;
                this.setFieldError(errorEl, control.validationMessage || `Invalid value for ${field.label}.`);
            }
        });

        if (statusEl) {
            statusEl.textContent = valid ? '' : 'Please fix validation errors before saving.';
        }
        return valid;
    }

    setFieldError(errorEl, message) {
        if (!errorEl) return;
        errorEl.textContent = String(message || '');
    }

    stringifyValue(value) {
        if (value == null) return '';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return String(value);
    }

    clone(value) {
        return JSON.parse(JSON.stringify(value == null ? {} : value));
    }
}

export { ObjectDetailsDialog };
