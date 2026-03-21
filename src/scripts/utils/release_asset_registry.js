import { TemplateRegistry } from './template_registry.js';

class ReleaseAssetRegistry {
    static pageSelector = 'page[release], [component="page"][release], [role="page"][release]';
    static packageName = '@saasira/holi';
    static provider = 'jsdelivr';

    static normalizeRelease(release) {
        return String(release || '').trim().replace(/^v/i, '');
    }

    static normalizeBaseUrl(baseUrl) {
        const raw = String(baseUrl || '').trim();
        if (!raw) return '';
        return raw.endsWith('/') ? raw : `${raw}/`;
    }

    static resolveBaseUrl(options = {}) {
        const release = this.normalizeRelease(options.release);
        if (!release) return '';

        const packageName = encodeURIComponent(String(options.packageName || this.packageName).trim() || this.packageName)
            .replace(/%2F/g, '/')
            .replace(/%40/g, '@');
        const provider = String(options.provider || this.provider).trim().toLowerCase();

        if (provider === 'unpkg') {
            return `https://unpkg.com/${packageName}@${release}/dist/`;
        }

        return `https://cdn.jsdelivr.net/npm/${packageName}@${release}/dist/`;
    }

    static getReleaseConfig(element) {
        if (!(element instanceof Element)) return null;
        const release = String(element.getAttribute('release') || '').trim();
        if (!release) return null;

        return {
            release,
            packageName: element.getAttribute('release-package')
                || element.getAttribute('package')
                || this.packageName,
            provider: element.getAttribute('release-cdn')
                || element.getAttribute('cdn')
                || this.provider
        };
    }

    static registerBundleBase(baseUrl) {
        const normalized = this.normalizeBaseUrl(baseUrl);
        if (!normalized || typeof document === 'undefined') return normalized;
        document.documentElement?.setAttribute?.('data-holi-bundle-base', normalized);
        TemplateRegistry.registerBundleBase(normalized);
        return normalized;
    }

    static ensureLink(targetHead, attrs = {}) {
        if (!(targetHead instanceof Element)) return null;
        const key = String(attrs['data-holi-release-asset'] || '').trim();
        const href = String(attrs.href || '').trim();
        const existing = (key
            ? targetHead.querySelector(`link[data-holi-release-asset="${key}"]`)
            : null)
            || (href ? document.querySelector(`link[href="${href}"]`) : null)
            || (key === 'holi-css' ? document.querySelector('link[rel="stylesheet"][href*="holi.css"]') : null)
            || (key === 'holi-components' ? document.querySelector('link[rel="preload"][href*="components.html"]') : null)
            || (key === 'holi-layouts' ? document.querySelector('link[rel="preload"][href*="layouts.html"]') : null);
        const link = existing instanceof HTMLLinkElement ? existing : document.createElement('link');

        Object.entries(attrs).forEach(([name, value]) => {
            if (value == null || value === '') return;
            link.setAttribute(name, String(value));
        });

        if (!existing) targetHead.appendChild(link);
        return link;
    }

    static ensureScript(targetBody, attrs = {}) {
        if (!(targetBody instanceof Element)) return null;
        const src = String(attrs.src || '').trim();
        if (!src) return null;

        const existing = document.querySelector(`script[src="${src}"]`)
            || document.querySelector('script[src*="holi.js"]')
            || targetBody.querySelector(`script[data-holi-release-asset="${attrs['data-holi-release-asset'] || ''}"]`);
        if (existing instanceof HTMLScriptElement) return existing;

        const script = document.createElement('script');
        Object.entries(attrs).forEach(([name, value]) => {
            if (value == null || value === '') return;
            script.setAttribute(name, String(value));
        });
        targetBody.appendChild(script);
        return script;
    }

    static injectAssetsForConfig(config = {}) {
        if (typeof document === 'undefined') return null;
        const baseUrl = this.resolveBaseUrl(config);
        if (!baseUrl) return null;

        const normalizedBase = this.registerBundleBase(baseUrl);
        const head = document.head;
        const body = document.body;

        if (!(head instanceof HTMLHeadElement) || !(body instanceof HTMLBodyElement)) {
            return { baseUrl: normalizedBase };
        }

        this.ensureLink(head, {
            rel: 'stylesheet',
            href: `${normalizedBase}holi.css`,
            'data-holi-release-asset': 'holi-css'
        });
        this.ensureLink(head, {
            rel: 'preload',
            as: 'fetch',
            href: `${normalizedBase}components.html`,
            crossorigin: 'anonymous',
            'data-holi-release-asset': 'holi-components'
        });
        this.ensureLink(head, {
            rel: 'preload',
            as: 'fetch',
            href: `${normalizedBase}layouts.html`,
            crossorigin: 'anonymous',
            'data-holi-release-asset': 'holi-layouts'
        });

        this.ensureScript(body, {
            src: `${normalizedBase}holi.js`,
            defer: 'defer',
            'data-holi-release-asset': 'holi-js'
        });

        return { baseUrl: normalizedBase };
    }

    static applyFromElement(element) {
        const config = this.getReleaseConfig(element);
        if (!config) return null;
        return this.injectAssetsForConfig(config);
    }

    static prepareDocument(container = document) {
        if (typeof document === 'undefined') return null;
        const root = container === document ? document : container;
        const page = root.querySelector?.(this.pageSelector)
            || (root instanceof Element && root.matches(this.pageSelector) ? root : null);
        if (!page) return null;
        return this.applyFromElement(page);
    }
}

if (typeof window !== 'undefined') {
    window.ReleaseAssetRegistry = ReleaseAssetRegistry;
}

export { ReleaseAssetRegistry };
