import { Component } from './component.js';

class BlockComponent extends Component {
    static get selector() {
        return 'block';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'block';
    }

    static canInitElement(host) {
        if (!(host instanceof Element)) return true;
        const parent = host.parentElement;
        if (!(parent instanceof Element)) return true;
        return !parent.matches('page[layout], [component="page"][layout], [role="page"][layout]');
    }

    static templateId = 'block-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = BlockComponent.templateId;
        this.init();
    }

    validateStructure() {
        super.validateStructure();
        if (!this.container) {
            throw new Error('Block requires a container');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    async render() {
        const sourceNodes = Array.from(this.container.childNodes);
        await super.render();
        this.element = this.container.querySelector('.holi-block');
        this.content = this.container.querySelector('[data-role="block-content"]');
        if (this.content) {
            this.content.replaceChildren(...sourceNodes);
            await this.createChildren();
            this.syncChildren();
        }
        this.applyLayoutConfig();
    }

    applyLayoutConfig() {
        if (!this.element) return;
        const columns = Math.max(1, Number(this.container.getAttribute('columns')) || 12);
        const gap = this.container.getAttribute('gap') || '12px';
        this.element.style.setProperty('--holi-block-columns', String(columns));
        this.element.style.setProperty('--holi-block-gap', String(gap));
    }
}

if (typeof window !== 'undefined') {
    window.BlockComponent = BlockComponent;
}

export { BlockComponent };
