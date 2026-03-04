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
        const sourceItems = this.collectSourceItems();
        await super.render();
        this.element = this.container.querySelector('.holi-accordion');
        this.list = this.container.querySelector('[data-role="accordion-list"]');
        if (!this.element || !this.list) return;

        this.buildItems(sourceItems);
        this.bindEvents();
        if (this.items.length) this.openPanel(this.initialOpenIndex, false);
    }

    collectSourceItems() {
        const explicit = Array.from(this.container.querySelectorAll('[data-accordion-item], [slot="panel"]'));
        if (explicit.length) return explicit;
        return Array.from(this.container.children).filter((node) => {
            if (!(node instanceof HTMLElement)) return false;
            return !node.classList.contains('holi-accordion');
        });
    }

    buildItems(sourceItems) {
        this.list.replaceChildren();
        this.items = [];

        sourceItems.forEach((source, index) => {
            const title = this.extractTitle(source, index);
            const content = this.extractContent(source);
            const item = this.createItem(index, title, content);
            this.items.push(item);
            this.list.appendChild(item.root);
        });
    }

    extractTitle(source, index) {
        const attrTitle = source.getAttribute('title')
            || source.getAttribute('data-title')
            || '';
        if (attrTitle) return attrTitle;

        const headerNode = source.querySelector('[slot="title"], [data-role="title"], h1, h2, h3, h4, h5, h6');
        if (headerNode) return headerNode.textContent?.trim() || `Section ${index + 1}`;
        return `Section ${index + 1}`;
    }

    extractContent(source) {
        const clone = source.cloneNode(true);
        const removable = clone.querySelector('[slot="title"], [data-role="title"], h1, h2, h3, h4, h5, h6');
        if (removable) removable.remove();
        return clone;
    }

    createItem(index, title, content) {
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
        panel.appendChild(content);

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

        if (emit) {
            this.dispatchEvent('accordionchange', {
                index,
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
