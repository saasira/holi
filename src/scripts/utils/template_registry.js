class TemplateRegistry {
    static templates = new Map();
    static layouts = new Map();
    static loading = new Map();

    static getCurrentScriptBase() {
        const currentScript = document.currentScript;
        const src = currentScript?.getAttribute('src') || '';
        if (!src) return '';
        return src.replace(/holi\.js(\?.*)?$/i, '');
    }

    static resolveCoreUrls() {
        const base = this.getCurrentScriptBase();
        const urls = new Set(['/dist/components.html', '/components.html', '/dist/templates.html', '/templates.html', '/dist/holi.html', '/holi.html']);
        if (base) {
            urls.add(`${base}components.html`);
            urls.add(`${base}templates.html`);
            urls.add(`${base}holi.html`);
        }
        return Array.from(urls);
    }

    static resolveLayoutUrls() {
        const base = this.getCurrentScriptBase();
        const urls = new Set(['/dist/layouts.html', '/layouts.html']);
        if (base) {
            urls.add(`${base}layouts.html`);
        }
        return Array.from(urls);
    }

    static hasTemplate(id) {
        return this.templates.has(id) || !!document.getElementById(id);
    }

    static getTemplate(id) {
        const template = this.templates.get(id);
        if (template instanceof HTMLTemplateElement) {
            return template;
        }

        const domTemplate = document.getElementById(id);
        if (domTemplate instanceof HTMLTemplateElement) {
            return domTemplate;
        }

        return null;
    }

    static getLayout(layoutName) {
        const template = this.layouts.get(layoutName);
        if (template instanceof HTMLTemplateElement) {
            return template.content.cloneNode(true);
        }

        const domTemplate = document.querySelector(`template[data-layout="${layoutName}"]`)
            || document.getElementById(`page-layout-${layoutName}`)
            || document.getElementById(layoutName);
        if (domTemplate instanceof HTMLTemplateElement) {
            return domTemplate.content.cloneNode(true);
        }

        return null;
    }

    static registerTemplate(template) {
        if (!(template instanceof HTMLTemplateElement) || !template.id) return;
        this.templates.set(template.id, template.cloneNode(true));
    }

    static registerLayout(template) {
        if (!(template instanceof HTMLTemplateElement)) return;
        const names = [];
        const dataName = String(template.getAttribute('data-layout') || '').trim();
        if (dataName) names.push(dataName);
        const id = String(template.id || '').trim();
        const idMatch = id.match(/^page-layout-(.+)$/);
        if (idMatch && idMatch[1]) names.push(idMatch[1]);

        names.forEach((name) => {
            if (!this.layouts.has(name)) {
                this.layouts.set(name, template.cloneNode(true));
            }
        });
    }

    static ingestHtml(htmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(htmlText || ''), 'text/html');
        const templates = Array.from(doc.querySelectorAll('template[id], template[data-layout]'));
        templates.forEach((template) => {
            if (!(template instanceof HTMLTemplateElement)) return;
            this.registerTemplate(template);
            this.registerLayout(template);
        });
    }

    static async loadBundle(url, key = url) {
        if (this.loading.has(key)) {
            return this.loading.get(key);
        }

        const pending = (async () => {
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) {
                throw new Error(`Failed to load template bundle from ${url}`);
            }
            const html = await response.text();
            this.ingestHtml(html);
        })();

        this.loading.set(key, pending);

        try {
            await pending;
        } catch (error) {
            this.loading.delete(key);
            throw error;
        }
    }

    static async loadFirstAvailable(urls, predicate) {
        for (let i = 0; i < urls.length; i += 1) {
            const url = urls[i];
            try {
                await this.loadBundle(url, url);
                if (!predicate || predicate()) return;
            } catch (_error) {}
        }
    }

    static async ensureCoreTemplates() {
        if (this.hasTemplate('tabs')) return;
        await this.loadFirstAvailable(this.resolveCoreUrls(), () => this.hasTemplate('tabs'));
        if (!this.hasTemplate('tabs')) {
            throw new Error('Holi template library not found (components.html)');
        }
    }

    static async ensureLayoutTemplates() {
        if (this.layouts.size > 0) return;
        await this.loadFirstAvailable(this.resolveLayoutUrls(), () => this.layouts.size > 0);
    }
}

if (typeof window !== 'undefined') {
    window.HoliTemplateRegistry = TemplateRegistry;
}

export { TemplateRegistry };
