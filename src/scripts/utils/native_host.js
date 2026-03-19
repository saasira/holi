function toCamelCase(value) {
    return String(value || '')
        .replace(/[-_\s]+(.)?/g, (_match, ch) => (ch ? ch.toUpperCase() : ''))
        .replace(/^(.)/, (match) => match.toLowerCase());
}

function copyAttributes(source, target, options = {}) {
    if (!(source instanceof Element) || !(target instanceof Element)) return;
    const exclude = new Set((options.exclude || []).map((name) => String(name || '').toLowerCase()));
    Array.from(source.attributes || []).forEach((attr) => {
        const name = String(attr.name || '').toLowerCase();
        if (!name || exclude.has(name)) return;
        target.setAttribute(attr.name, attr.value);
    });
}

function readNativeValue(element) {
    if (element instanceof HTMLTextAreaElement) {
        return element.value || element.textContent || '';
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
        return element.value || '';
    }
    return element?.getAttribute?.('value') || '';
}

function serializeSelectOptions(select) {
    if (!(select instanceof HTMLSelectElement)) return [];
    return Array.from(select.options || []).map((option) => {
        const item = {
            value: option.value == null ? '' : String(option.value),
            label: String(option.textContent || option.label || option.value || '')
        };

        Array.from(option.attributes || []).forEach((attr) => {
            const name = String(attr.name || '').toLowerCase();
            if (!name || name === 'value' || name === 'label' || name === 'selected') return;
            if (name.startsWith('data-')) {
                item[toCamelCase(name.slice(5))] = attr.value;
                return;
            }
            item[name] = attr.value === '' ? true : attr.value;
        });

        if (option.disabled) item.disabled = true;
        return item;
    });
}

function findStandaloneLabel(element) {
    if (!(element instanceof Element)) return null;
    const id = String(element.getAttribute('id') || '').trim();
    if (!id) return null;
    const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(id)
        : id.replace(/"/g, '\\"');
    return document.querySelector(`label[for="${escaped}"]`);
}

function buildChoiceProjection(input) {
    if (!(input instanceof HTMLInputElement)) return null;

    const parentLabel = input.parentElement?.tagName?.toLowerCase() === 'label'
        ? input.parentElement
        : null;
    if (parentLabel) {
        parentLabel.setAttribute('slot', 'options');
        return parentLabel;
    }

    const standaloneLabel = findStandaloneLabel(input);
    const wrapper = document.createElement('label');
    wrapper.className = 'holi-native-choice';
    wrapper.setAttribute('slot', 'options');
    wrapper.appendChild(input);

    const text = String(
        standaloneLabel?.textContent
        || input.getAttribute('label')
        || input.getAttribute('aria-label')
        || input.value
        || ''
    ).trim();
    if (text) {
        const span = document.createElement('span');
        span.textContent = text;
        wrapper.appendChild(span);
    }

    standaloneLabel?.remove?.();
    return wrapper;
}

export {
    buildChoiceProjection,
    copyAttributes,
    readNativeValue,
    serializeSelectOptions
};
