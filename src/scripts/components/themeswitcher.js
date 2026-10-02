import { Component } from './component.js';
import { ThemeRegistry } from '../utils/theme_registry.js';

class ThemeSwitcherComponent extends Component {
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
        this.hasExplicitThemeCssBase = this.hasAttr('theme-css-base') || this.hasAttr('theme-css-ext');
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

    hasAttr(name) {
        return !!(this.container?.hasAttribute?.(name) || this.container?.hasAttribute?.(`data-${name}`));
    }

    resolveControlId() {
        const existing = String(this.select?.id || '').trim();
        if (existing) return existing;
        const hostId = String(this.container?.getAttribute?.('data-component-id') || '').trim();
        return hostId ? `${hostId}-theme-select` : `holi-theme-switcher-${Math.random().toString(16).slice(2)}`;
    }

    getThemeOptions() {
        const explicit = String(
            this.container?.getAttribute('themes')
            || this.container?.getAttribute('data-themes')
            || ''
        );

        if (explicit) {
            return explicit
            .split(/[\r\n,]+/)
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .map((entry) => {
                const parts = entry.split(':');
                const value = String(parts[0] || '').trim();
                const label = String(parts[1] || parts[0] || '').trim();
                const theme = ThemeRegistry.getTheme(value) || {};
                return {
                    value,
                    label: label || theme.label || value,
                    href: theme.href || this.resolveThemeHref(value),
                    palette: theme.palette || value
                };
            })
            .filter((item) => item.value);
        }

        return ThemeRegistry.getThemes().map((theme) => ({
            value: theme.name,
            label: theme.label || theme.name,
            href: theme.href || this.resolveThemeHref(theme.name),
            palette: theme.palette || theme.name
        }));
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
        const activeTheme = ThemeRegistry.getActiveTheme();
        if (activeTheme?.name) return activeTheme.name;
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

        this.container?.setAttribute?.('value', nextTheme);
        const shouldLoadCSS = options.loadCSS !== false;
        const selectedTheme = this.getThemeOptions().find((item) => item.value === nextTheme);
        const appliedTheme = ThemeRegistry.applyTheme(nextTheme, {
            dispatch: options.dispatch,
            loadCSS: shouldLoadCSS,
            href: selectedTheme?.href,
            source: this,
            removeWhenMissing: true
        });

        if (options.dispatch === false || !appliedTheme) return;
        const detail = {
            theme: appliedTheme.name,
            palette: appliedTheme.palette || appliedTheme.name,
            definition: { ...appliedTheme },
            component: this
        };
        this.container?.dispatchEvent?.(new CustomEvent('themechange', { detail }));
    }

    destroy() {
        this.select?.removeEventListener('change', this.boundChange);
        super.destroy();
    }

    resolveThemeHref(themeName) {
        if (!this.hasExplicitThemeCssBase) return '';
        const trimmedBase = String(this.themeCssBase || '/themes/').trim();
        if (!trimmedBase) return '';
        const normalizedBase = trimmedBase.endsWith('/') ? trimmedBase : `${trimmedBase}/`;
        const ext = String(this.themeCssExt || '.css').trim() || '.css';
        return `${normalizedBase}${themeName}${ext}`;
    }

}

if (typeof window !== 'undefined') {
    window.ThemeSwitcherComponent = ThemeSwitcherComponent;
}

export { ThemeSwitcherComponent };
