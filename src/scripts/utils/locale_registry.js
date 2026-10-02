class LocaleRegistry {
    static declarationSelector = 'script[type="application/json"][data-holi-locales], template[data-holi-locales]';
    static defaultLocaleCode = 'en';
    static locales = new Map();
    static discoveredNodes = new WeakSet();
    static activeLocaleCode = '';

    static normalizeLocale(locale = {}) {
        const code = String(locale.code || locale.lang || locale.locale || locale.value || '').trim();
        if (!code) return null;

        return {
            code,
            label: String(locale.label || locale.name || code).trim() || code,
            dir: String(locale.dir || '').trim()
        };
    }

    static ensureDefaultLocale() {
        const currentDefault = String(this.defaultLocaleCode || 'en').trim() || 'en';
        if (!this.locales.has(currentDefault)) {
            this.locales.set(currentDefault, {
                code: currentDefault,
                label: currentDefault === 'en' ? 'English' : currentDefault,
                dir: ''
            });
        }
        return this.locales.get(currentDefault);
    }

    static registerLocale(locale = {}, options = {}) {
        const normalized = this.normalizeLocale(locale);
        if (!normalized) return null;

        const existing = this.locales.get(normalized.code) || {};
        const merged = {
            ...existing,
            ...normalized
        };

        this.locales.set(merged.code, merged);

        if (options.defaultLocale === true || locale.default === true) {
            this.setDefaultLocale(merged.code);
        } else {
            this.ensureDefaultLocale();
        }

        return merged;
    }

    static registerLocales(locales = [], options = {}) {
        if (options.defaultLocale) {
            this.setDefaultLocale(options.defaultLocale);
        } else {
            this.ensureDefaultLocale();
        }

        const list = Array.isArray(locales) ? locales : [locales];
        return list
            .map((locale) => this.registerLocale(locale))
            .filter(Boolean);
    }

    static setDefaultLocale(code) {
        const nextCode = String(code || '').trim();
        if (!nextCode) return this.getDefaultLocale();
        this.defaultLocaleCode = nextCode;
        return this.registerLocale({
            code: nextCode,
            label: nextCode === 'en' ? 'English' : nextCode
        });
    }

    static getDefaultLocale() {
        return this.ensureDefaultLocale();
    }

    static getLocale(code) {
        this.ensureDefaultLocale();
        const nextCode = String(code || '').trim();
        if (!nextCode) return null;
        return this.locales.get(nextCode) || null;
    }

    static getLocales(options = {}) {
        this.ensureDefaultLocale();
        const locales = Array.from(this.locales.values());
        const codes = Array.isArray(options.codes) ? options.codes.filter(Boolean) : null;
        if (!codes || codes.length === 0) return locales;

        return codes
            .map((code) => this.getLocale(code))
            .filter(Boolean);
    }

    static parseDeclarationNode(node) {
        const raw = String(node?.textContent || '').trim();
        if (!raw) return null;

        try {
            return JSON.parse(raw);
        } catch (error) {
            console.warn('Invalid Holi locale declaration.', error, node);
            return null;
        }
    }

    static applyDeclaration(declaration = {}) {
        if (Array.isArray(declaration)) {
            this.registerLocales(declaration);
            return;
        }

        if (!declaration || typeof declaration !== 'object') return;

        if (declaration.defaultLocale || declaration.defaultLanguage) {
            this.setDefaultLocale(declaration.defaultLocale || declaration.defaultLanguage);
        } else {
            this.ensureDefaultLocale();
        }

        if (Array.isArray(declaration.locales)) {
            this.registerLocales(declaration.locales);
        }

        const initialLocale = String(
            declaration.activeLocale
            || declaration.language
            || declaration.lang
            || ''
        ).trim();

        if (initialLocale && !this.readHtmlLang()) {
            this.applyLocale(initialLocale, { dispatch: false });
        }
    }

    static discover(container = document) {
        if (typeof document === 'undefined') return this.getLocales();
        const nodes = [];
        const root = container === document ? document : container;

        if (root instanceof Element && root.matches(this.declarationSelector)) {
            nodes.push(root);
        }

        if (typeof root.querySelectorAll === 'function') {
            nodes.push(...root.querySelectorAll(this.declarationSelector));
        }

        nodes.forEach((node) => {
            if (this.discoveredNodes.has(node)) return;
            this.discoveredNodes.add(node);
            const declaration = this.parseDeclarationNode(node);
            this.applyDeclaration(declaration);
        });

        this.ensureDefaultLocale();
        return this.getLocales();
    }

    static readHtmlLang() {
        return String(document.documentElement?.getAttribute?.('lang') || '').trim();
    }

    static getActiveLocale() {
        const htmlLang = typeof document !== 'undefined' ? this.readHtmlLang() : '';
        if (htmlLang) {
            this.activeLocaleCode = htmlLang;
            return this.getLocale(htmlLang) || this.registerLocale({ code: htmlLang, label: htmlLang });
        }

        if (this.activeLocaleCode) {
            return this.getLocale(this.activeLocaleCode) || this.registerLocale({ code: this.activeLocaleCode, label: this.activeLocaleCode });
        }

        return this.getDefaultLocale();
    }

    static syncLocaleAttributes(locale) {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        if (!(root instanceof HTMLHtmlElement)) return;
        root.setAttribute('lang', locale.code);
        if (locale.dir) {
            root.setAttribute('dir', locale.dir);
        }
    }

    static dispatchLocaleChange(locale, options = {}) {
        if (options.dispatch === false || typeof document === 'undefined') return;
        const detail = {
            locale: locale.code,
            lang: locale.code,
            language: locale.code,
            definition: { ...locale },
            source: options.source || null
        };

        document.dispatchEvent(new CustomEvent('localechange', { detail }));
        document.dispatchEvent(new CustomEvent('languagechange', { detail }));
    }

    static applyLocale(code, options = {}) {
        const localeCode = String(code || '').trim();
        if (!localeCode) return null;

        const locale = this.getLocale(localeCode) || this.registerLocale({ code: localeCode, label: localeCode });
        if (!locale) return null;

        this.activeLocaleCode = locale.code;
        this.syncLocaleAttributes(locale);
        this.dispatchLocaleChange(locale, options);
        return { ...locale };
    }

    static ensureActiveLocale(container = document) {
        this.discover(container);
        const htmlLang = typeof document !== 'undefined' ? this.readHtmlLang() : '';
        if (htmlLang) {
            const existing = this.getLocale(htmlLang) || this.registerLocale({ code: htmlLang, label: htmlLang });
            this.activeLocaleCode = existing?.code || htmlLang;
            this.syncLocaleAttributes(existing || { code: htmlLang, label: htmlLang });
            return existing;
        }

        return this.applyLocale(this.getDefaultLocale().code, { dispatch: false });
    }
}

if (typeof window !== 'undefined') {
    window.LocaleRegistry = LocaleRegistry;
}

export { LocaleRegistry };
