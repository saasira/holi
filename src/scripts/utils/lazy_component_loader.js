import { HoliApp } from './app.js';
import { TemplateRegistry } from './template_registry.js';

const standardSelectors = (aliases = []) => {
    const selectors = new Set();
    aliases.forEach((alias) => {
        const value = String(alias || '').trim();
        if (!value) return;
        selectors.add(value);
        selectors.add(`[component="${value}"]`);
        selectors.add(`[role="${value}"]`);
    });
    return Array.from(selectors);
};

const componentEntries = [
    {
        id: 'accordion',
        aliases: ['accordion'],
        styles: ['accordion'],
        resolve: (mod) => mod.AccordionComponent,
        load: () => import('../components/accordion.js')
    },
    {
        id: 'backtotop',
        aliases: ['backtotop'],
        styles: ['backtotop'],
        resolve: (mod) => mod.BackToTopComponent,
        load: () => import('../components/backtotop.js')
    },
    {
        id: 'block',
        aliases: ['block'],
        resolve: (mod) => mod.BlockComponent,
        load: () => import('../components/block.js')
    },
    {
        id: 'browser',
        aliases: ['browser'],
        styles: ['browser'],
        resolve: (mod) => mod.BrowserComponent,
        load: () => import('../components/browser.js')
    },
    {
        id: 'breadcrumbs',
        aliases: ['breadcrumbs'],
        styles: ['breadcrumbs'],
        resolve: (mod) => mod.BreadCrumbsComponent,
        load: () => import('../components/breadcrumbs.js')
    },
    {
        id: 'button',
        aliases: ['holi-button', 'button-control'],
        styles: ['button'],
        resolve: (mod) => mod.ButtonComponent,
        load: () => import('../components/button.js')
    },
    {
        id: 'calendar',
        aliases: ['calendar'],
        styles: ['calendar'],
        resolve: (mod) => mod.CalendarComponent,
        load: () => import('../components/calendar.js')
    },
    {
        id: 'carousel',
        aliases: ['carousel'],
        styles: ['carousel'],
        resolve: (mod) => mod.CarouselComponent,
        load: () => import('../components/carousel.js')
    },
    {
        id: 'chart',
        aliases: ['chart'],
        styles: ['chart'],
        resolve: (mod) => mod.ChartComponent,
        load: () => import('../components/chart.js')
    },
    {
        id: 'checkbox',
        aliases: ['holi-checkbox', 'checkbox-group'],
        styles: ['checkbox'],
        selectors: [
            ...standardSelectors(['holi-checkbox', 'checkbox-group']),
            'input[type="checkbox"][component="checkbox"]',
            'input[type="checkbox"][role="checkbox"]'
        ],
        resolve: (mod) => mod.CheckboxGroupComponent,
        load: () => import('../components/checkbox.js')
    },
    {
        id: 'datagrid',
        aliases: ['datagrid'],
        styles: ['datagrid'],
        resolve: (mod) => mod.DataGrid,
        load: () => import('../components/datagrid.js')
    },
    {
        id: 'datatable',
        aliases: ['datatable'],
        styles: ['datatable'],
        resolve: (mod) => mod.DataTable,
        load: () => import('../components/datatable.js')
    },
    {
        id: 'dialog',
        aliases: ['dialog'],
        styles: ['dialog'],
        resolve: (mod) => mod.DialogComponent,
        load: () => import('../components/dialog.js')
    },
    {
        id: 'drawer',
        aliases: ['drawer'],
        styles: ['drawer'],
        resolve: (mod) => mod.DrawerComponent,
        load: () => import('../components/drawer.js')
    },
    {
        id: 'dropdown',
        aliases: ['dropdown'],
        styles: ['dropdown'],
        selectors: [
            ...standardSelectors(['dropdown']),
            'select[component="dropdown"]',
            'select[role="dropdown"]'
        ],
        resolve: (mod) => mod.DropdownComponent,
        load: () => import('../components/dropdown.js')
    },
    {
        id: 'form',
        aliases: ['holi-form', 'form-shell'],
        styles: ['form'],
        resolve: (mod) => mod.FormComponent,
        load: () => import('../components/form.js')
    },
    {
        id: 'formdesigner',
        aliases: ['formdesigner', 'holi-formdesigner', 'form-designer'],
        styles: ['formdesigner'],
        selectors: [
            ...standardSelectors(['formdesigner', 'holi-formdesigner', 'form-designer'])
        ],
        resolve: (mod) => mod.FormDesignerComponent,
        load: () => import('../components/formdesigner.js')
    },
    {
        id: 'gallery',
        aliases: ['gallery'],
        styles: ['gallery'],
        resolve: (mod) => mod.GalleryComponent,
        load: () => import('../components/gallery.js')
    },
    {
        id: 'histogram',
        aliases: ['histogram'],
        styles: ['histogram'],
        resolve: (mod) => mod.HistogramComponent,
        load: () => import('../components/histogram.js')
    },
    {
        id: 'include',
        aliases: ['include'],
        resolve: (mod) => mod.IncludeComponent,
        load: () => import('../components/include.js')
    },
    {
        id: 'input',
        aliases: ['holi-input', 'input-field'],
        styles: ['input'],
        selectors: [
            ...standardSelectors(['holi-input', 'input-field']),
            'input[component="input"]',
            'input[role="input"]',
            'input[component="input-field"]',
            'input[role="input-field"]',
            'input[component="textarea"]',
            'input[role="textarea"]',
            'textarea[component="input"]',
            'textarea[role="input"]',
            'textarea[component="input-field"]',
            'textarea[role="input-field"]',
            'textarea[component="textarea"]',
            'textarea[role="textarea"]'
        ],
        resolve: (mod) => mod.InputComponent,
        load: () => import('../components/input.js')
    },
    {
        id: 'layout',
        aliases: ['layout'],
        styles: ['layout'],
        resolve: (mod) => mod.LayoutComponent,
        load: () => import('../components/layout.js')
    },
    {
        id: 'loader',
        aliases: ['loader'],
        styles: ['loader'],
        selectors: [
            ...standardSelectors(['loader']),
            '[data-loader]'
        ],
        resolve: (mod) => mod.LoaderComponent,
        load: () => import('../components/loader.js')
    },
    {
        id: 'localeswitcher',
        aliases: ['localeswitcher'],
        styles: ['localeswitcher'],
        resolve: (mod) => mod.LocaleSwitcherComponent,
        load: () => import('../components/localeswitcher.js')
    },
    {
        id: 'menubar',
        aliases: ['menubar'],
        styles: ['menubar'],
        resolve: (mod) => mod.MenubarComponent,
        load: () => import('../components/menubar.js')
    },
    {
        id: 'offline',
        aliases: ['offline'],
        styles: ['offline'],
        selectors: [
            ...standardSelectors(['offline']),
            '[data-offline]'
        ],
        resolve: (mod) => mod.OfflineIndicator,
        load: () => import('../components/offline.js')
    },
    {
        id: 'page',
        aliases: ['page'],
        styles: ['page'],
        resolve: (mod) => mod.PageComponent,
        load: () => import('../components/page.js')
    },
    {
        id: 'panel',
        aliases: ['panel'],
        styles: ['panel'],
        resolve: (mod) => mod.PanelComponent,
        load: () => import('../components/panel.js')
    },
    {
        id: 'progress',
        aliases: ['progress'],
        styles: ['progress'],
        resolve: (mod) => mod.ProgressBar || mod.ProgressComponent,
        load: () => import('../components/progress.js')
    },
    {
        id: 'radio',
        aliases: ['holi-radio', 'radio-group'],
        styles: ['radio'],
        selectors: [
            ...standardSelectors(['holi-radio', 'radio-group']),
            'input[type="radio"][component="radio"]',
            'input[type="radio"][role="radio"]'
        ],
        resolve: (mod) => mod.RadioGroupComponent,
        load: () => import('../components/radio.js')
    },
    {
        id: 'rating',
        aliases: ['rating'],
        styles: ['rating'],
        resolve: (mod) => mod.RatingComponent,
        load: () => import('../components/rating.js')
    },
    {
        id: 'refresh',
        aliases: ['refresh'],
        styles: ['refresh'],
        selectors: [
            ...standardSelectors(['refresh']),
            '[data-pull-refresh]'
        ],
        resolve: (mod) => mod.RefreshComponent,
        load: () => import('../components/refresh.js')
    },
    {
        id: 'region',
        aliases: ['region'],
        resolve: (mod) => mod.RegionComponent,
        load: () => import('../components/region.js')
    },
    {
        id: 'rte',
        aliases: ['rte'],
        styles: ['rte'],
        resolve: (mod) => mod.RteComponent,
        load: () => import('../components/rte.js')
    },
    {
        id: 'search',
        aliases: ['search'],
        styles: ['search'],
        selectors: [
            '[data-search]',
            '[component="search"]',
            '[role="search"]'
        ],
        resolve: (mod) => mod.SearchComponent,
        load: () => import('../components/search.js')
    },
    {
        id: 'schedule',
        aliases: ['schedule'],
        styles: ['schedule'],
        resolve: (mod) => mod.ScheduleComponent,
        load: () => import('../components/schedule.js')
    },
    {
        id: 'select',
        aliases: ['holi-select', 'select-field'],
        styles: ['select'],
        selectors: [
            ...standardSelectors(['holi-select', 'select-field']),
            'select[component="select"]',
            'select[role="select"]',
            'select[component="select-field"]',
            'select[role="select-field"]'
        ],
        resolve: (mod) => mod.SelectComponent,
        load: () => import('../components/select.js')
    },
    {
        id: 'statscard',
        aliases: ['statscard'],
        styles: ['statscard'],
        selectors: [
            '[data-stats]',
            '.stats-card',
            '[component="statscard"]',
            '[role="statscard"]'
        ],
        resolve: (mod) => mod.StatsCard,
        load: () => import('../components/statscard.js')
    },
    {
        id: 'tabs',
        aliases: ['tabs'],
        styles: ['tabs'],
        resolve: (mod) => mod.TabsComponent,
        load: () => import('../components/tabs.js')
    },
    {
        id: 'textarea',
        aliases: ['holi-textarea', 'textarea-field'],
        styles: ['textarea'],
        resolve: (mod) => mod.TextAreaComponent,
        load: () => import('../components/textarea.js')
    },
    {
        id: 'themeswitcher',
        aliases: ['themeswitcher'],
        styles: ['themeswitcher'],
        resolve: (mod) => mod.ThemeSwitcherComponent,
        load: () => import('../components/themeswitcher.js')
    },
    {
        id: 'timerange',
        aliases: ['timerange'],
        styles: ['timerange'],
        resolve: (mod) => mod.TimeRangeComponent,
        load: () => import('../components/timerange.js')
    },
    {
        id: 'toast',
        aliases: ['toast'],
        styles: ['toast'],
        resolve: (mod) => mod.ToastComponent,
        load: () => import('../components/toast.js')
    },
    {
        id: 'tree',
        aliases: ['tree'],
        styles: ['tree'],
        resolve: (mod) => mod.TreeComponent,
        load: () => import('../components/tree.js')
    },
    {
        id: 'treepanel',
        aliases: ['treepanel'],
        styles: ['treepanel'],
        resolve: (mod) => mod.TreePanelComponent,
        load: () => import('../components/treepanel.js')
    },
    {
        id: 'wizard',
        aliases: ['wizard'],
        styles: ['wizard'],
        resolve: (mod) => mod.WizardComponent,
        load: () => import('../components/wizard.js')
    },
    {
        id: 'workflow',
        aliases: ['workflow', 'holi-workflow', 'workflow-builder'],
        styles: ['workflow'],
        selectors: [
            ...standardSelectors(['workflow', 'holi-workflow', 'workflow-builder'])
        ],
        resolve: (mod) => mod.WorkflowComponent,
        load: () => import('../components/workflow.js')
    }
];

