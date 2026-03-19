
// Auto-import all components
const componentsContext = require.context('./components', true, /\.js$/);
//const utilsContext = require.context('./utils', false, /\.js$/);

// Core component styles bundled into dist/holi.css
import '../styles/components/accordion.css';
import '../styles/components/calendar.css';
import '../styles/components/carousel.css';
import '../styles/components/chart.css';
import '../styles/components/breadcrumbs.css';
import '../styles/components/backtotop.css';
import '../styles/components/button.css';
import '../styles/components/radio.css';
import '../styles/components/datagrid.css';
import '../styles/components/datatable.css';
import '../styles/components/details.css';
import '../styles/components/dialog.css';
import '../styles/components/dropdown.css';
import '../styles/components/drawer.css';
import '../styles/components/gallery.css';
import '../styles/components/input.css';
import '../styles/components/layout.css';
import '../styles/components/loader.css';
import '../styles/components/menubar.css';
import '../styles/components/panel.css';
import '../styles/components/checkbox.css';
import '../styles/components/progress.css';
import '../styles/components/search.css';
import '../styles/components/select.css';
import '../styles/components/statscard.css';
import '../styles/components/toast.css';
import '../styles/components/form.css';
import '../styles/components/tree.css';
import '../styles/components/treepanel.css';
import '../styles/components/tabs.css';
import '../styles/components/wizard.css';

// Register library
import { HoliApp } from './utils/app.js';
import { ServiceWorkerManager } from './utils/sw.js';
import './utils/content_provider.js';
import './utils/state.js';

// Export for global use
window.HoliApp = { HoliApp, ServiceWorkerManager };
window.Holi = window.HoliApp;

const hasCoreTemplates = () => {
    return !!document.getElementById('tabs');
};

const resolveTemplateUrls = () => {
    const urls = new Set(['/dist/holi.html', '/holi.html']);
    const currentScript = document.currentScript;
    const src = currentScript?.getAttribute('src') || '';
    if (src) {
        const base = src.replace(/holi\.js(\?.*)?$/i, '');
        if (base) urls.add(`${base}holi.html`);
    }
    return Array.from(urls);
};

const injectTemplates = (htmlText) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = htmlText;
    const templates = wrapper.querySelectorAll('template[id]');
    templates.forEach((tpl) => {
        if (!document.getElementById(tpl.id)) {
            document.body.appendChild(tpl);
        }
    });
};

const ensureTemplateLibrary = async () => {
    if (hasCoreTemplates()) return;
    if (window.__holiTemplatesLoading) {
        await window.__holiTemplatesLoading;
        return;
    }

    window.__holiTemplatesLoading = (async () => {
        const urls = resolveTemplateUrls();
        for (let i = 0; i < urls.length; i += 1) {
            const url = urls[i];
            try {
                const response = await fetch(url, { credentials: 'same-origin' });
                if (!response.ok) continue;
                const html = await response.text();
                injectTemplates(html);
                if (hasCoreTemplates()) return;
            } catch (_error) {}
        }
        throw new Error('Holi template library not found (holi.html)');
    })();

    await window.__holiTemplatesLoading;
};

const autoInit = async () => {
    if (window.HoliAutoInit === false) return;
    await ensureTemplateLibrary();
    HoliApp.init(document);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        autoInit().catch((error) => console.error(error));
    }, { once: true });
} else {
    autoInit().catch((error) => console.error(error));
}
