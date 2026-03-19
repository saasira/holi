import { Component } from './component.js';

class PanelComponent extends Component {
    static get selector() {
        return 'panel';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'panel';
    }

    static templateId = 'panel-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = PanelComponent.templateId;
        this.titleText = this.container?.getAttribute('title')
            || this.container?.getAttribute('data-title')
            || '';
        this.subtitleText = this.container?.getAttribute('subtitle')
            || this.container?.getAttribute('data-subtitle')
            || '';
        this.init();
    }

    validateStructure() {
        super.validateStructure();
        if (!this.container) {
            throw new Error('Panel requires a container');
        }
    }

    getBindingContext(extra = {}) {
        return super.getBindingContext({
            title: this.titleText,
            subtitle: this.subtitleText,
            hasTitle: !!this.titleText,
            hasSubtitle: !!this.subtitleText,
            ...extra
        });
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    async render() {
        const sourceNodes = Array.from(this.container.childNodes);
        await super.render();
        this.element = this.container.querySelector('.holi-panel');
        this.header = this.container.querySelector('[data-role="panel-header"]');
        this.title = this.container.querySelector('[data-role="panel-title"]');
        this.subtitle = this.container.querySelector('[data-role="panel-subtitle"]');
        this.content = this.container.querySelector('[data-role="panel-content"]');
        this.footer = this.container.querySelector('[data-role="panel-footer"]');

        if (this.content) {
            this.content.replaceChildren(...sourceNodes);
            await this.createChildren();
            this.syncChildren();
        }

        this.projectSlot('header');
        this.projectSlot('footer');
        this.applyPanelState();
        await this.createChildren();
        this.syncChildren();
    }

    projectSlot(name) {
        const target = this.container.querySelector(`[data-role="panel-${name}"]`);
        if (!target) return;

        const slotted = Array.from(this.container.querySelectorAll(`[slot="${name}"]`));
        if (!slotted.length) {
            if ((name === 'header' && !this.titleText && !this.subtitleText) || name === 'footer') {
                target.hidden = true;
            }
            return;
        }

        const fragment = document.createDocumentFragment();
        slotted.forEach((node) => {
            node.removeAttribute('slot');
            fragment.appendChild(node);
        });
        target.hidden = false;
        target.replaceChildren(fragment);
    }

    applyPanelState() {
        if (this.header) {
            const hasHeaderContent = this.header.childNodes.length > 0;
            const hasTextHeader = !!this.titleText || !!this.subtitleText;
            this.header.hidden = !hasHeaderContent && !hasTextHeader;
        }
        if (this.title) {
            this.title.hidden = !this.titleText;
            this.title.textContent = this.titleText;
        }
        if (this.subtitle) {
            this.subtitle.hidden = !this.subtitleText;
            this.subtitle.textContent = this.subtitleText;
        }
        if (this.footer && this.footer.childNodes.length === 0) {
            this.footer.hidden = true;
        }
    }

    refreshPpr(payload = {}) {
        this.syncChildren();
        let handledByChild = false;
        this.children.forEach((child) => {
            if (!child || child.isDestroyed) return;
            if (child === payload?.sourceComponent || child.container === payload?.sourceElement) return;
            const delegatedPayload = {
                ...payload,
                panelComponent: this,
                targetElement: child.container,
                targetComponent: child,
                delegatedByPanel: true
            };
            if (typeof child.receiveDependencyUpdate === 'function') {
                child.receiveDependencyUpdate(delegatedPayload);
                handledByChild = true;
                return;
            }
            if (typeof child.handlePprUpdate === 'function') {
                child.handlePprUpdate(delegatedPayload);
                handledByChild = true;
            }
        });

        if (!handledByChild) {
            this.refresh();
        }
    }
}

if (typeof window !== 'undefined') {
    window.PanelComponent = PanelComponent;
}

export { PanelComponent };