class LazyComponentLoader {
    static entryById = new Map(componentEntries.map((entry) => [entry.id, {
        ...entry,
        selectors: entry.selectors || standardSelectors(entry.aliases)
    }]));
    static aliasToId = new Map();
    static pending = new Map();
    static loaded = new Set();
    static cssLoaded = new Set();
    static observer = null;

    static resolveBundleBase() {
        if (typeof document === 'undefined') return '';
        const attrBase = String(document.documentElement?.getAttribute?.('data-holi-bundle-base') || '').trim();
        if (attrBase) {
            return attrBase.endsWith('/') ? attrBase : `${attrBase}/`;
        }

        const src = String(window.__holiBundleScriptSrc || '').trim();
        if (!src) return '';
        const idx = src.lastIndexOf('/');
        return idx >= 0 ? src.slice(0, idx + 1) : '';
    }

    static registerBundleBase(baseUrl) {
        const base = String(baseUrl || '').trim();
        if (!base || typeof document === 'undefined') return '';
        const normalized = base.endsWith('/') ? base : `${base}/`;
        document.documentElement?.setAttribute?.('data-holi-bundle-base', normalized);
        TemplateRegistry.registerBundleBase(normalized);
        return normalized;
    }

    static ensureStyles(entry) {
        const base = this.resolveBundleBase();
        if (!base) return;

        (entry.styles || []).forEach((styleName) => {
            const key = String(styleName || '').trim();
            if (!key || this.cssLoaded.has(key)) return;

            const href = `${base}styles/components/${key}.css`;
            const existing = document.querySelector(`link[href="${href}"]`);
            if (existing instanceof HTMLLinkElement) {
                this.cssLoaded.add(key);
                return;
            }

            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.setAttribute('data-holi-component-style', key);
            document.head.appendChild(link);
            this.cssLoaded.add(key);
        });
    }

