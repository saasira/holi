import { Component } from './component.js';

class LayoutComponent extends Component {
    static get selector() {
        return 'layout';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'layout';
    }

    static templateId = 'layout-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = LayoutComponent.templateId;
        this.init();
    }

    validateStructure() {
        super.validateStructure();
        if (!this.container) {
            throw new Error('Layout requires a container');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    async render() {
        const sourceNodes = Array.from(this.container.childNodes);
        await super.render();
        this.element = this.container.querySelector('.holi-layout');
        this.content = this.container.querySelector('[data-role="layout-content"]');

        if (this.content) {
            this.content.replaceChildren(...sourceNodes);
            await this.createChildren();
            this.syncChildren();
        }
    }
}

if (typeof window !== 'undefined') {
    window.LayoutComponent = LayoutComponent;
}

export { LayoutComponent };
