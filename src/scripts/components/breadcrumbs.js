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

    static templateId = 'breadcrumbs-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = BreadCrumbsComponent.templateId;
        this.separator = this.container.getAttribute('separator') || '/';
        this.maxItems = Math.max(0, Number(this.container.getAttribute('max-items')) || 0);
        this.items = [];
        this.boundClick = (event) => this.handleClick(event);
        this.init();
    }

    validateStructure() {
        super.validateStructure();
    }

    async init() {
        this.items = this.collectItems();
        this.validateStructure();
        await this.render();
    }

    parseItemsAttr() {
        const raw = String(this.container.getAttribute('data-items') || '').trim();
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            return [];
        }
    }

    collectItems() {
        const fromAttr = this.parseItemsAttr();
        if (fromAttr.length) return this.normalizeItems(fromAttr);

        const sourceList = this.container.querySelector('[slot="items"]') || this.container.querySelector('ol, ul');
        if (!sourceList) return [];
        const liItems = Array.from(sourceList.querySelectorAll(':scope > li'));
        const extracted = liItems.map((li) => {
            const anchor = li.querySelector('a');
            const label = String(anchor?.textContent || li.textContent || '').trim();
            const href = anchor?.getAttribute('href') || '';
            const current = li.hasAttribute('aria-current')
                || li.getAttribute('data-current') === 'true'
                || anchor?.getAttribute('aria-current') === 'page';
            return { label, href, current };
        });

        sourceList.remove();
        return this.normalizeItems(extracted);
    }

    normalizeItems(items) {
        const normalized = (items || []).map((item) => {
            if (item && typeof item === 'object') {
                return {
                    label: String(item.label || item.name || item.title || '').trim(),
                    href: String(item.href || item.url || '').trim(),
                    current: !!item.current
                };
            }
            return {
                label: String(item || '').trim(),
                href: '',
                current: false
            };
        }).filter((item) => item.label);

        if (!normalized.length) return normalized;
        if (!normalized.some((item) => item.current)) {
            normalized[normalized.length - 1].current = true;
        }
        return normalized;
    }

    getVisibleItems() {
        if (!this.maxItems || this.items.length <= this.maxItems) return this.items;
        if (this.maxItems < 3) return this.items.slice(0, this.maxItems);
        return [
            this.items[0],
            { label: '...', href: '', current: false, ellipsis: true },
            ...this.items.slice(this.items.length - (this.maxItems - 2))
        ];
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-breadcrumbs');
        this.list = this.container.querySelector('[data-role="list"]');
        if (!this.element || !this.list) return;

        this.projectSlot('prefix');
        this.projectSlot('suffix');
        this.applySeparator();
        this.renderItems();
        this.list.addEventListener('click', this.boundClick);
    }

    projectSlot(name) {
        const slotNode = this.container.querySelector(`slot[name="${name}"]`);
        if (!slotNode) return;
        const slotted = Array.from(this.container.querySelectorAll(`[slot="${name}"]`));
        if (!slotted.length) return;

        const fragment = document.createDocumentFragment();
        slotted.forEach((node) => {
            node.removeAttribute('slot');
            fragment.appendChild(node);
        });
        slotNode.replaceWith(fragment);
    }

    applySeparator() {
        const value = String(this.separator || '/').replace(/["\\]/g, '\\$&');
        this.element.style.setProperty('--holi-breadcrumb-separator', `"${value}"`);
    }

    renderItems() {
        if (!this.list) return;
        this.list.replaceChildren();
        const visible = this.getVisibleItems();

        visible.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'holi-breadcrumb-item';
            li.setAttribute('data-index', String(index));

            if (item.ellipsis) {
                const span = document.createElement('span');
                span.className = 'holi-breadcrumb-ellipsis';
                span.textContent = item.label;
                li.appendChild(span);
                this.list.appendChild(li);
                return;
            }

            if (item.current || !item.href) {
                const span = document.createElement('span');
                span.className = 'holi-breadcrumb-current';
                span.textContent = item.label;
                if (item.current) span.setAttribute('aria-current', 'page');
                li.appendChild(span);
            } else {
                const link = document.createElement('a');
                link.className = 'holi-breadcrumb-link';
                link.href = item.href;
                link.textContent = item.label;
                li.appendChild(link);
            }

            this.list.appendChild(li);
        });
    }

    handleClick(event) {
        const link = event.target.closest('a.holi-breadcrumb-link');
        if (!link) return;
        const itemEl = link.closest('.holi-breadcrumb-item');
        const index = Number(itemEl?.getAttribute('data-index') || '-1');
        const item = this.getVisibleItems()[index];
        this.dispatchEvent('breadcrumbclick', {
            index,
            item: item || null,
            href: link.getAttribute('href') || ''
        });
    }

    destroy() {
        this.list?.removeEventListener('click', this.boundClick);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.BreadCrumbsComponent = BreadCrumbsComponent;
}

export { BreadCrumbsComponent };
