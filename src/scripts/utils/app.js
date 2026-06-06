
import { ComponentRegistry } from './component_registry.js';
import { ServiceWorkerManager } from './sw.js';
import { ThemeRegistry } from './theme_registry.js';
import { LocaleRegistry } from './locale_registry.js';
import { ReleaseAssetRegistry } from './release_asset_registry.js';

class HoliApp {
    
    static contentProviders = {};
    static swManager = null;
    static builtIns = new Map();
    
    static instance = null;
    static librariesRegistered = false;

    static installPrompt = null;
    static originalManifest = null;
    static dynamicManifest = {};
    static dynamicManifestUrl = '';
    static pwaInitialized = false;
    static boundInstallClick = null;
    static installStatus = {
        supported: typeof window !== 'undefined' && 'serviceWorker' in navigator,
        available: false,
        installed: false,
        standalone: false
    };

    constructor() {
        if (HoliApp.instance) return HoliApp.instance;
        HoliApp.instance = this;
    }

    static registerBuiltIns(components = []) {
        const list = Array.isArray(components) ? components : [components];
        let changed = false;

        list.forEach((ComponentClass) => {
            if (typeof ComponentClass !== 'function') return;
            const key = String(
                ComponentClass.componentName
                || ComponentClass.selector
                || ComponentClass.name
                || ''
            ).trim().toLowerCase();
            if (!key || this.builtIns.has(key)) return;
            this.builtIns.set(key, ComponentClass);
            changed = true;
        });

        if (!changed) return;
        ComponentRegistry.registerLibrary('holi', Array.from(this.builtIns.values()));
        this.librariesRegistered = true;
    }
    
    static ensureLibraries() {
        if (this.librariesRegistered) return;
        if (!this.builtIns.size) return;
        ComponentRegistry.registerLibrary('holi', Array.from(this.builtIns.values()));
        this.librariesRegistered = true;
    }

    static init(container = document) {
        this.ensureLibraries();
        ReleaseAssetRegistry.prepareDocument(container);
        LocaleRegistry.discover(container);
        LocaleRegistry.ensureActiveLocale(container);
        ThemeRegistry.discover(container);
        ThemeRegistry.ensureActiveTheme(container);
        ComponentRegistry.initAll(container);
        ComponentRegistry.observeLifecycle(container);
    }

    static registerLocale(locale = {}, options = {}) {
        return LocaleRegistry.registerLocale(locale, options);
    }

    static registerLocales(locales = [], options = {}) {
        return LocaleRegistry.registerLocales(locales, options);
    }

    static discoverLocales(container = document) {
        return LocaleRegistry.discover(container);
    }

    static getLocale(code) {
        return LocaleRegistry.getLocale(code);
    }

    static getLocales(options = {}) {
        return LocaleRegistry.getLocales(options);
    }

    static setDefaultLocale(code) {
        return LocaleRegistry.setDefaultLocale(code);
    }

    static getDefaultLocale() {
        return LocaleRegistry.getDefaultLocale();
    }

    static getActiveLocale() {
        return LocaleRegistry.getActiveLocale();
    }

    static applyLocale(code, options = {}) {
        return LocaleRegistry.applyLocale(code, options);
    }

    static registerTheme(theme = {}, options = {}) {
        return ThemeRegistry.registerTheme(theme, options);
    }

    static prepareDocumentAssets(container = document) {
        return ReleaseAssetRegistry.prepareDocument(container);
    }

    static registerThemes(themes = [], options = {}) {
        return ThemeRegistry.registerThemes(themes, options);
    }

    static discoverThemes(container = document) {
        return ThemeRegistry.discover(container);
    }

    static getTheme(name) {
        return ThemeRegistry.getTheme(name);
    }

    static getThemes(options = {}) {
        return ThemeRegistry.getThemes(options);
    }

    static setDefaultTheme(name) {
        return ThemeRegistry.setDefaultTheme(name);
    }

