import { HoliApp } from './utils/app.js';
import { LocaleRegistry } from './utils/locale_registry.js';
import { ReleaseAssetRegistry } from './utils/release_asset_registry.js';
import { ServiceWorkerManager } from './utils/sw.js';
import { TemplateRegistry } from './utils/template_registry.js';
import { ThemeRegistry } from './utils/theme_registry.js';
import { LazyComponentLoader } from './utils/lazy_component_loader.js';
import './utils/content_provider.js';
import './utils/state.js';
// The client-side router: documented and used by the navigation example, but not in the bundle until now.
import './utils/navigation.js';

const captureBundleBase = () => {
    if (typeof document === 'undefined') return '';
    const script = document.currentScript;
    const src = String(script?.getAttribute?.('src') || '').trim();
    if (!src) return '';
    window.__holiBundleScriptSrc = src;
    const idx = src.lastIndexOf('/');
    const base = idx >= 0 ? src.slice(0, idx + 1) : '';
    if (base) {
        LazyComponentLoader.registerBundleBase(base);
    }
    return base;
};

const initRuntime = async (container = document) => {
    HoliApp.prepareDocumentAssets(container);
    await LazyComponentLoader.hydrate(container);
    HoliApp.init(container);
};

captureBundleBase();

window.HoliApp = { instance: HoliApp, HoliApp, ServiceWorkerManager, ThemeRegistry, LocaleRegistry, ReleaseAssetRegistry, TemplateRegistry };
window.Holi = window.HoliApp;
window.HoliLoader = LazyComponentLoader;

const autoInit = async () => {
    if (window.HoliAutoInit === false) return;
    await initRuntime(document);
    LazyComponentLoader.observe((node) => {
        HoliApp.init(node);
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        autoInit().catch((error) => console.error(error));
    }, { once: true });
} else {
    autoInit().catch((error) => console.error(error));
}
