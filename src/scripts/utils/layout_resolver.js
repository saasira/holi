import { TemplateRegistry } from './template_registry.js';

class LayoutResolver {
    static cache = new Map();

    static getGlobalConfig() {
        const config = window.HoliConfig;
        return config && typeof config === 'object' ? config : {};
    }

    static normalizeBase(basePath = '') {
        const value = String(basePath || '').trim();
        if (!value) return '';
        return value.endsWith('/') ? value : `${value}/`;
    }

    static getLayoutName(element) {
        return String(element?.getAttribute?.('layout') || '').trim();
    }

    static getExplicitSource(element) {
        return String(
            element?.getAttribute?.('layout-src')
            || element?.getAttribute?.('layoutSrc')
            || ''
        ).trim();
    }

    static getBaseCandidates(element) {
        const config = this.getGlobalConfig();
        const bases = [
            element?.getAttribute?.('layouts-base'),
            element?.getAttribute?.('layout-base'),
            config.layoutsBase,
            config.layoutBase,
            '/dist/layouts/',
            '/layouts/'
        ];

        return bases
            .map((base) => this.normalizeBase(base))
            .filter((base, index, items) => base && items.indexOf(base) === index);
    }

    static getCandidateUrls(element, layoutName = '') {
        const direct = this.getExplicitSource(element);
        if (direct) return [direct];

        const name = String(layoutName || this.getLayoutName(element)).trim();
        if (!name) return [];

        return this.getBaseCandidates(element).map((base) => `${base}${name}.html`);
    }

    static async resolve(element) {
        const layoutName = this.getLayoutName(element);
        if (!layoutName) {
            throw new Error('Page layout name is required');
        }

        const registeredLayout = TemplateRegistry.getLayout(layoutName);
        if (registeredLayout) {
            return registeredLayout;
        }

        await TemplateRegistry.ensureLayoutTemplates();
        const bundledLayout = TemplateRegistry.getLayout(layoutName);
        if (bundledLayout) {
            return bundledLayout;
        }

        const urls = this.getCandidateUrls(element, layoutName);
        if (!urls.length) {
            throw new Error(`No layout sources configured for "${layoutName}"`);
        }

        let lastError = null;

        for (let i = 0; i < urls.length; i += 1) {
            const url = urls[i];
            try {
                return await this.loadLayout(url, layoutName);
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError || new Error(`Unable to load layout "${layoutName}"`);
    }

    static async loadLayout(url, layoutName) {
        const cacheKey = `${layoutName}::${url}`;
        if (this.cache.has(cacheKey)) {
            const cached = await this.cache.get(cacheKey);
            return cached.cloneNode(true);
        }

        const pending = (async () => {
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) {
                throw new Error(`Layout request failed for "${layoutName}" from ${url}`);
            }

            const html = await response.text();
            const fragment = this.parseLayout(html, layoutName, url);
            if (!(fragment instanceof DocumentFragment)) {
                throw new Error(`Layout "${layoutName}" from ${url} did not resolve to a template fragment`);
            }
            return fragment;
        })();

        this.cache.set(cacheKey, pending);

        try {
            const fragment = await pending;
            return fragment.cloneNode(true);
        } catch (error) {
            this.cache.delete(cacheKey);
            throw error;
        }
    }

    static parseLayout(html, layoutName, sourceUrl = '') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(html || ''), 'text/html');

        const templateSelectors = [
            `template[data-layout="${layoutName}"]`,
            `template[id="page-layout-${layoutName}"]`,
            `template[id="${layoutName}"]`
        ];

        for (let i = 0; i < templateSelectors.length; i += 1) {
            const template = doc.querySelector(templateSelectors[i]);
            if (template instanceof HTMLTemplateElement) {
                return template.content.cloneNode(true);
            }
        }

        const namedLayout = doc.querySelector(`layout[name="${layoutName}"]`);
        if (namedLayout) {
            const fragment = document.createDocumentFragment();
            Array.from(namedLayout.childNodes).forEach((child) => {
                fragment.appendChild(child.cloneNode(true));
            });
            return fragment;
        }

        const onlyTemplate = doc.querySelector('template');
        if (onlyTemplate instanceof HTMLTemplateElement) {
            return onlyTemplate.content.cloneNode(true);
        }

        const bodyFragment = document.createDocumentFragment();
        Array.from(doc.body.childNodes).forEach((child) => {
            bodyFragment.appendChild(child.cloneNode(true));
        });

        if (bodyFragment.childNodes.length > 0) {
            return bodyFragment;
        }

        throw new Error(`Layout "${layoutName}" not found in ${sourceUrl || 'provided HTML'}`);
    }
}

if (typeof window !== 'undefined') {
    window.LayoutResolver = LayoutResolver;
}

export { LayoutResolver };