    static hasMatch(root, selector) {
        if (!selector) return false;
        if (root === document) {
            return !!document.querySelector(selector);
        }
        return !!(root.matches?.(selector) || root.querySelector?.(selector));
    }

    static discoverComponentIds(root = document) {
        const ids = new Set();
        this.entryById.forEach((entry) => {
            if (entry.selectors.some((selector) => this.hasMatch(root, selector))) {
                ids.add(entry.id);
            }
        });

        if (this.hasMatch(root, 'page[layout], [component="page"][layout], [role="page"][layout]')) {
            ids.add('page');
            ids.add('layout');
            ids.add('block');
            ids.add('region');
            ids.add('drawer');
        }

        return Array.from(ids);
    }

    static async ensureTemplates(root = document, ids = []) {
        if (!ids.length) return;
        await TemplateRegistry.ensureCoreTemplates();
        const needsLayouts = ids.includes('page')
            || ids.includes('layout')
            || this.hasMatch(root, 'page[layout], [component="page"][layout], [role="page"][layout], layout, [component="layout"], [role="layout"]');
        if (needsLayouts) {
            await TemplateRegistry.ensureLayoutTemplates();
        }
    }

    static async loadById(id) {
        const key = String(id || '').trim().toLowerCase();
        if (!key || this.loaded.has(key)) return null;
        if (this.pending.has(key)) return this.pending.get(key);

        const entry = this.entryById.get(key);
        if (!entry) return null;

        const pending = (async () => {
            this.ensureStyles(entry);
            const mod = await entry.load();
            const ComponentClass = entry.resolve(mod);
            if (typeof ComponentClass !== 'function') {
                throw new Error(`Failed to resolve component "${entry.id}"`);
            }
            HoliApp.registerBuiltIns(ComponentClass);
            this.loaded.add(key);
            return ComponentClass;
        })();

        this.pending.set(key, pending);

        try {
            return await pending;
        } finally {
            this.pending.delete(key);
        }
    }

    static async hydrate(root = document) {
        const ids = this.discoverComponentIds(root);
        if (!ids.length) return [];
        await this.ensureTemplates(root, ids);
        await Promise.all(ids.map((id) => this.loadById(id)));
        return ids;
    }

    static observe(onHydrated) {
        if (this.observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
        this.observer = new MutationObserver((mutations) => {
            const added = new Set();
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof Element) {
                        added.add(node);
                    }
                });
            });

            added.forEach((node) => {
                Promise.resolve(this.hydrate(node))
                    .then(() => onHydrated?.(node))
                    .catch((error) => console.error(error));
            });
        });

        this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }
}

LazyComponentLoader.entryById.forEach((entry) => {
    entry.aliases.forEach((alias) => {
        const value = String(alias || '').trim().toLowerCase();
        if (!value) return;
        LazyComponentLoader.aliasToId.set(value, entry.id);
    });
});

export { LazyComponentLoader };
