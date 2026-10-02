import { Component } from './component.js';
import { TreeComponent } from './tree.js';

/**
 * A value picker that browses a hierarchy in a modal and returns the selected node. It composes the
 * {@link TreeComponent} (lazy children via a {@code children-loader}) inside a lightweight dialog: the
 * trigger shows the current value, "Browse…" opens the tree, and confirming a selection sets the value,
 * updates a hidden input (for form use), and fires a {@code browserchange} event.
 *
 * Generic by design — the {@code children-loader} decides what is browsed (JCR paths, a model list, a
 * taxonomy…), so the same component serves path / model / reference pickers by swapping the loader.
 *
 * Attributes (each also accepted with a {@code data-} prefix):
 *   children-loader  name of a window function: ({id, item, tree}) => Promise<[{id,label,lazy}]>
 *   value            initial selected value (the node id/path)
 *   label            initial display label (defaults to value)
 *   placeholder      shown when there is no value
 *   title            dialog title
 *   root-id          id passed to the loader for the top level (default '/')
 *   root-label       label of the root node (default 'root')
 *   name             hidden-input name, so the picker works inside a form
 *   leaf-only        when present, only non-expandable (leaf) nodes may be selected
 */
class BrowserComponent extends Component {
    static get selector() { return 'browser'; }
    static get library() { return 'holi'; }
    static get componentName() { return 'browser'; }
    static templateId = 'browser-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = BrowserComponent.templateId;
        this.loaderName = this.attr('children-loader') || '';
        this.placeholder = this.attr('placeholder') || 'Nothing selected';
        this.titleText = this.attr('title') || 'Select';
        this.rootId = this.attr('root-id') || '/';
        this.rootLabel = this.attr('root-label') || 'root';
        this.fieldName = this.attr('name') || '';
        this.leafOnly = this.container.hasAttribute('leaf-only') || this.container.hasAttribute('data-leaf-only');
        this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
        this.value = this.attr('value') || '';
        this.labelText = this.attr('label') || this.value;
        this.pending = null;
        this.tree = null;
        this.init();
    }

    attr(name) {
        return this.container.getAttribute(name) || this.container.getAttribute(`data-${name}`);
    }

    async init() {
        await this.render();
        this.element = this.container.querySelector('.holi-browser');
        this.valueEl = this.container.querySelector('[data-role="value"]');
        this.input = this.container.querySelector('[data-role="input"]');
        this.overlay = this.container.querySelector('[data-role="overlay"]');
        this.treeHost = this.container.querySelector('[data-role="tree-host"]');
        this.selectionEl = this.container.querySelector('[data-role="selection"]');
        this.confirmBtn = this.container.querySelector('[data-role="confirm"]');
        if (this.fieldName && this.input) this.input.name = this.fieldName;
        const titleEl = this.container.querySelector('[data-role="title"]');
        if (titleEl) titleEl.textContent = this.titleText;
        this.applyValue(this.value, this.labelText);
        this.bindEvents();
    }

    bindEvents() {
        if (!this.element) return;
        this.element.addEventListener('click', (event) => {
            const role = event.target.closest('[data-role]')?.getAttribute('data-role');
            if (role === 'open') { event.preventDefault(); this.openBrowser(); }
            else if (role === 'clear') { event.preventDefault(); this.applyValue('', ''); this.emit(); }
            else if (role === 'cancel' || role === 'cancel2') { event.preventDefault(); this.closeBrowser(); }
            else if (role === 'confirm') { event.preventDefault(); this.confirmSelection(); }
            else if (role === 'backdrop') { this.closeBrowser(); }
        });
    }

    openBrowser() {
        if (!this.loaderName || typeof window[this.loaderName] !== 'function') {
            console.warn(`browser: children-loader "${this.loaderName}" is not a function`);
            return;
        }
        // Build the tree's seed markup: a single lazy root node the loader expands on demand.
        this.treeHost.replaceChildren();
        const treeEl = document.createElement('div');
        treeEl.setAttribute('children-loader', this.loaderName);
        const ul = document.createElement('ul');
        const li = document.createElement('li');
        li.setAttribute('data-node-id', this.rootId);
        li.setAttribute('data-lazy', 'true');
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.textContent = this.rootLabel;
        li.appendChild(trigger);
        ul.appendChild(li);
        treeEl.appendChild(ul);
        this.treeHost.appendChild(treeEl);

        this.pending = null;
        this.selectionEl.textContent = '';
        this.confirmBtn.disabled = true;
        this.tree = new TreeComponent(treeEl, { onSelect: (detail) => this.onTreeSelect(detail) });
        this.overlay.hidden = false;
    }

    onTreeSelect(detail) {
        const isBranch = detail.item?.classList?.contains('has-children');
        if (this.leafOnly && isBranch) { this.pending = null; this.selectionEl.textContent = ''; this.confirmBtn.disabled = true; return; }
        this.pending = { value: detail.id, label: detail.label };
        this.selectionEl.textContent = detail.id || '';
        this.confirmBtn.disabled = !detail.id;
    }

    confirmSelection() {
        if (!this.pending) return;
        this.applyValue(this.pending.value, this.pending.label);
        this.closeBrowser();
        this.emit();
    }

    closeBrowser() {
        this.overlay.hidden = true;
        if (this.tree && typeof this.tree.destroy === 'function') { try { this.tree.destroy(); } catch (e) { /* ignore */ } }
        this.tree = null;
    }

    applyValue(value, label) {
        this.value = value || '';
        this.labelText = label || value || '';
        if (this.input) this.input.value = this.value;
        if (this.valueEl) {
            this.valueEl.textContent = this.value ? (this.labelText || this.value) : this.placeholder;
            this.valueEl.classList.toggle('is-empty', !this.value);
        }
    }

    emit() {
        const detail = { value: this.value, label: this.labelText };
        // Bubble so host pages can listen via delegation (the base dispatchEvent does not bubble).
        this.element?.dispatchEvent(new CustomEvent('browserchange', { detail, bubbles: true }));
        if (this.onChange) this.onChange(detail);
    }

    /** Programmatic accessors for host code that instantiates the component directly. */
    getValue() { return this.value; }
    setValue(value, label) { this.applyValue(value, label); }
}

if (typeof window !== 'undefined') {
    window.BrowserComponent = BrowserComponent;
}

export { BrowserComponent };
