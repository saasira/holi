import { Component } from './component.js';

class ThemeSwitcherComponent extends Component {
    static themeLinkAttr = 'data-holi-theme-link';

    static get selector() {
        return 'themeswitcher';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'themeswitcher';
    }

    static templateId = 'themeswitcher-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = ThemeSwitcherComponent.templateId;
        this.themeCssBase = this.readAttr('theme-css-base', '/themes/');
        this.themeCssExt = this.readAttr('theme-css-ext', '.css');
        this.loadCssOnInit = this.readBooleanAttr('load-css-on-init', false);
        this.init();
    }

    validateStructure() {
        super.validateStructure();
        if (!this.container) {
            throw new Error('ThemeSwitcher requires a container');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    getBindingContext(extra = {}) {
        return super.getBindingContext({
            label: this.container?.getAttribute('label') || this.container?.getAttribute('data-label') || 'Theme',
            ...extra
        });
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-themeswitcher');
        this.select = this.container.querySelector('[data-role="theme-select"]');
        this.labelEl = this.container.querySelector('[data-role="theme-label"]');

        const controlId = this.resolveControlId();
        if (this.select) this.select.id = controlId;
        if (this.labelEl) this.labelEl.setAttribute('for', controlId);

        this.renderOptions();
        this.applyCurrentTheme();

        if (!this.boundChange) {
            this.boundChange = this.handleChange.bind(this);
        }
        this.select?.addEventListener('change', this.boundChange);
    }

    readAttr(name, fallback = '') {
        const direct = this.container?.getAttribute?.(name);
        if (direct != null) return String(direct);
        const dataValue = this.container?.getAttribute?.(`data-${name}`);
        return dataValue != null ? String(dataValue) : fallback;
    }

    readBooleanAttr(name, fallback = false) {
        if (!this.container) return fallback;
        if (!this.container.hasAttribute(name) && !this.container.hasAttribute(`data-${name}`)) return fallback;
        const raw = this.readAttr(name, '');
        if (!raw) return true;
        const value = raw.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(value)) return true;
        if (['false', '0', 'no', 'off'].includes(value)) return false;
        return fallback;
    }

    resolveControlId() {
        const existing = String(this.select?.id || '').trim();
        if (existing) return existing;
        const hostId = String(this.container?.getAttribute?.('data-component-id') || '').trim();
        return hostId ? `${hostId}-theme-select` : `holi-theme-switcher-${Math.random().toString(16).slice(2)}`;
    }

    getThemeOptions() {
        const raw = String(
            this.container?.getAttribute('themes')
            || this.container?.getAttribute('data-themes')
            || 'presto,aurora,atlas'
        );

        return raw
            .split(/[\r\n,]+/)
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .map((entry) => {
                const parts = entry.split(':');
                const value = String(parts[0] || '').trim();
                const label = String(parts[1] || parts[0] || '').trim();
                return {
                    value,
                    label: label || value
                };
            })
            .filter((item) => item.value);
    }

    renderOptions() {
        if (!(this.select instanceof HTMLSelectElement)) return;
        const options = this.getThemeOptions();
        this.select.replaceChildren();

        options.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            this.select.appendChild(option);
        });
    }

    getCurrentTheme() {
        const explicit = String(this.container?.getAttribute('value') || '').trim();
        if (explicit) return explicit;
        const bodyTheme = String(document.body?.getAttribute('theme') || '').trim();
        if (bodyTheme) return bodyTheme;
        return this.getThemeOptions()[0]?.value || '';
    }

    applyCurrentTheme() {
        const theme = this.getCurrentTheme();
        if (!theme) return;
        if (this.select) this.select.value = theme;
        this.applyTheme(theme, { dispatch: false, loadCSS: this.loadCssOnInit });
    }

    handleChange(event) {
        const theme = String(event?.target?.value || '').trim();
        if (!theme) return;
        this.applyTheme(theme, { dispatch: true });
    }

    applyTheme(theme, options = {}) {
        const nextTheme = String(theme || '').trim();
        if (!nextTheme) return;

        document.body?.setAttribute?.('theme', nextTheme);
        document.documentElement?.setAttribute?.('theme-palette', nextTheme);
        this.container?.setAttribute?.('value', nextTheme);
        const shouldLoadCSS = options.loadCSS !== false;

        if (shouldLoadCSS) {
            void this.loadThemeCSS(nextTheme).catch((error) => {
                console.warn(error);
            });
        }

        if (options.dispatch === false) return;

        const detail = { theme: nextTheme, palette: nextTheme, component: this };
        this.container?.dispatchEvent?.(new CustomEvent('themechange', { detail }));
        document.dispatchEvent(new CustomEvent('themechange', { detail }));
        document.dispatchEvent(new CustomEvent('theme-palette-change', { detail }));
    }

    destroy() {
        this.select?.removeEventListener('change', this.boundChange);
        super.destroy();
    }

    resolveThemeHref(themeName) {
        const trimmedBase = String(this.themeCssBase || '/themes/').trim();
        const normalizedBase = trimmedBase.endsWith('/') ? trimmedBase : `${trimmedBase}/`;
        const ext = String(this.themeCssExt || '.css').trim() || '.css';
        return `${normalizedBase}${themeName}${ext}`;
    }

    loadThemeCSS(themeName) {
        if (typeof document === 'undefined') return Promise.resolve(null);
        const nextTheme = String(themeName || '').trim();
        if (!nextTheme) return Promise.resolve(null);

        const href = this.resolveThemeHref(nextTheme);
        const existing = document.querySelector(`link[${ThemeSwitcherComponent.themeLinkAttr}="true"]`);
        if (existing && existing.getAttribute('href') === href) {
            existing.setAttribute('data-theme', nextTheme);
            return Promise.resolve(existing);
        }

        if (!href) return Promise.resolve(null);

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.setAttribute(ThemeSwitcherComponent.themeLinkAttr, 'true');
        link.setAttribute('data-theme', nextTheme);

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

}

if (typeof window !== 'undefined') {
    window.ThemeSwitcherComponent = ThemeSwitcherComponent;
}

export { ThemeSwitcherComponent };
