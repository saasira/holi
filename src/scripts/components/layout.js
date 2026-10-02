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

    static assignNamedBlocks(fragment, blocks = new Map(), options = {}) {
        const usedNames = new Set();

        blocks.forEach((block, name) => {
            const slot = this.findNamedSlot(fragment, name);
            if (slot) {
                usedNames.add(name);
                const fallbackNodes = Array.from(slot.childNodes);
                const replacement = this.buildBlockFragment(block, fallbackNodes);
                slot.replaceWith(replacement);
                return;
            }

            if (name === 'head') {
                const head = fragment.querySelector('layout-head, [data-layout-head]');
                if (!(head instanceof Element)) return;
                usedNames.add(name);
                this.applyBlockToContainer(head, block);
                return;
            }

            if (name === 'tail') {
                const tail = fragment.querySelector('tail, [data-layout-tail]');
                if (!(tail instanceof Element)) return;
                usedNames.add(name);
                this.applyBlockToContainer(tail, block);
            }
        });

        this.resolveRemainingSlots(fragment, {
            inheritMissing: !!options.inheritMissing
        });

        const unusedNames = Array.from(blocks.keys()).filter((name) => !usedNames.has(name));
        return { usedNames: Array.from(usedNames), unusedNames };
    }

    static buildBlockFragment(block, fallbackNodes = []) {
        const fragment = document.createDocumentFragment();
        const contentNodes = Array.isArray(block?.contentNodes) ? block.contentNodes : [];
        const sourceNodes = contentNodes.length > 0 ? contentNodes : fallbackNodes;

        sourceNodes.forEach((node) => {
            fragment.appendChild(node);
        });

        const regions = block?.regions instanceof Map ? block.regions : new Map();
        if (regions.size > 0) {
            this.assignNamedRegions(fragment, regions);
        }

        return fragment;
    }

    static applyBlockToContainer(container, block) {
        if (!(container instanceof Element)) return;

        const contentNodes = Array.isArray(block?.contentNodes) ? block.contentNodes : [];
        contentNodes.forEach((node) => {
            container.appendChild(node);
        });

        const regions = block?.regions instanceof Map ? block.regions : new Map();
        if (regions.size > 0) {
            this.assignNamedRegions(container, regions);
        }
    }

    static assignNamedRegions(fragment, regions = new Map()) {
        regions.forEach((contentNodes, name) => {
            const slot = this.findNamedSlot(fragment, name);
            if (!slot) return;
            if (contentNodes && contentNodes.length) {
                slot.replaceWith(...contentNodes);
                regions.delete(name);
                return;
            }
            slot.replaceWith();
            regions.delete(name);
        });

        this.resolveRemainingSlots(fragment, { inheritMissing: false });
    }

    static resolveRemainingSlots(fragment, options = {}) {
        const inheritMissing = !!options.inheritMissing;
        const slotNodes = Array.from(fragment.querySelectorAll('slot'));
        slotNodes.forEach((slot) => {
            if (inheritMissing) {
                const fallbackNodes = Array.from(slot.childNodes);
                slot.replaceWith(...fallbackNodes);
                return;
            }
            slot.replaceWith();
        });
    }

    static findNamedSlot(fragment, name) {
        const slotNodes = Array.from(fragment.querySelectorAll('slot'));
        for (let i = 0; i < slotNodes.length; i += 1) {
            const slot = slotNodes[i];
            const slotName = String(slot.getAttribute('name') || 'default').trim();
            if (slotName === name) return slot;
        }
        return null;
    }
}

if (typeof window !== 'undefined') {
    window.LayoutComponent = LayoutComponent;
}

export { LayoutComponent };
