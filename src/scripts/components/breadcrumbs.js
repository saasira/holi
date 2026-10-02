import { Component } from './component.js';

class BreadCrumbsComponent extends Component {
    static get selector() {
        return 'breadcrumbs';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'breadcrumbs';
    }

    static templateId = 'breadcrumbs';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = BreadCrumbsComponent.templateId;
        this.crumbs = this.buildCrumbs();
        this.boundClick = (event) => this.handleClick(event);
        this.initComponent();
    }

    buildCrumbs(pathname = '') {
        const sourcePath = pathname || (typeof window !== 'undefined' ? window.location?.pathname : '/') || '/';
        const parts = String(sourcePath)
            .split('/')
            .map((part) => part.trim())
            .filter(Boolean);

        let path = '';
        return parts.map((part) => {
            path += `/${this.formatCrumbPath(part)}`;
            return {
                key: this.formatCrumbKey(part),
                value: path
            };
        });
    }

    formatCrumbKey(part) {
        try {
            return decodeURIComponent(String(part || ''));
        } catch (_error) {
            return String(part || '');
        }
    }

    formatCrumbPath(part) {
        try {
            return encodeURIComponent(decodeURIComponent(String(part || '')));
        } catch (_error) {
            return encodeURIComponent(String(part || ''));
        }
    }

    async afterRender() {
        this.element = this.container.querySelector('.journey');
        this.element?.addEventListener('click', this.boundClick);
    }

    handleClick(event) {
        const link = event.target.closest('.journey a');
        if (!link || !this.container.contains(link)) return;
        const item = this.crumbs.find((crumb) => crumb.value === link.getAttribute('href')) || null;

        this.dispatchEvent('breadcrumbclick', {
            item,
            href: link.getAttribute('href') || ''
        });
    }

    destroy() {
        this.element?.removeEventListener('click', this.boundClick);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.BreadCrumbsComponent = BreadCrumbsComponent;
}

export { BreadCrumbsComponent };
