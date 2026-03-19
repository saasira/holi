import { Component } from './component.js';

class RegionComponent extends Component {
    static get selector() {
        return 'region';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'region';
    }

    static canInitElement(host) {
        if (!(host instanceof Element)) return true;
        const parentBlock = host.closest('block, [component="block"], [role="block"]');
        if (!(parentBlock instanceof Element)) return true;
        const parent = parentBlock.parentElement;
        if (!(parent instanceof Element)) return true;
        return !parent.matches('page[layout], [component="page"][layout], [role="page"][layout]');
    }

    static templateId = 'region-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = RegionComponent.templateId;
        this.init();
    }

    validateStructure() {
        super.validateStructure();
        if (!this.container) {
            throw new Error('Region requires a container');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    async render() {
        const sourceNodes = Array.from(this.container.childNodes);
        await super.render();
        this.element = this.container.querySelector('.holi-region');
        this.content = this.container.querySelector('[data-role="region-content"]');
        if (this.content) this.content.replaceChildren(...sourceNodes);
        this.applyWidth();
    }

    applyWidth() {
        if (!this.element || !this.container) return;
        const spanRaw = Number(this.container.getAttribute('width'));
        const span = Number.isNaN(spanRaw) || spanRaw <= 0 ? 12 : Math.min(12, spanRaw);
        this.container.style.gridColumn = `span ${span}`;
        this.container.style.minWidth = '0';
        this.element.style.setProperty('--holi-region-span', String(span));
    }
}

if (typeof window !== 'undefined') {
    window.RegionComponent = RegionComponent;
}

export { RegionComponent };
