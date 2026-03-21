
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
import '../styles/components/rating.css';
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
import '../styles/components/offline.css';
import '../styles/components/refresh.css';
import '../styles/components/localeswitcher.css';
import '../styles/components/menubar.css';
import '../styles/components/page.css';
import '../styles/components/panel.css';
import '../styles/components/checkbox.css';
import '../styles/components/progress.css';
import '../styles/components/search.css';
import '../styles/components/select.css';
import '../styles/components/statscard.css';
import '../styles/components/toast.css';
import '../styles/components/form.css';
import '../styles/components/themeswitcher.css';
import '../styles/components/tree.css';
import '../styles/components/treepanel.css';
import '../styles/components/tabs.css';
import '../styles/components/wizard.css';

// Register library
import { HoliApp } from './utils/app.js';
import { ServiceWorkerManager } from './utils/sw.js';
import { TemplateRegistry } from './utils/template_registry.js';
import './utils/content_provider.js';
import './utils/state.js';

// Export for global use
window.HoliApp = { instance: HoliApp, HoliApp, ServiceWorkerManager };
window.Holi = window.HoliApp;

const ensureTemplateLibrary = async () => {
    if (window.__holiTemplatesLoading) {
        await window.__holiTemplatesLoading;
        return;
    }

    window.__holiTemplatesLoading = (async () => {
        await TemplateRegistry.ensureCoreTemplates();
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
