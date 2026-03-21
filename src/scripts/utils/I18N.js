/**
 * Usage:
 *   const i18n = new I18N({ lang: 'en-US', baseUrl: '/lib/dicts' });
 *   const text = await i18n.getText('mycomponent', 'title', { count: 2 });
 */
class I18N {
    constructor(options = {}) {
        this.dictCache = new Map();
        this.dictLoaders = new Map();
        this.baseUrl = String(options.baseUrl || '/lib/dicts').trim() || '/lib/dicts';
        this.lang = String(
            options.lang
            || (typeof document !== 'undefined' ? document.documentElement.lang : '')
            || 'en-US'
        ).trim() || 'en-US';
    }

    getCacheKey(namespace, lang = this.lang) {
        return `${String(lang || 'en-US')}::${String(namespace || '')}`;
    }

    getCurrentLang(langOverride = '') {
        const explicit = String(langOverride || '').trim();
        if (explicit) return explicit;
        if (typeof document !== 'undefined' && document.documentElement.lang) {
            return document.documentElement.lang;
        }
        return this.lang || 'en-US';
    }

    setLang(lang) {
        const nextLang = String(lang || '').trim();
        if (!nextLang) return;
        this.lang = nextLang;
        if (typeof document !== 'undefined') {
            document.documentElement.lang = nextLang;
        }
    }

    async getText(namespace, key, params = {}, options = {}) {
        const dict = await this.ensureDictLoaded(namespace, options.lang);
        const lookupKey = String(key || '');
        const raw = Object.prototype.hasOwnProperty.call(dict, lookupKey) ? dict[lookupKey] : lookupKey;
        const text = raw == null ? '' : String(raw);
        return text.replace(/{{(\w+)}}/g, (_match, token) => {
            const value = params[token];
            return value == null ? '' : String(value);
        });
    }

    async ensureDictLoaded(namespace, lang = this.getCurrentLang()) {
        const cacheKey = this.getCacheKey(namespace, lang);
        if (!this.dictCache.has(cacheKey)) {
            const loader = this.dictLoaders.get(String(namespace || '')) || this.defaultLoader.bind(this);
            const pending = Promise.resolve(loader(namespace, lang)).then((dict) => {
                if (dict && typeof dict === 'object') return dict;
                return {};
            }).catch((error) => {
                this.dictCache.delete(cacheKey);
                throw error;
            });
            this.dictCache.set(cacheKey, pending);
        }
        return this.dictCache.get(cacheKey);
    }

    defaultLoader(namespace, lang = this.getCurrentLang()) {
        const safeNamespace = String(namespace || '').trim();
        const safeLang = String(lang || this.getCurrentLang()).trim() || 'en-US';
        if (!safeNamespace) return Promise.resolve({});

        const base = String(this.baseUrl || '/lib/dicts').replace(/\/+$/, '');
        return fetch(`${base}/${safeLang}/${safeNamespace}.json`, {
            credentials: 'same-origin'
        }).then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to load dictionary: ${safeNamespace} (${safeLang})`);
            }
            return response.json();
        });
    }

    registerDictLoader(namespace, loadFn) {
        if (!namespace || typeof loadFn !== 'function') return;
        this.dictLoaders.set(String(namespace), loadFn);
        this.clearNamespaceCache(namespace);
    }

    unregisterDictLoader(namespace) {
        this.dictLoaders.delete(String(namespace || ''));
        this.clearNamespaceCache(namespace);
    }

    setCustomDictPath(baseUrl) {
        this.baseUrl = String(baseUrl || '/lib/dicts').trim() || '/lib/dicts';
        this.clearCache();
    }

    clearNamespaceCache(namespace) {
        const suffix = `::${String(namespace || '')}`;
        Array.from(this.dictCache.keys()).forEach((key) => {
            if (key.endsWith(suffix)) this.dictCache.delete(key);
        });
    }

    clearCache() {
        this.dictCache.clear();
    }
}

if (typeof window !== 'undefined') {
    window.I18N = I18N;
}

export { I18N };
