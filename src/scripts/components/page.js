class Page extends Component {
    constructor(container, options) {
        super(container, options);
        this.app = HoliApp.instance || new HoliApp();
    }

    validateStructure() {}
    
    async render() {
        if (!this.element) {
            this.element = this.container?.querySelector('#holi-page') || document.createElement('div');
            this.element.id = 'holi-page';
            if (!this.element.parentElement) {
                (this.container || document.body).appendChild(this.element);
            }
        }
        
        // Page-specific setup using app services
        await this.renderHeader();
        await this.renderContent();
        await this.renderFooter();
    }
    
    async renderHeader() {
        this.header = new Holi.Header({ container: this.element });
        await this.header.render();
    }
    
    async renderContent() {
        //content area preferably uses "main" tag
        // Create reusable children
        //this.dashboard = new Holi.Dashboard({ container: this.element });
        //await this.dashboard.render();
    }
    
    async renderFooter() {
        this.footer = new Holi.Footer({ container: this.element });
        await this.footer.render();
    }
    
    // Page lifecycle delegates to children
    async refresh() {
        await this.dashboard?.refresh?.();
    }
}
