import { Component } from './component.js';

class BackToTopComponent extends Component {
    static get selector() {
        return 'backtotop';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'backtotop';
    }

    static templateId = 'backtotop-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = BackToTopComponent.templateId;
        this.config = {
            anchor: this.readAttr(['anchor', 'target', 'href', 'data-anchor'], ''),
            label: this.readAttr(['label', 'data-label'], 'Back to top'),
            ariaLabel: this.readAttr(['aria-label', 'data-aria-label'], 'Back to top'),
            showAfter: Math.max(0, Number(this.readAttr(['show-after', 'data-show-after'], '240')) || 240),
            behavior: this.readAttr(['behavior', 'data-behavior'], 'smooth'),
            vertical: this.readAttr(['vertical', 'data-vertical'], ''),
            alwaysVisible: this.readBoolAttr(['always-visible', 'data-always-visible'], false)
        };
        this.state = {
            label: this.config.label,
            ariaLabel: this.config.ariaLabel,
            visible: this.config.alwaysVisible
        };
        this.boundScroll = () => this.handleScroll();
        this.boundClick = (event) => this.handleClick(event);
        this.init();
    }

    readAttr(names, fallback = '') {
        for (let i = 0; i < names.length; i += 1) {
            const value = this.container.getAttribute(names[i]);
            if (value != null && String(value).trim() !== '') return String(value).trim();
        }
        return fallback;
    }

    readBoolAttr(names, fallback = false) {
        for (let i = 0; i < names.length; i += 1) {
            const name = names[i];
            if (!this.container.hasAttribute(name)) continue;
            const value = String(this.container.getAttribute(name) || '').trim().toLowerCase();
            if (!value) return true;
            return value !== 'false' && value !== '0' && value !== 'no';
        }
        return fallback;
    }

    init() {
        this.validateStructure();
        void this.render();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-backtotop');
        this.buttonEl = this.container.querySelector('[data-role="button"]');

        this.projectSlot('prefix');
        this.projectSlot('label');
        this.projectSlot('suffix');

        this.applyPosition();
        this.buttonEl?.addEventListener('click', this.boundClick);
        window.addEventListener('scroll', this.boundScroll, { passive: true });
        this.handleScroll();
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

    applyPosition() {
        if (!this.element) return;
        const resolved = this.resolveVertical(this.config.vertical);
        if (!resolved) {
            this.element.style.removeProperty('top');
            this.element.style.removeProperty('bottom');
            return;
        }
        this.element.style.top = resolved;
        this.element.style.bottom = 'auto';
    }

    resolveVertical(raw) {
        const value = String(raw || '').trim().toLowerCase();
        if (!value || value === 'bottom') return '';
        if (value === 'middle' || value === 'center') return '50%';
        if (/^\d+(\.\d+)?%$/.test(value)) return value;
        if (/^\d+(\.\d+)?px$/.test(value)) return value;
        return '';
    }

    handleScroll() {
        const visible = this.config.alwaysVisible || window.scrollY >= this.config.showAfter;
        this.state.visible = visible;
        this.element?.classList.toggle('is-visible', visible);
        if (this.element) this.element.hidden = !visible;
    }

    resolveAnchorTarget() {
        const raw = String(this.config.anchor || '').trim();
        if (raw) {
            const id = raw.startsWith('#') ? raw.slice(1) : '';
            if (id) {
                const byId = document.getElementById(id);
                if (byId) return byId;
            }
            const selected = document.querySelector(raw);
            if (selected) return selected;
        }

        const bodyChildren = Array.from(document.body?.children || []);
        const fallback = bodyChildren.find((node) => {
            if (!(node instanceof HTMLElement)) return false;
            if (node === this.container) return false;
            const tag = node.tagName.toLowerCase();
            return tag !== 'script' && tag !== 'template';
        });
        return fallback || document.documentElement;
    }

    scrollToTop() {
        const target = this.resolveAnchorTarget();
        const behavior = this.config.behavior === 'auto' ? 'auto' : 'smooth';
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior, block: 'start', inline: 'nearest' });
            return;
        }
        window.scrollTo({ top: 0, behavior });
    }

    handleClick(event) {
        event.preventDefault();
        this.scrollToTop();
        this.dispatchEvent('backtotopclick', {
            anchor: this.config.anchor || '',
            visible: this.state.visible
        });
    }

    destroy() {
        this.buttonEl?.removeEventListener('click', this.boundClick);
        window.removeEventListener('scroll', this.boundScroll);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.BackToTopComponent = BackToTopComponent;
}

export { BackToTopComponent };
