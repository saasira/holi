import { Component } from './component.js';
import { ComponentRegistry } from '../utils/component_registry.js';

class IncludeComponent extends Component {
    static get selector() {
        return 'include';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'include';
    }

    static templateId = 'include-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = IncludeComponent.templateId;
        this.src = this.readSource();
        this.init();
    }

    readSource() {
        const direct = this.container?.getAttribute?.('src');
        if (direct != null) return String(direct).trim();
        const dataValue = this.container?.getAttribute?.('data-src');
        return dataValue != null ? String(dataValue).trim() : '';
    }

    validateStructure() {
        super.validateStructure();
        if (!this.container) {
            throw new Error('Include requires a container');
        }
        if (!this.src) {
            throw new Error('Include requires a non-empty "src" attribute');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    resolveSourceUrl() {
        return new URL(this.src, document.baseURI).toString();
    }

    async render() {
        await super.render();
        const response = await fetch(this.resolveSourceUrl(), { credentials: 'same-origin' });
        if (!response.ok) {
            throw new Error(`Include request failed for "${this.src}"`);
        }

        const html = await response.text();
        const fragment = this.parseFragment(html);
        const insertedNodes = Array.from(fragment.childNodes);

        this.container.replaceWith(fragment);
        this.bootstrapInsertedNodes(insertedNodes);
    }

    parseFragment(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(html || ''), 'text/html');
        const fragment = document.createDocumentFragment();

        Array.from(doc.body.childNodes).forEach((node) => {
            fragment.appendChild(node.cloneNode(true));
        });

        return fragment;
    }

    bootstrapInsertedNodes(nodes = []) {
        nodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            ComponentRegistry.initAll(node, { includeRoleSelectors: false });
        });
    }
}

if (typeof window !== 'undefined') {
    window.IncludeComponent = IncludeComponent;
}

export { IncludeComponent };