    static getDefaultTheme() {
        return ThemeRegistry.getDefaultTheme();
    }

    static getActiveTheme() {
        return ThemeRegistry.getActiveTheme();
    }

    static applyTheme(name, options = {}) {
        return ThemeRegistry.applyTheme(name, options);
    }

    static getServiceWorkerManager(options = {}) {
        if (!this.swManager) {
            this.swManager = ServiceWorkerManager.getInstance(options);
        }
        return this.swManager;
    }
    
    // Site-wide ServiceWorker
    async initServiceWorker(options = {}) {
        const manager = HoliApp.getServiceWorkerManager(options);
        const scriptUrl = options.scriptUrl || '/sw.js';
        const registrationOptions = options.registrationOptions || {};
        await manager.registerWorker(scriptUrl, registrationOptions);
        return manager;
    }

    async registerSWHandlers(handlers = []) {
        const manager = HoliApp.getServiceWorkerManager();
        return manager.registerHandlers(handlers);
    }

    async clearSWHandlers(eventType = null) {
        const manager = HoliApp.getServiceWorkerManager();
        return manager.clearHandlers(eventType);
    }
    
    // Site-wide PWA
    initPWA(options = {}) {
        return HoliApp.initPWA(options);
    }

    static initPWA(options = {}) {
        if (typeof window === 'undefined' || typeof document === 'undefined') return this.installStatus;
        if (this.pwaInitialized) {
            this.bindInstallUI(options.container || document);
            return this.installStatus;
        }

        this.pwaInitialized = true;
        this.installStatus.supported = 'BeforeInstallPromptEvent' in window || 'onbeforeinstallprompt' in window;
        this.installStatus.standalone = this.isStandalone();
        this.installStatus.installed = this.installStatus.standalone;

        // Listen for install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.installPrompt = e;
            this.installStatus.available = true;
            this.installStatus.installed = false;
            this.installStatus.standalone = this.isStandalone();
            this.showInstallUI();
            this.dispatchPWAEvent('pwa:installavailable', {
                prompt: e,
                status: { ...this.installStatus }
            });
        });

        // Handle appinstalled
        window.addEventListener('appinstalled', () => {
            this.installPrompt = null;
            this.installStatus.available = false;
            this.installStatus.installed = true;
            this.installStatus.standalone = true;
            this.hideInstallUI();
            this.dispatchPWAEvent('pwa:installed', {
                status: { ...this.installStatus }
            });
        });

        const displayModeQuery = window.matchMedia?.('(display-mode: standalone)');
        displayModeQuery?.addEventListener?.('change', () => {
            this.installStatus.standalone = this.isStandalone();
            this.syncInstallUI(document);
        });

        this.bindInstallUI(options.container || document);
        if (options.manifest !== false) {
            void this.setPWAManifest(options.manifestConfig || {});
        }
        this.syncInstallUI(document);
        return this.installStatus;
    }

    static async installApp() {
        if (!this.installPrompt) {
            return { outcome: 'unavailable' };
        }

        this.installPrompt.prompt();
        const choice = await this.installPrompt.userChoice;
        const outcome = choice?.outcome || 'dismissed';

        if (outcome === 'accepted') {
            this.installPrompt = null;
            this.installStatus.available = false;
        }

        this.syncInstallUI(document);
        this.dispatchPWAEvent('pwa:installresult', {
            outcome,
            status: { ...this.installStatus }
        });

        return choice || { outcome };
    }

    static async setPWAManifest(customConfig = {}) {
        /*
        customConfig = {
            name: "My Dashboard App",
            short_name: "Dashboard",
            description: "Custom app description",
            start_url: "/my-dashboard",
            icons: [{ src: "/my-icon-512.png", sizes: "512x512" }],
            theme_color: "#dc2626",
            shortcuts: [...]
        }
        */

        if (typeof document === 'undefined') return null;
        if (!this.originalManifest) {
            this.originalManifest = document.querySelector('link[rel="manifest"]:not([data-dynamic])');
        }

        // Merge with defaults
        this.dynamicManifest = {
            name: "HTML First Components",
            short_name: "HF Components",
            start_url: "/",
            display: "standalone",
            background_color: "#ffffff",
            theme_color: "#2563eb",
            ...customConfig
        };

        // Dynamically inject updated manifest
        return this.injectDynamicManifest();
    }

    static async injectDynamicManifest() {
        if (typeof document === 'undefined' || typeof URL === 'undefined') return null;
        // Remove existing dynamic manifest
        const existing = document.querySelector('link[rel="manifest"][data-dynamic]');
        if (existing) existing.remove();
        if (this.dynamicManifestUrl) {
            URL.revokeObjectURL(this.dynamicManifestUrl);
            this.dynamicManifestUrl = '';
        }

        // Create blob with updated manifest
        const manifestBlob = new Blob([
            JSON.stringify(this.dynamicManifest, null, 2)
        ], { type: 'application/json' });

        const manifestUrl = URL.createObjectURL(manifestBlob);
        this.dynamicManifestUrl = manifestUrl;

        // Inject new link tag
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = manifestUrl;
        link.dataset.dynamic = 'true';
        document.head.appendChild(link);

        this.dispatchPWAEvent('pwa:manifestupdated', {
            manifest: { ...this.dynamicManifest }
        });
        return link;
    }

    static bindInstallUI(container = document) {
        if (!(container instanceof Element) && container !== document) return;
        if (!this.boundInstallClick) {
            this.boundInstallClick = (event) => {
                const trigger = event.target?.closest?.('[data-pwa-install]');
                if (!trigger) return;
                event.preventDefault();
                void this.installApp();
            };
        }
        container.removeEventListener?.('click', this.boundInstallClick);
        container.addEventListener?.('click', this.boundInstallClick);
        this.syncInstallUI(container);
    }

    static syncInstallUI(container = document) {
        if (typeof document === 'undefined') return;
        const root = container === document ? document : container;
        const installables = root.querySelectorAll?.('[data-pwa-install]') || [];
        const statusNodes = root.querySelectorAll?.('[data-pwa-install-status]') || [];
        const canInstall = !!this.installPrompt && !this.installStatus.installed;
        const standalone = this.isStandalone();

        this.installStatus.available = canInstall;
        this.installStatus.standalone = standalone;
        this.installStatus.installed = this.installStatus.installed || standalone;

        installables.forEach((node) => {
            const hideWhenUnavailable = node.getAttribute('data-pwa-install-hide') !== 'false';
            node.toggleAttribute('hidden', hideWhenUnavailable && !canInstall);
            node.toggleAttribute('disabled', !canInstall);
            node.setAttribute('data-pwa-install-ready', canInstall ? 'true' : 'false');
            if (!node.getAttribute('aria-label')) {
                node.setAttribute('aria-label', 'Install app');
            }
        });

        statusNodes.forEach((node) => {
            node.textContent = this.getInstallStatusText();
            node.setAttribute('data-pwa-install-state', this.getInstallState());
        });
    }

    static showInstallUI() {
        this.syncInstallUI(document);
    }

    static hideInstallUI() {
        this.syncInstallUI(document);
    }

    static getInstallState() {
        if (this.installStatus.installed || this.isStandalone()) return 'installed';
        if (this.installPrompt) return 'available';
        return 'unavailable';
    }

    static getInstallStatusText() {
        const state = this.getInstallState();
        if (state === 'installed') return 'App installed';
        if (state === 'available') return 'Install available';
        return 'Install unavailable';
    }

    static isStandalone() {
        if (typeof window === 'undefined') return false;
        if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
        return !!window.navigator?.standalone;
    }

    static dispatchPWAEvent(name, detail = {}) {
        if (typeof document === 'undefined') return;
        document.dispatchEvent(new CustomEvent(name, { detail }));
    }

}

if (typeof window !== 'undefined') {
    window.HoliAppClass = HoliApp;
}

export { HoliApp };
