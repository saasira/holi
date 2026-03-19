import { Component } from './component.js';
import { LayoutComponent } from './layout.js';
import { LayoutResolver } from '../utils/layout_resolver.js';

class PageComponent extends Component {
    static get selector() {
        return 'page';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'page';
    }

    constructor(container, options = {}) {
        super(container, options);
        this.init();
    }

    validateStructure() {
        if (!this.container) {
            throw new Error('Page requires a container');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    async render() {
        this.element = this.container;
        const layoutName = String(this.container.getAttribute('layout') || '').trim();

        if (!layoutName) {
            await this.createChildren();
            this.syncChildren();
            return;
        }

        const blocks = this.collectNamedBlocks();
        const layoutFragment = await LayoutResolver.resolve(this.container);
        const placement = LayoutComponent.assignNamedBlocks(layoutFragment, blocks, {
            inheritMissing: this.shouldInheritMissing(this.container)
        });
        this.reportUnusedBlocks(placement.unusedNames, layoutName);
        this.applyHeadContent(layoutFragment);
        this.applyTailContent(layoutFragment);

        this.container.replaceChildren(layoutFragment);
        this.container.setAttribute('data-page-layout', layoutName);

        await this.createChildren();
        this.syncChildren();
    }

    collectNamedBlocks() {
        const blocks = new Map();
        const blockSelectors = ['block', '[component="block"]', '[role="block"]'];
        const regionSelectors = ['region', '[component="region"]', '[role="region"]'];
        const children = Array.from(this.container.children)
            .filter((child) => blockSelectors.some((selector) => child.matches(selector)));

        children.forEach((block) => {
            const name = String(block.getAttribute('name') || '').trim();
            if (!name) {
                throw new Error('Page blocks require a non-empty "name" attribute');
            }

            if (blocks.has(name)) {
                throw new Error(`Duplicate page block "${name}"`);
            }

            const contentNodes = [];
            const regions = new Map();

            Array.from(block.childNodes).forEach((node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    if (String(node.textContent || '').trim()) {
                        contentNodes.push(node);
                    }
                    return;
                }

                if (!(node instanceof Element)) {
                    contentNodes.push(node);
                    return;
                }

                if (!regionSelectors.some((selector) => node.matches(selector))) {
                    contentNodes.push(node);
                    return;
                }

                const regionName = String(node.getAttribute('name') || '').trim();
                if (!regionName) {
                    throw new Error(`Region inside block "${name}" requires a non-empty "name" attribute`);
                }

                if (regions.has(regionName)) {
                    throw new Error(`Duplicate region "${regionName}" inside block "${name}"`);
                }

                regions.set(regionName, Array.from(node.childNodes));
            });

            blocks.set(name, { contentNodes, regions });
        });

        return blocks;
    }

    shouldInheritMissing(element) {
        const raw = String(
            element?.getAttribute?.('inherit-missing')
            || element?.getAttribute?.('inherit')
            || ''
        ).trim().toLowerCase();
        return raw === 'true' || raw === '1' || raw === 'yes';
    }

    applyHeadContent(fragment) {
        const head = fragment.querySelector('layout-head, [data-layout-head]');
        if (!(head instanceof Element)) return;

        const ownerId = String(this.container?.getAttribute?.('data-component-id') || '').trim();
        if (ownerId) {
            document.querySelectorAll(`[data-holi-page-head-owner="${ownerId}"]`).forEach((node) => node.remove());
        }

        Array.from(head.childNodes).forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE && !String(node.textContent || '').trim()) {
                return;
            }

            const nextNode = node.cloneNode(true);
            if (nextNode instanceof Element && ownerId) {
                nextNode.setAttribute('data-holi-page-head-owner', ownerId);
            }

            if (nextNode instanceof HTMLScriptElement) {
                (document.body || document.documentElement).appendChild(nextNode);
                return;
            }

            document.head.appendChild(nextNode);
        });

        head.remove();
    }

    applyTailContent(fragment) {
        const tail = fragment.querySelector('tail, [data-layout-tail]');
        if (!(tail instanceof Element)) return;

        const ownerId = String(this.container?.getAttribute?.('data-component-id') || '').trim();
        if (ownerId) {
            document.querySelectorAll(`[data-holi-page-tail-owner="${ownerId}"]`).forEach((node) => node.remove());
        }

        Array.from(tail.childNodes).forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE && !String(node.textContent || '').trim()) {
                return;
            }

            const nextNode = node.cloneNode(true);
            if (nextNode instanceof Element && ownerId) {
                nextNode.setAttribute('data-holi-page-tail-owner', ownerId);
            }
            (document.body || document.documentElement).appendChild(nextNode);
        });

        tail.remove();
    }

    reportUnusedBlocks(unusedNames, layoutName) {
        if (!Array.isArray(unusedNames) || unusedNames.length === 0) return;
        console.warn(`Unused page blocks for layout "${layoutName}": ${unusedNames.join(', ')}`, {
            page: this,
            unusedNames
        });
    }
}

if (typeof window !== 'undefined') {
    window.PageComponent = PageComponent;
}

export { PageComponent };
