import { Component } from './component.js';

class LocaleSwitcherComponent extends Component {
    static get selector() {
        return 'localeswitcher';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'localeswitcher';
    }

    static templateId = 'localeswitcher-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = LocaleSwitcherComponent.templateId;
        this.init();
    }

    validateStructure() {
        super.validateStructure();
        if (!this.container) {
            throw new Error('LocaleSwitcher requires a container');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    getBindingContext(extra = {}) {
        return super.getBindingContext({
            label: this.container?.getAttribute('label') || this.container?.getAttribute('data-label') || 'Language',
            ...extra
        });
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-localeswitcher');
        this.select = this.container.querySelector('[data-role="locale-select"]');
        this.labelEl = this.container.querySelector('[data-role="locale-label"]');

        this.renderOptions();
        this.applyCurrentLocale();

        if (!this.boundChange) {
            this.boundChange = this.handleChange.bind(this);
        }
        this.select?.addEventListener('change', this.boundChange);
    }

    getLocaleOptions() {
        const raw = String(
            this.container?.getAttribute('locales')
            || this.container?.getAttribute('languages')
            || this.container?.getAttribute('data-locales')
            || 'en:English,fr:French,hi:Hindi'
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
        const options = this.getLocaleOptions();
        this.select.replaceChildren();

        options.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            this.select.appendChild(option);
        });
    }

    getCurrentLocale() {
        const explicit = String(this.container?.getAttribute('value') || '').trim();
        if (explicit) return explicit;
        const htmlLang = String(document.documentElement?.getAttribute('lang') || '').trim();
        if (htmlLang) return htmlLang;
        return this.getLocaleOptions()[0]?.value || '';
    }

    applyCurrentLocale() {
        const locale = this.getCurrentLocale();
        if (!locale) return;
        if (this.select) this.select.value = locale;
        this.applyLocale(locale, { dispatch: false });
    }

    handleChange(event) {
        const locale = String(event?.target?.value || '').trim();
        if (!locale) return;
        this.applyLocale(locale, { dispatch: true });
    }

    applyLocale(locale, options = {}) {
        document.documentElement?.setAttribute?.('lang', locale);
        this.container?.setAttribute?.('value', locale);

        if (options.dispatch === false) return;

        const detail = { locale, lang: locale, language: locale, component: this };
        this.container?.dispatchEvent?.(new CustomEvent('localechange', { detail }));
        this.container?.dispatchEvent?.(new CustomEvent('languagechange', { detail }));
        document.dispatchEvent(new CustomEvent('localechange', { detail }));
        document.dispatchEvent(new CustomEvent('languagechange', { detail }));
    }

    destroy() {
        this.select?.removeEventListener('change', this.boundChange);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.LocaleSwitcherComponent = LocaleSwitcherComponent;
}

export { LocaleSwitcherComponent };
