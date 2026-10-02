import { Component } from './component.js';

class AccordionComponent extends Component {
    static get selector() {
        return 'accordion';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'accordion';
    }

    static templateId = 'accordion-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = AccordionComponent.templateId;
        this.multipleOpen = this.readBooleanAttr('multiple', false);
        this.initialOpenIndex = Math.max(0, Number(this.container.getAttribute('open-index')) || 0);
        this.items = [];
        this.openIndexes = new Set();
        this.onClick = (event) => this.handleClick(event);
        this.onKeydown = (event) => this.handleKeydown(event);
        // INLINE sections are taken out before the template renders and MOVED into their panels. They were cloned,
        // and the originals stayed where they were: every section showed twice, once above the accordion and once in
        // it, and anything inside -- a component, a listener, an id -- existed twice.
        this.inlineSources = this.hasProviderSource() ? [] : this.collectSourceItems();
        this.inlineSources.forEach((node) => node.remove());
        this.init();
    }

    readBooleanAttr(attrName, fallback) {
        if (!this.container.hasAttribute(attrName)) return fallback;
        const value = String(this.container.getAttribute(attrName) || '').trim().toLowerCase();
        if (!value) return true;
        return value !== 'false' && value !== '0' && value !== 'no';
    }

    validateStructure() {
        super.validateStructure();
        if (!this.container) throw new Error('Accordion requires a container');
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    async render() {
        const entries = await this.resolveEntries();
        await super.render();
        this.element = this.container.querySelector('.holi-accordion');
        this.list = this.container.querySelector('[data-role="accordion-list"]');
        if (!this.element || !this.list) return;

        this.buildItems(entries);
        this.bindEvents();
        this.openInitial();
    }

    /** Whether the sections come from a content provider (`provider` + `data-source`) or inline `items` JSON. */
    hasProviderSource() {
        return !!(this.readAttr(['source', 'data-source'], '') || this.readAttr(['items', 'data-items'], ''));
    }

    /**
     * The sections: from a content provider when the accordion names a source, else its own children.
     *
     * A provider's `resolve(source)` answers `[{ name, label, content, open }]`. `content` is text (shown as text) or
     * a DOM node; leave it out and the provider's `getContent(item, index)` is asked when the section is first
     * opened, so a long accordion loads only what is read.
     */
    async resolveEntries() {
        if (this.hasProviderSource()) {
            const data = await this.resolveProviderData({ fallback: [] });
            return (Array.isArray(data) ? data : []).map((item, index) => ({
                name: String(item?.name ?? `section-${index}`),
                title: String(item?.label ?? item?.title ?? `Section ${index + 1}`),
                content: item?.content,
                open: !!item?.open,
                item
            }));
        }
        return this.inlineSources.map((source, index) => ({
            name: source.getAttribute('name') || source.getAttribute('data-name') || `section-${index}`,
            title: this.extractTitle(source, index),
            node: source,
            open: false
        }));
    }

    collectSourceItems() {
        // Direct children only: an accordion inside a section keeps its own items.
        const explicit = Array.from(this.container.children).filter((node) =>
            node.hasAttribute?.('data-accordion-item') || node.getAttribute?.('slot') === 'panel');
        if (explicit.length) return explicit;
        return Array.from(this.container.children).filter((node) => {
            if (!(node instanceof HTMLElement)) return false;
            if (node.tagName === 'TEMPLATE' || node.tagName === 'SCRIPT') return false;
            return !node.classList.contains('holi-accordion');
        });
    }

    buildItems(entries) {
        this.list.replaceChildren();
        this.items = [];
        this.openIndexes.clear();

        entries.forEach((entry, index) => {
            const item = this.createItem(index, entry.title);
            item.name = entry.name;
            item.entry = entry;
            this.fillPanel(item, entry);
            this.items.push(item);
            this.list.appendChild(item.root);
        });
    }

    /** A section's title: its title attribute, else its first heading -- which then leaves the body, being the title. */
    extractTitle(source, index) {
        const attrTitle = source.getAttribute('title')
            || source.getAttribute('data-title')
            || '';
        if (attrTitle) return attrTitle;

        const headerNode = source.querySelector(':scope > [slot="title"], :scope > [data-role="title"], :scope > h1, '
            + ':scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6');
        if (headerNode) {
            const title = headerNode.textContent?.trim();
            headerNode.remove();
            if (title) return title;
        }
        return `Section ${index + 1}`;
    }

    fillPanel(item, entry) {
        if (entry.node) {
            item.panel.appendChild(entry.node);
            item.loaded = true;
            return;
        }
        if (entry.content !== undefined && entry.content !== null) {
            this.setPanelContent(item.panel, entry.content);
            item.loaded = true;
            return;
        }
        item.loaded = false;        // asked for when first opened
    }

    setPanelContent(panel, content) {
        if (content instanceof Node) {
            panel.replaceChildren(content);
            return;
        }
        const text = document.createElement('div');
        text.className = 'accordion-text';
        text.textContent = String(content);
        panel.replaceChildren(text);
    }

    /** A provider section's content, asked of `getContent(item, index)` the first time it opens. */
    async loadPanel(index) {
        const target = this.items[index];
        if (!target || target.loaded || target.loading) return;
        target.loading = true;
        target.panel.setAttribute('aria-busy', 'true');
        try {
            const provider = await this.ensureContentProvider();
            const content = typeof provider?.getContent === 'function'
                ? await provider.getContent(target.entry.item, index, this)
                : '';
            this.setPanelContent(target.panel, content ?? '');
            target.loaded = true;
            this.dispatchEvent('accordionload', { index, name: target.name });
        } catch (error) {
            this.setPanelContent(target.panel, 'Load failed');
        } finally {
            target.loading = false;
            target.panel.removeAttribute('aria-busy');
        }
    }

    /** The sections open at first: those a provider marks open, else the one `default` names, else `open-index`. */
    openInitial() {
        if (!this.items.length) return;
        const marked = this.items.filter((item) => item.entry?.open);
        if (marked.length) {
            (this.multipleOpen ? marked : marked.slice(0, 1)).forEach((item) => this.openPanel(item.index, false));
            return;
        }
        const wanted = this.container.getAttribute('default');
        const named = wanted ? this.items.findIndex((item) => item.name === wanted) : -1;
        this.openPanel(named >= 0 ? named : Math.min(this.initialOpenIndex, this.items.length - 1), false);
    }

    /** Re-reads a provider's sections, for data that changed. Inline sections are the page's and stay as they are. */
    async reload() {
        if (!this.hasProviderSource() || !this.list) return;
        this.contentProviderInstance = null;
        this.buildItems(await this.resolveEntries());
        this.openInitial();
    }

    /** Opens the section of this name. */
    openSection(name) {
        const index = this.items.findIndex((item) => item.name === name);
        if (index >= 0) this.openPanel(index);
        return index >= 0;
    }

    createItem(index, title) {
        const root = document.createElement('article');
        root.className = 'accordion-item';
        root.setAttribute('data-index', String(index));

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'accordion-trigger';
        trigger.setAttribute('data-action', 'toggle');
        trigger.setAttribute('data-index', String(index));
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-controls', `accordion-panel-${index}`);
        trigger.textContent = title;

        const panel = document.createElement('section');
        panel.className = 'accordion-panel';
        panel.id = `accordion-panel-${index}`;
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');

        root.append(trigger, panel);
        return { index, root, trigger, panel };
    }

    bindEvents() {
        this.element.addEventListener('click', this.onClick);
        this.element.addEventListener('keydown', this.onKeydown);
    }

    handleClick(event) {
        const trigger = event.target?.closest?.('[data-action="toggle"]');
        if (!trigger) return;
        const index = Number(trigger.getAttribute('data-index'));
        if (Number.isNaN(index)) return;
        this.togglePanel(index);
    }

    handleKeydown(event) {
        const trigger = event.target?.closest?.('.accordion-trigger');
        if (!trigger) return;
        const index = Number(trigger.getAttribute('data-index'));
        if (Number.isNaN(index)) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            const next = (index + 1) % this.items.length;
            this.items[next]?.trigger?.focus();
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            const prev = (index - 1 + this.items.length) % this.items.length;
            this.items[prev]?.trigger?.focus();
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.togglePanel(index);
        }
    }

    togglePanel(index) {
        if (!this.items[index]) return;
        if (this.openIndexes.has(index)) {
            this.closePanel(index);
            return;
        }
        this.openPanel(index);
    }

    openPanel(index, emit = true) {
        const target = this.items[index];
        if (!target) return;

        if (!this.multipleOpen) {
            Array.from(this.openIndexes).forEach((openIndex) => {
                if (openIndex !== index) this.closePanel(openIndex, false);
            });
        }

        this.openIndexes.add(index);
        target.root.classList.add('is-open');
        target.trigger.setAttribute('aria-expanded', 'true');
        target.panel.hidden = false;
        target.panel.setAttribute('aria-hidden', 'false');
        if (!target.loaded) void this.loadPanel(index);

        if (emit) {
            this.dispatchEvent('accordionchange', {
                index,
                name: target.name,
                open: true,
                multiple: this.multipleOpen,
                openIndexes: Array.from(this.openIndexes)
            });
        }
    }

    closePanel(index, emit = true) {
        const target = this.items[index];
        if (!target) return;
        this.openIndexes.delete(index);
        target.root.classList.remove('is-open');
        target.trigger.setAttribute('aria-expanded', 'false');
        target.panel.hidden = true;
        target.panel.setAttribute('aria-hidden', 'true');

        if (emit) {
            this.dispatchEvent('accordionchange', {
                index,
                name: target.name,
                open: false,
                multiple: this.multipleOpen,
                openIndexes: Array.from(this.openIndexes)
            });
        }
    }

    openAll() {
        if (!this.multipleOpen) return;
        this.items.forEach((item) => this.openPanel(item.index, false));
        this.dispatchEvent('accordionchange', {
            index: -1,
            open: true,
            multiple: true,
            openIndexes: Array.from(this.openIndexes)
        });
    }

    closeAll() {
        this.items.forEach((item) => this.closePanel(item.index, false));
        this.dispatchEvent('accordionchange', {
            index: -1,
            open: false,
            multiple: this.multipleOpen,
            openIndexes: []
        });
    }

    destroy() {
        this.element?.removeEventListener('click', this.onClick);
        this.element?.removeEventListener('keydown', this.onKeydown);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.AccordionComponent = AccordionComponent;
}

export { AccordionComponent };
