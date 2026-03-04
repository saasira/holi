
import { ComponentRegistry } from './component_registry.js';
import { TabsComponent } from '../components/tabs.js';
import { DataTable } from '../components/datatable.js';
import { DataGrid } from '../components/datagrid.js';
import { DropdownComponent } from '../components/dropdown.js';
import { SelectComponent } from '../components/select.js';
import { InputComponent } from '../components/input.js';
import { CheckboxGroupComponent } from '../components/checkbox.js';
import { FormComponent } from '../components/form.js';
import { RadioGroupComponent } from '../components/radio.js';
import { ButtonComponent } from '../components/button.js';
import { LayoutComponent } from '../components/layout.js';
import { LoaderComponent } from '../components/loader.js';
import { BlockComponent } from '../components/block.js';
import { RegionComponent } from '../components/region.js';
import { AccordionComponent } from '../components/accordion.js';
import { CalendarComponent } from '../components/calendar.js';
import { CarouselComponent } from '../components/carousel.js';
import { BreadCrumbsComponent } from '../components/breadcrumbs.js';
import { BackToTopComponent } from '../components/backtotop.js';
import { ChartComponent } from '../components/chart.js';
import { DialogComponent } from '../components/dialog.js';
import { ToastComponent } from '../components/toast.js';
import { DrawerComponent } from '../components/drawer.js';
import { GalleryComponent } from '../components/gallery.js';
import { MenubarComponent } from '../components/menubar.js';
import { TreeComponent } from '../components/tree.js';
import { TreePanelComponent } from '../components/treepanel.js';
import { SearchComponent } from '../components/search.js';
import { WizardComponent } from '../components/wizard.js';
import { StatsCard } from '../components/statscard.js';

class HoliApp {
    
    static contentProviders = {};
    
    static instance = null;
    static librariesRegistered = false;
    
    constructor() {
        if (HoliApp.instance) return HoliApp.instance;
        HoliApp.instance = this;
    }
    
    static ensureLibraries() {
        if (this.librariesRegistered) return;
        const builtIns = [LayoutComponent, LoaderComponent, BlockComponent, RegionComponent, AccordionComponent, CalendarComponent, CarouselComponent, BreadCrumbsComponent, BackToTopComponent, ChartComponent, TabsComponent, DataTable, DataGrid, DropdownComponent, SelectComponent, InputComponent, CheckboxGroupComponent, RadioGroupComponent, ButtonComponent, FormComponent, DialogComponent, ToastComponent, DrawerComponent, GalleryComponent, MenubarComponent, TreeComponent, TreePanelComponent, SearchComponent, WizardComponent, StatsCard].filter(Boolean);
        ComponentRegistry.registerLibrary('holi', builtIns);
        this.librariesRegistered = true;
    }

    static init(container = document) {
        this.ensureLibraries();
        ComponentRegistry.initAll(container);
        ComponentRegistry.observeLifecycle(container);
    }
    
    // Site-wide i18n
    async initI18n() {
        this.currentLang = document.documentElement.lang || 'en-US';
        await this.loadDict(this.currentLang);
    }
    
    async getText(namespace, key, params = {}) {
        // Site-wide dictionary lookup
        const dict = await this.getDict(namespace);
        let text = dict[key] || key;
        return text.replace(/{{(\w+)}}/g, (_, p) => params[p] || '');
    }
    
    // Site-wide themes
    initThemes() {
        this.currentPalette = document.documentElement.getAttribute('theme-palette') || 'presto';
        this.activateThemePalette(this.currentPalette);
        
        // Listen for changes
        document.addEventListener('theme-palette-change', (e) => {
            this.activateThemePalette(e.detail.palette);
        });
    }
    
    // Site-wide ServiceWorker
    initServiceWorker() {
        Component.initServiceWorker(); // Legacy call
        this.registerSWHandlers();
    }
    
    // Site-wide PWA
    initPWA() {
        this.initInstallPrompt();
        this.setPWAManifest(); // HoliApp-specific override
    }
}

if (typeof window !== 'undefined') {
    window.HoliAppClass = HoliApp;
}

export { HoliApp };
