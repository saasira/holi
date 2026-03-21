import { Component } from './component.js';
import { LayoutComponent } from './layout.js';
import { LayoutResolver } from '../utils/layout_resolver.js';
import { LocaleRegistry } from '../utils/locale_registry.js';
import { ReleaseAssetRegistry } from '../utils/release_asset_registry.js';
import { ThemeRegistry } from '../utils/theme_registry.js';

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
        this.markRenderStart();
        this.applyDocumentMetadata();
        const layoutName = String(this.container.getAttribute('layout') || '').trim();

        if (!layoutName) {
            await this.createChildren();
            this.syncChildren();
            this.markRenderComplete();
            return;
        }

        const blocks = this.collectNamedBlocks();
        const layoutFragment = await LayoutResolver.resolve(this.container);
        const placement = LayoutComponent.assignNamedBlocks(layoutFragment, blocks, {
            inheritMissing: this.shouldInheritMissing(this.container)
        });
        this.reportUnusedBlocks(placement.unusedNames, layoutName);
        this.applyBuiltInRegions(blocks);
        this.applyHeadContent(layoutFragment);
        this.applyTailContent(layoutFragment);

        this.container.replaceChildren(layoutFragment);
        this.container.setAttribute('data-page-layout', layoutName);

        await this.createChildren();
        this.syncChildren();
        this.markRenderComplete();
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

    applyDocumentMetadata() {
        const targetHead = this.ensureDocumentSection('head');
        if (!(targetHead instanceof Element)) return;
        ReleaseAssetRegistry.applyFromElement(this.container);

        const title = String(this.container?.getAttribute?.('title') || '').trim();
        if (title) {
            document.title = title;

            let titleNode = targetHead.querySelector('title');
            if (!(titleNode instanceof HTMLTitleElement)) {
                titleNode = document.createElement('title');
                targetHead.appendChild(titleNode);
            }
            titleNode.textContent = title;
        }

        const description = String(this.container?.getAttribute?.('description') || '').trim();
        if (description) {
            this.upsertMetaTag(targetHead, 'description', description);
        }

        const canonical = String(this.container?.getAttribute?.('canonical') || '').trim();
        if (canonical) {
            this.upsertLinkTag(targetHead, 'canonical', canonical);
        }

        const theme = String(this.container?.getAttribute?.('theme') || '').trim();
        if (theme) {
            ThemeRegistry.applyTheme(theme, {
                dispatch: false,
                loadCSS: true
            });
        }

        const lang = String(this.container?.getAttribute?.('lang') || '').trim();
        if (lang) {
            LocaleRegistry.applyLocale(lang, { dispatch: false });
        }
    }

    upsertMetaTag(targetHead, name, content) {
        if (!(targetHead instanceof Element) || !name) return;
        let meta = targetHead.querySelector(`meta[name="${name}"]`);
        if (!(meta instanceof HTMLMetaElement)) {
            meta = document.createElement('meta');
            meta.setAttribute('name', name);
            targetHead.appendChild(meta);
        }
        meta.setAttribute('content', content);
    }

    upsertLinkTag(targetHead, rel, href) {
        if (!(targetHead instanceof Element) || !rel) return;
        let link = targetHead.querySelector(`link[rel="${rel}"]`);
        if (!(link instanceof HTMLLinkElement)) {
            link = document.createElement('link');
            link.setAttribute('rel', rel);
            targetHead.appendChild(link);
        }
        link.setAttribute('href', href);
    }

    ensureDocumentRoot() {
        let root = document.documentElement;
        if (root instanceof HTMLHtmlElement) return root;

        root = document.createElement('html');
        const first = document.firstChild;
        if (first) {
            document.insertBefore(root, first);
        } else {
            document.appendChild(root);
        }
        return root;
    }

    applyBuiltInRegions(blocks = new Map()) {
        const headRegionNames = ['meta', 'styles', 'page-styles'];
        const tailRegionNames = ['scripts', 'page-scripts'];
        const targetHead = this.ensureDocumentSection('head');
        const targetBody = this.ensureDocumentSection('body');
        if (!(targetHead instanceof Element) || !(targetBody instanceof Element)) return;

        const ownerId = String(this.container?.getAttribute?.('data-component-id') || '').trim();

        blocks.forEach((block) => {
            const regions = block?.regions instanceof Map ? block.regions : null;
            if (!(regions instanceof Map) || regions.size === 0) return;

            headRegionNames.forEach((name) => {
                const nodes = regions.get(name);
                if (!Array.isArray(nodes) || nodes.length === 0) return;
                this.appendOwnedNodes(targetHead, nodes, 'data-holi-page-head-owner', ownerId);
                regions.delete(name);
            });

            tailRegionNames.forEach((name) => {
                const nodes = regions.get(name);
                if (!Array.isArray(nodes) || nodes.length === 0) return;
                this.appendOwnedNodes(targetBody, nodes, 'data-holi-page-tail-owner', ownerId);
                regions.delete(name);
            });
        });
    }

    appendOwnedNodes(target, nodes, ownerAttr, ownerId) {
        if (!(target instanceof Element) || !Array.isArray(nodes)) return;
        nodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE && !String(node.textContent || '').trim()) {
                return;
            }

            if (node instanceof Element && ownerId) {
                node.setAttribute(ownerAttr, ownerId);
            }

            target.appendChild(node);
        });
    }

    markRenderStart() {
        if (!this.container?.getAttribute?.('renderer')) {
            this.container?.setAttribute?.('renderer', 'browser');
        }
        this.container?.setAttribute?.('rendered', 'pending');
    }

    markRenderComplete() {
        this.container?.removeAttribute?.('renderer');
        this.container?.removeAttribute?.('rendered');
    }

    applyHeadContent(fragment) {
        const head = fragment.querySelector('layout-head, [data-layout-head]');
        if (!(head instanceof Element)) return;
        const targetHead = this.ensureDocumentSection('head');
        if (!(targetHead instanceof Element)) return;

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
            targetHead.appendChild(nextNode);
        });

        head.remove();
    }

    applyTailContent(fragment) {
        const tail = fragment.querySelector('tail, [data-layout-tail]');
        if (!(tail instanceof Element)) return;
        const targetBody = this.ensureDocumentSection('body');
        if (!(targetBody instanceof Element)) return;

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
            targetBody.appendChild(nextNode);
        });

        tail.remove();
    }

    ensureDocumentSection(tagName) {
        const normalized = String(tagName || '').trim().toLowerCase();
        if (normalized !== 'head' && normalized !== 'body') return null;

        if (normalized === 'head' && document.head) return document.head;
        if (normalized === 'body' && document.body) return document.body;

        let root = document.documentElement;
        if (!(root instanceof HTMLHtmlElement)) {
            root = this.ensureDocumentRoot();
        }

        let section = root.querySelector(`:scope > ${normalized}`);
        if (!(section instanceof Element)) {
            section = document.createElement(normalized);
            if (normalized === 'head') {
                root.insertBefore(section, root.firstChild);
            } else {
                root.appendChild(section);
            }
        }

        return section;
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
