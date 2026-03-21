class ThemeRegistry {
    static declarationSelector = 'script[type="application/json"][data-holi-themes], template[data-holi-themes]';
    static themeLinkAttr = 'data-holi-theme-link';
    static defaultThemeName = 'default';
    static themes = new Map();
    static discoveredNodes = new WeakSet();
    static activeThemeName = '';

    static normalizeTheme(theme = {}) {
        const name = String(theme.name || theme.value || '').trim();
        if (!name) return null;

        return {
            name,
            label: String(theme.label || theme.title || name).trim() || name,
            palette: String(theme.palette || name).trim() || name,
            href: String(theme.href || theme.cssHref || theme.stylesheet || '').trim(),
            selector: String(theme.selector || '').trim(),
            loadCss: theme.loadCss !== false
        };
    }

    static ensureDefaultTheme() {
        const currentDefault = String(this.defaultThemeName || 'default').trim() || 'default';
        if (!this.themes.has(currentDefault)) {
            this.themes.set(currentDefault, {
                name: currentDefault,
                label: currentDefault === 'default' ? 'Default' : currentDefault,
                palette: currentDefault,
                href: '',
                selector: '',
                loadCss: false
            });
        }
        return this.themes.get(currentDefault);
    }

    static registerTheme(theme = {}, options = {}) {
        const normalized = this.normalizeTheme(theme);
        if (!normalized) return null;

        const existing = this.themes.get(normalized.name) || {};
        const merged = {
            ...existing,
            ...normalized
        };

        this.themes.set(merged.name, merged);

        if (options.defaultTheme === true || theme.default === true) {
            this.setDefaultTheme(merged.name);
        } else {
            this.ensureDefaultTheme();
        }

        return merged;
    }

    static registerThemes(themes = [], options = {}) {
        if (options.defaultTheme) {
            this.setDefaultTheme(options.defaultTheme);
        } else {
            this.ensureDefaultTheme();
        }

        const list = Array.isArray(themes) ? themes : [themes];
        return list
            .map((theme) => this.registerTheme(theme))
            .filter(Boolean);
    }

    static setDefaultTheme(name) {
        const nextName = String(name || '').trim();
        if (!nextName) return this.getDefaultTheme();
        this.defaultThemeName = nextName;
        return this.registerTheme({
            name: nextName,
            label: nextName === 'default' ? 'Default' : nextName,
            palette: nextName,
            loadCss: false
        });
    }

    static getDefaultTheme() {
        return this.ensureDefaultTheme();
    }

    static getTheme(name) {
        this.ensureDefaultTheme();
        const nextName = String(name || '').trim();
        if (!nextName) return null;
        return this.themes.get(nextName) || null;
    }

    static getThemes(options = {}) {
        this.ensureDefaultTheme();
        const themes = Array.from(this.themes.values());
        const names = Array.isArray(options.names) ? options.names.filter(Boolean) : null;
        if (!names || names.length === 0) return themes;

        return names
            .map((name) => this.getTheme(name))
            .filter(Boolean);
    }

    static parseDeclarationNode(node) {
        const raw = String(node?.textContent || '').trim();
        if (!raw) return null;

        try {
            return JSON.parse(raw);
        } catch (error) {
            console.warn('Invalid Holi theme declaration.', error, node);
            return null;
        }
    }

    static applyDeclaration(declaration = {}) {
        if (Array.isArray(declaration)) {
            this.registerThemes(declaration);
            return;
        }

        if (!declaration || typeof declaration !== 'object') return;

        if (declaration.defaultTheme) {
            this.setDefaultTheme(declaration.defaultTheme);
        } else {
            this.ensureDefaultTheme();
        }

        if (Array.isArray(declaration.themes)) {
            this.registerThemes(declaration.themes);
        }

        const initialTheme = String(declaration.activeTheme || declaration.theme || '').trim();
        if (initialTheme && !this.readBodyTheme()) {
            this.applyTheme(initialTheme, {
                dispatch: false,
                loadCSS: true
            });
        }
    }

    static discover(container = document) {
        if (typeof document === 'undefined') return this.getThemes();
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

        this.ensureDefaultTheme();
        return this.getThemes();
    }

    static readBodyTheme() {
        return String(document.body?.getAttribute?.('theme') || '').trim();
    }

    static getActiveTheme() {
        const bodyTheme = typeof document !== 'undefined' ? this.readBodyTheme() : '';
        if (bodyTheme) {
            this.activeThemeName = bodyTheme;
            return this.getTheme(bodyTheme) || this.registerTheme({ name: bodyTheme });
        }

        if (this.activeThemeName) {
            return this.getTheme(this.activeThemeName) || this.registerTheme({ name: this.activeThemeName });
        }

        return this.getDefaultTheme();
    }

    static syncThemeAttributes(theme) {
        if (typeof document === 'undefined') return;
        const body = document.body;
        if (body instanceof HTMLBodyElement) {
            body.setAttribute('theme', theme.name);
        }
        document.documentElement?.setAttribute?.('theme-palette', theme.palette || theme.name);
    }

    static ensureThemeStylesheet(theme, options = {}) {
        if (typeof document === 'undefined') return Promise.resolve(null);
        const href = String(options.href || theme?.href || '').trim();
        const existing = document.querySelector(`link[${this.themeLinkAttr}="true"]`);

        if (!href) {
            if (options.removeWhenMissing && existing) {
                existing.remove();
            }
            return Promise.resolve(existing || null);
        }

        if (existing && existing.getAttribute('href') === href) {
            existing.setAttribute('data-theme', theme.name);
            return Promise.resolve(existing);
        }

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.setAttribute(this.themeLinkAttr, 'true');
        link.setAttribute('data-theme', theme.name);

        return new Promise((resolve, reject) => {
            link.addEventListener('load', () => {
                if (existing) existing.remove();
                resolve(link);
            }, { once: true });
            link.addEventListener('error', () => {
                link.remove();
                reject(new Error(`Failed to load theme CSS: ${href}`));
            }, { once: true });
            document.head.appendChild(link);
        });
    }

    static dispatchThemeChange(theme, options = {}) {
        if (options.dispatch === false || typeof document === 'undefined') return;
        const detail = {
            theme: theme.name,
            palette: theme.palette || theme.name,
            definition: { ...theme },
            source: options.source || null
        };

        document.body?.dispatchEvent?.(new CustomEvent('themechange', { detail }));
        document.dispatchEvent(new CustomEvent('themechange', { detail }));
        document.dispatchEvent(new CustomEvent('theme-palette-change', { detail }));
    }

    static applyTheme(name, options = {}) {
        const themeName = String(name || '').trim();
        if (!themeName) return null;

        const theme = this.getTheme(themeName) || this.registerTheme({ name: themeName });
        if (!theme) return null;

        this.activeThemeName = theme.name;
        this.syncThemeAttributes(theme);

        const shouldLoadCSS = options.loadCSS !== false && theme.loadCss !== false;
        const stylesheetPromise = shouldLoadCSS
            ? this.ensureThemeStylesheet(theme, {
                href: options.href,
                removeWhenMissing: options.removeWhenMissing
            }).catch((error) => {
                console.warn(error);
                return null;
            })
            : Promise.resolve(null);

        this.dispatchThemeChange(theme, options);
        return {
            ...theme,
            stylesheetPromise
        };
    }

    static ensureActiveTheme(container = document) {
        this.discover(container);
        const bodyTheme = typeof document !== 'undefined' ? this.readBodyTheme() : '';
        if (bodyTheme) {
            const existing = this.getTheme(bodyTheme) || this.registerTheme({ name: bodyTheme });
            this.activeThemeName = existing?.name || bodyTheme;
            this.syncThemeAttributes(existing || { name: bodyTheme, palette: bodyTheme });
            return existing;
        }

        return this.applyTheme(this.getDefaultTheme().name, {
            dispatch: false,
            loadCSS: false
        });
    }
}

if (typeof window !== 'undefined') {
    window.ThemeRegistry = ThemeRegistry;
}

export { ThemeRegistry };
