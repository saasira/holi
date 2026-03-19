import { Component } from './component.js';

class MenubarComponent extends Component {
    static get selector() {
        return 'menubar';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'menubar';
    }

    static templateId = 'menubar-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = MenubarComponent.templateId;
        this.baseMode = this.resolveMode(container);
        this.mode = this.baseMode;
        this.mobileBreakpoint = this.parseNumber(container.getAttribute('mobile-breakpoint'), 768);
        this.mobileToggleMode = this.resolveMobileToggleMode(container);
        this.responsiveMenuEnabled = this.baseMode === 'bar' && !container.hasAttribute('disable-mobile-menu');
        this.openOnClick = container.hasAttribute('open-on-click');
        this.hoverCloseDelay = this.parseNumber(container.getAttribute('hover-close-delay'), 150);
        this.isOpen = false;
        this.element = null;
        this.menuRoot = null;
        this.menuHost = null;
        this.toggleButton = null;
        this.boundOutsideClick = null;
        this.boundViewportChange = null;
        this.boundContainerResize = null;
        this.resizeObserver = null;
        this.closeTimer = null;
        this.init();
    }

    resolveMode(container) {
        const explicit = String(container.getAttribute('mode') || '').trim().toLowerCase();
        if (explicit === 'single' || explicit === 'button') return 'single';
        if (container.hasAttribute('single-button') || container.hasAttribute('menu-button')) return 'single';
        return 'bar';
    }

    parseNumber(value, fallback) {
        const next = Number(value);
        return Number.isFinite(next) ? next : fallback;
    }

    resolveMobileToggleMode(container) {
        const value = String(
            container.getAttribute('data-mobile-toggle') ||
            container.getAttribute('mobile-toggle') ||
            'button'
        ).trim().toLowerCase();
        return value === 'icon' ? 'icon' : 'button';
    }

    validateStructure() {
        super.validateStructure();
        const hasMenu =
            !!this.container.querySelector('[slot="menu"]') ||
            !!this.container.querySelector('ul') ||
            !!this.container.querySelector('ol');
        if (!hasMenu) {
            throw new Error('Menubar requires menu markup in slot="menu".');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
        this.bindEvents();
    }

    async render() {
        const sourceMenu = this.container.querySelector('[slot="menu"]') || this.container.querySelector('ul, ol');
        await super.render();
        this.element = this.container.querySelector('.holi-menubar');
        this.menuHost = this.container.querySelector('[data-role="menu-host"]');
        this.toggleButton = this.container.querySelector('[data-role="toggle"]');
        this.element?.setAttribute('data-mode', this.mode);
        this.element?.setAttribute('data-open-on-click', this.openOnClick ? 'true' : 'false');

        if (sourceMenu && this.menuHost) {
            this.menuHost.replaceChildren(sourceMenu);
        }

        const explicitLabel = this.container.getAttribute('label');
        if (explicitLabel && this.toggleButton) {
            this.toggleButton.textContent = explicitLabel;
        }

        this.prepareMenuTree();
        this.applyTogglePresentation();
        this.applyResponsiveMode();
        this.applyMode();
    }

    prepareMenuTree() {
        const root = this.menuHost?.querySelector('ul, ol, [role="menu"]');
        if (!root) return;
        this.menuRoot = root;
        this.menuRoot.classList.add('holi-menu-level', 'holi-menu-root');
        this.menuRoot.setAttribute('role', this.mode === 'bar' ? 'menubar' : 'menu');
        this.decorateLevel(this.menuRoot, true);
        this.closeAllSubmenus();
    }

    decorateLevel(level, isRoot) {
        const items = Array.from(level.children).filter((node) => node.tagName === 'LI');
        items.forEach((item) => {
            item.classList.add('holi-menu-item');
            const trigger = this.getTrigger(item);
            const submenu = this.getSubmenu(item);
            if (!trigger) return;

            trigger.classList.add('holi-menu-trigger');
            trigger.setAttribute('role', 'menuitem');
            trigger.setAttribute('tabindex', isRoot ? '0' : '-1');

            if (submenu) {
                item.classList.add('has-submenu');
                submenu.classList.add('holi-menu-level', 'holi-submenu');
                submenu.setAttribute('role', 'menu');
                submenu.hidden = true;
                trigger.setAttribute('aria-haspopup', 'true');
                trigger.setAttribute('aria-expanded', 'false');
                this.decorateLevel(submenu, false);
            }
        });
    }

    getTrigger(item) {
        const directChildren = Array.from(item.children);
        for (let i = 0; i < directChildren.length; i += 1) {
            const child = directChildren[i];
            const tag = child.tagName;
            if (tag === 'A' || tag === 'BUTTON' || child.hasAttribute('data-menu-trigger')) {
                return child;
            }
        }
        return null;
    }

    getSubmenu(item) {
        const directChildren = Array.from(item.children);
        for (let i = 0; i < directChildren.length; i += 1) {
            const child = directChildren[i];
            const tag = child.tagName;
            if (tag === 'UL' || tag === 'OL') {
                return child;
            }
        }
        return null;
    }

    applyMode() {
        if (!this.toggleButton || !this.menuRoot) return;
        this.element?.setAttribute('data-mode', this.mode);
        this.menuRoot.setAttribute('role', this.mode === 'bar' ? 'menubar' : 'menu');
        this.isOpen = false;
        this.element?.setAttribute('data-open', 'false');
        this.closeAllSubmenus();
        this.applyTogglePresentation();
        if (this.mode === 'single') {
            this.toggleButton.hidden = false;
            this.toggleButton.setAttribute('aria-expanded', 'false');
            this.menuRoot.hidden = true;
            this.menuRoot.setAttribute('aria-hidden', 'true');
        } else {
            this.toggleButton.hidden = true;
            this.toggleButton.setAttribute('aria-expanded', 'false');
            this.menuRoot.hidden = false;
            this.menuRoot.setAttribute('aria-hidden', 'false');
        }
    }

    applyTogglePresentation() {
        if (!this.toggleButton) return;
        const label = String(this.container.getAttribute('label') || 'Menu').trim() || 'Menu';
        const iconLabel = String(this.container.getAttribute('mobile-icon-label') || label).trim() || 'Menu';
        this.toggleButton.setAttribute('data-toggle-appearance', this.mobileToggleMode);
        this.toggleButton.setAttribute('title', this.mobileToggleMode === 'icon' ? iconLabel : '');
        this.toggleButton.setAttribute('aria-label', this.mobileToggleMode === 'icon' ? iconLabel : label);
        this.toggleButton.textContent = this.mobileToggleMode === 'icon' ? '' : label;
    }

    applyResponsiveMode() {
        if (!this.responsiveMenuEnabled || !this.menuRoot) return;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const containerWidth = this.container.getBoundingClientRect?.().width || viewportWidth;
        const effectiveWidth = Math.min(viewportWidth, containerWidth);
        const nextMode = effectiveWidth <= this.mobileBreakpoint ? 'single' : this.baseMode;
        if (nextMode === this.mode) return;
        this.mode = nextMode;
        this.applyMode();
    }

    bindEvents() {
        if (!this.element || !this.menuRoot) return;

        this.element.addEventListener('click', (event) => {
            const toggle = event.target.closest('[data-role="toggle"]');
            if (toggle) {
                event.preventDefault();
                this.toggleMenu();
                return;
            }

            const trigger = event.target.closest('.holi-menu-trigger');
            if (!trigger) return;
            const item = trigger.closest('.holi-menu-item');
            const submenu = this.getSubmenu(item);
            if (submenu) {
                event.preventDefault();
                this.toggleSubmenu(item);
                return;
            }

            if (this.mode === 'single') {
                this.closeMenu();
            } else {
                this.closeAllSubmenus();
            }
        });

        if (!this.openOnClick) {
            this.element.addEventListener('mouseover', (event) => {
                if (this.mode !== 'bar') return;
                this.cancelScheduledClose();
                const trigger = event.target.closest('.holi-menu-trigger');
                if (!trigger) return;
                const item = trigger.closest('.holi-menu-item');
                if (!this.getSubmenu(item)) return;
                this.openSubmenuBranch(item);
            });
        }

        this.element.addEventListener('focusin', (event) => {
            if (this.mode !== 'bar') return;
            this.cancelScheduledClose();
            const trigger = event.target.closest('.holi-menu-trigger');
            if (!trigger) return;
            const item = trigger.closest('.holi-menu-item');
            if (!this.getSubmenu(item)) return;
            this.openSubmenuBranch(item);
        });

        this.element.addEventListener('mouseleave', () => {
            if (this.mode !== 'bar') return;
            this.scheduleCloseAllSubmenus();
        });

        this.element.addEventListener('mouseenter', () => {
            if (this.mode !== 'bar') return;
            this.cancelScheduledClose();
        });

        this.element.addEventListener('keydown', (event) => this.handleKeydown(event));

        this.boundOutsideClick = (event) => {
            if (this.container.contains(event.target)) return;
            this.closeAllSubmenus();
            if (this.mode === 'single') this.closeMenu();
        };
        document.addEventListener('click', this.boundOutsideClick);

        if (this.responsiveMenuEnabled) {
            this.boundViewportChange = () => this.applyResponsiveMode();
            window.addEventListener('resize', this.boundViewportChange);
            if (typeof ResizeObserver !== 'undefined') {
                this.boundContainerResize = () => this.applyResponsiveMode();
                this.resizeObserver = new ResizeObserver(this.boundContainerResize);
                this.resizeObserver.observe(this.container);
            }
        }
    }

    handleKeydown(event) {
        const trigger = event.target.closest('.holi-menu-trigger');
        if (!trigger) {
            if (event.key === 'Escape') {
                this.closeAllSubmenus();
                if (this.mode === 'single') this.closeMenu();
            }
            return;
        }

        if (event.key === 'Escape') {
            this.closeAllSubmenus();
            if (this.mode === 'single') this.closeMenu();
            this.toggleButton?.focus();
            return;
        }

        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            const isTopLevel = !!trigger.closest('.holi-menu-root');
            if (!isTopLevel) return;
            event.preventDefault();
            this.moveTopLevelFocus(trigger, event.key === 'ArrowRight' ? 1 : -1);
            return;
        }

        if (event.key === 'ArrowDown') {
            const item = trigger.closest('.holi-menu-item');
            const submenu = this.getSubmenu(item);
            if (!submenu) return;
            event.preventDefault();
            this.openSubmenuBranch(item);
            const firstItem = Array.from(submenu.children).find((node) => node.classList?.contains('holi-menu-item'));
            const first = firstItem ? this.getTrigger(firstItem) : null;
            first?.focus();
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            const item = trigger.closest('.holi-menu-item');
            const submenu = this.getSubmenu(item);
            if (!submenu) return;
            event.preventDefault();
            this.toggleSubmenu(item);
        }
    }

    moveTopLevelFocus(currentTrigger, step) {
        if (!this.menuRoot) return;
        const topLevel = Array.from(this.menuRoot.children)
            .filter((node) => node.classList?.contains('holi-menu-item'))
            .map((node) => this.getTrigger(node))
            .filter(Boolean);
        if (!topLevel.length) return;
        const index = topLevel.indexOf(currentTrigger);
        if (index < 0) return;
        const next = (index + step + topLevel.length) % topLevel.length;
        topLevel[next]?.focus();
    }

    toggleMenu() {
        if (this.isOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    openMenu() {
        if (this.mode !== 'single' || !this.menuRoot) return;
        this.isOpen = true;
        this.menuRoot.hidden = false;
        this.menuRoot.setAttribute('aria-hidden', 'false');
        this.toggleButton?.setAttribute('aria-expanded', 'true');
        this.element?.setAttribute('data-open', 'true');
    }

    closeMenu() {
        if (this.mode !== 'single' || !this.menuRoot) return;
        this.isOpen = false;
        this.closeAllSubmenus();
        this.menuRoot.hidden = true;
        this.menuRoot.setAttribute('aria-hidden', 'true');
        this.toggleButton?.setAttribute('aria-expanded', 'false');
        this.element?.setAttribute('data-open', 'false');
    }

    toggleSubmenu(item) {
        const submenu = this.getSubmenu(item);
        if (!submenu) return;
        if (submenu.hidden) {
            this.openSubmenuBranch(item);
        } else {
            this.closeSubmenu(item);
        }
    }

    openSubmenuBranch(item) {
        const path = this.getItemPath(item);
        this.closeAllSubmenus(path);

        path.forEach((node) => {
            const submenu = this.getSubmenu(node);
            const trigger = this.getTrigger(node);
            if (!submenu || !trigger) return;
            submenu.hidden = false;
            node.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
            this.applySubmenuAlignment(node);
        });
    }

    closeSubmenu(item) {
        const submenu = this.getSubmenu(item);
        const trigger = this.getTrigger(item);
        if (!submenu || !trigger) return;

        Array.from(submenu.querySelectorAll('.holi-menu-item')).forEach((nested) => {
            const nestedSubmenu = this.getSubmenu(nested);
            const nestedTrigger = this.getTrigger(nested);
            if (nestedSubmenu) nestedSubmenu.hidden = true;
            if (nestedTrigger) nestedTrigger.setAttribute('aria-expanded', 'false');
            nested.classList.remove('open');
        });

        submenu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        item.classList.remove('open');
    }

    closeAllSubmenus(preservePath = []) {
        if (!this.menuRoot) return;
        const keep = new Set(preservePath);
        Array.from(this.menuRoot.querySelectorAll('.holi-menu-item.has-submenu')).forEach((item) => {
            if (keep.has(item)) return;
            this.closeSubmenu(item);
        });
    }

    scheduleCloseAllSubmenus() {
        this.cancelScheduledClose();
        this.closeTimer = setTimeout(() => {
            this.closeAllSubmenus();
        }, this.hoverCloseDelay);
    }

    cancelScheduledClose() {
        if (!this.closeTimer) return;
        clearTimeout(this.closeTimer);
        this.closeTimer = null;
    }

    applySubmenuAlignment(item) {
        const submenu = this.getSubmenu(item);
        if (!submenu) return;

        item.removeAttribute('data-submenu-align');
        submenu.style.left = '';
        submenu.style.right = '';

        const level = item.parentElement;
        const isRootLevel = level?.classList?.contains('holi-menu-root');
        const rect = submenu.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

        const overflowRight = rect.right > viewportWidth - 8;
        if (overflowRight) {
            if (isRootLevel) {
                item.setAttribute('data-submenu-align', 'viewport');
            } else {
                item.setAttribute('data-submenu-align', 'left');
            }
            return;
        }

        const overflowLeft = rect.left < 8;
        if (overflowLeft && !isRootLevel) {
            item.setAttribute('data-submenu-align', 'right');
        }
    }

    getItemPath(item) {
        const path = [];
        let cursor = item;
        while (cursor && cursor.classList?.contains('holi-menu-item')) {
            if (this.getSubmenu(cursor)) {
                path.unshift(cursor);
            }
            const level = cursor.parentElement;
            cursor = level ? level.closest('.holi-menu-item') : null;
        }
        return path;
    }

    destroy() {
        this.cancelScheduledClose();
        if (this.boundOutsideClick) {
            document.removeEventListener('click', this.boundOutsideClick);
            this.boundOutsideClick = null;
        }
        if (this.boundViewportChange) {
            window.removeEventListener('resize', this.boundViewportChange);
            this.boundViewportChange = null;
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
            this.boundContainerResize = null;
        }
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.MenubarComponent = MenubarComponent;
}

export { MenubarComponent };
