import { Component } from './component.js';

class TreeComponent extends Component {
    static get selector() {
        return 'tree';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'tree';
    }

    static templateId = 'tree-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = TreeComponent.templateId;
        this.singleExpand = this.container.hasAttribute('single-expand');
        this.loaderName = this.container.getAttribute('children-loader') || '';
        this.childrenLoader = this.resolveChildrenLoader(this.loaderName);
        this.onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
        this.globalNoCache = this.container.hasAttribute('no-cache');
        this.globalCacheTtl = this.parseNumber(this.container.getAttribute('cache-ttl'), 300000);
        this.childrenCache = new Map();
        this.loadingRequests = new Map();
        this.draggableNodes = this.container.hasAttribute('draggable-nodes');
        this.reorderHandlerName = this.container.getAttribute('reorder-handler') || '';
        this.reorderHandler = this.resolveReorderHandler(this.reorderHandlerName);
        this.dragState = { sourceItem: null, dropTarget: null };
        this.element = null;
        this.treeHost = null;
        this.treeRoot = null;
        this.activeTrigger = null;
        this.init();
    }

    resolveChildrenLoader(name) {
        if (!name || typeof window === 'undefined') return null;
        const fn = window[name];
        return typeof fn === 'function' ? fn : null;
    }

    resolveReorderHandler(name) {
        if (!name || typeof window === 'undefined') return null;
        const fn = window[name];
        return typeof fn === 'function' ? fn : null;
    }

    parseNumber(value, fallback) {
        const next = Number(value);
        return Number.isFinite(next) ? next : fallback;
    }

    validateStructure() {
        super.validateStructure();
        const hasTree = !!this.container.querySelector('[slot="tree"]') || !!this.container.querySelector('ul, ol');
        if (!hasTree) {
            throw new Error('Tree requires a nested list in slot="tree".');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
        this.bindEvents();
        this.syncFocusTargets();
    }

    async render() {
        const sourceTree = this.container.querySelector('[slot="tree"]') || this.container.querySelector('ul, ol');
        await super.render();
        this.element = this.container.querySelector('.holi-tree');
        this.treeHost = this.container.querySelector('[data-role="tree-host"]');
        if (sourceTree && this.treeHost) {
            this.treeHost.replaceChildren(sourceTree);
        }

        this.treeRoot = this.treeHost?.querySelector('ul, ol');
        if (!this.treeRoot) return;
        this.treeRoot.classList.add('holi-tree-level', 'holi-tree-root');
        this.treeRoot.setAttribute('role', 'tree');
        this.decorateLevel(this.treeRoot, 1);
    }

    decorateLevel(level, depth) {
        level.setAttribute('data-depth', String(depth));
        const items = Array.from(level.children).filter((node) => node.tagName === 'LI');
        items.forEach((item) => {
            item.classList.add('holi-tree-item');
            item.setAttribute('role', 'treeitem');
            item.setAttribute('aria-level', String(depth));

            const trigger = this.ensureTrigger(item);
            const submenu = this.getDirectSubmenu(item);
            const lazy = item.getAttribute('data-lazy') === 'true' || item.hasAttribute('data-lazy');
            const hasChildren = !!submenu || lazy;
            this.ensureNodeKey(item);
            if (this.draggableNodes) {
                item.setAttribute('draggable', 'true');
                item.classList.add('is-draggable');
            }

            if (trigger) {
                trigger.classList.add('holi-tree-trigger');
            }

            if (hasChildren) {
                item.classList.add('has-children');
                this.ensureExpander(item, trigger);
                item.setAttribute('aria-expanded', 'false');
                if (submenu) {
                    submenu.classList.add('holi-tree-level', 'holi-tree-children');
                    submenu.setAttribute('role', 'group');
                    submenu.hidden = true;
                    this.decorateLevel(submenu, depth + 1);
                }
            } else {
                item.setAttribute('aria-expanded', 'false');
            }
        });
    }

    ensureTrigger(item) {
        const directChildren = Array.from(item.children);
        for (let i = 0; i < directChildren.length; i += 1) {
            const child = directChildren[i];
            if (child.tagName === 'BUTTON' || child.tagName === 'A' || child.hasAttribute('data-tree-trigger')) {
                return child;
            }
        }

        const label = this.extractItemLabel(item);
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.textContent = label || 'Node';
        trigger.setAttribute('data-tree-trigger', 'true');
        item.insertBefore(trigger, item.firstChild);
        return trigger;
    }

    getTrigger(item) {
        if (!item) return null;
        const directChildren = Array.from(item.children);
        for (let i = 0; i < directChildren.length; i += 1) {
            const child = directChildren[i];
            if (child.classList?.contains('holi-tree-trigger')) {
                return child;
            }
            if (child.tagName === 'BUTTON' || child.tagName === 'A' || child.hasAttribute('data-tree-trigger')) {
                return child;
            }
        }
        return null;
    }

    ensureExpander(item, trigger) {
        const directChildren = Array.from(item.children);
        const existing = directChildren.find((child) => child.classList?.contains('holi-tree-expander'));
        if (existing) return existing;
        const expander = document.createElement('button');
        expander.type = 'button';
        expander.className = 'holi-tree-expander';
        expander.setAttribute('data-tree-expander', 'true');
        expander.setAttribute('aria-label', 'Toggle children');
        expander.textContent = '+';
        item.insertBefore(expander, trigger || item.firstChild);
        return expander;
    }

    extractItemLabel(item) {
        const childNodes = Array.from(item.childNodes);
        for (let i = 0; i < childNodes.length; i += 1) {
            const node = childNodes[i];
            if (node.nodeType !== Node.TEXT_NODE) continue;
            const text = String(node.textContent || '').trim();
            if (text) {
                node.textContent = '';
                return text;
            }
        }
        return item.getAttribute('data-label') || '';
    }

    getDirectSubmenu(item) {
        const directChildren = Array.from(item.children);
        for (let i = 0; i < directChildren.length; i += 1) {
            const child = directChildren[i];
            if (child.tagName === 'UL' || child.tagName === 'OL') {
                return child;
            }
        }
        return null;
    }

    getDirectExpander(item) {
        const directChildren = Array.from(item.children);
        for (let i = 0; i < directChildren.length; i += 1) {
            const child = directChildren[i];
            if (child.classList?.contains('holi-tree-expander')) {
                return child;
            }
        }
        return null;
    }

    bindEvents() {
        if (!this.element) return;
        this.element.addEventListener('click', (event) => this.onClick(event));
        this.element.addEventListener('keydown', (event) => this.onKeydown(event));
        this.element.addEventListener('focusin', (event) => {
            const trigger = event.target.closest('.holi-tree-trigger');
            if (trigger) this.activeTrigger = trigger;
            this.syncFocusTargets();
        });
        if (this.draggableNodes) {
            this.element.addEventListener('dragstart', (event) => this.onDragStart(event));
            this.element.addEventListener('dragover', (event) => this.onDragOver(event));
            this.element.addEventListener('dragleave', (event) => this.onDragLeave(event));
            this.element.addEventListener('drop', (event) => this.onDrop(event));
            this.element.addEventListener('dragend', () => this.onDragEnd());
        }
    }

    onClick(event) {
        const expander = event.target.closest('[data-tree-expander]');
        const trigger = event.target.closest('.holi-tree-trigger');
        const source = expander || trigger;
        if (!source) return;
        const item = source.closest('.holi-tree-item');
        if (!item) return;
        if (item.getAttribute('data-loading') === 'true') return;

        if (expander && item.classList.contains('has-children')) {
            event.preventDefault();
            void this.toggleItem(item);
            return;
        }

        if (trigger) {
            event.preventDefault();
        }

        this.activeTrigger = trigger;
        const detail = {
            item,
            id: item.getAttribute('data-node-id') || null,
            label: this.getNodeLabel(item)
        };
        if (this.onSelect) {
            this.onSelect(detail);
        }
        this.dispatchEvent('treeselect', detail);
        this.syncFocusTargets();
    }

    onKeydown(event) {
        const trigger = event.target.closest('.holi-tree-trigger');
        if (!trigger) return;
        const item = trigger.closest('.holi-tree-item');
        if (!item) return;

        const visibleTriggers = this.getVisibleTriggers();
        const currentIndex = visibleTriggers.indexOf(trigger);

        if (event.key === 'ArrowDown' && currentIndex >= 0) {
            event.preventDefault();
            visibleTriggers[Math.min(currentIndex + 1, visibleTriggers.length - 1)]?.focus();
            return;
        }

        if (event.key === 'ArrowUp' && currentIndex >= 0) {
            event.preventDefault();
            visibleTriggers[Math.max(currentIndex - 1, 0)]?.focus();
            return;
        }

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            if (!this.isExpanded(item) && item.classList.contains('has-children')) {
                void this.expandItem(item);
                return;
            }
            const child = this.getFirstChildTrigger(item);
            child?.focus();
            return;
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            if (this.isExpanded(item)) {
                this.collapseItem(item);
                return;
            }
            const parent = this.getParentItem(item);
            const parentTrigger = parent ? this.getTrigger(parent) : null;
            parentTrigger?.focus();
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            if (!item.classList.contains('has-children')) return;
            event.preventDefault();
            void this.toggleItem(item);
        }
    }

    getVisibleTriggers() {
        const all = Array.from(this.element.querySelectorAll('.holi-tree-trigger'));
        return all.filter((trigger) => {
            const item = trigger.closest('.holi-tree-item');
            return this.isItemVisible(item);
        });
    }

    isItemVisible(item) {
        if (!item) return false;
        let cursor = item;
        while (cursor) {
            const parentItem = this.getParentItem(cursor);
            if (!parentItem) return true;
            const submenu = this.getDirectSubmenu(parentItem);
            if (submenu?.hidden) return false;
            cursor = parentItem;
        }
        return true;
    }

    getParentItem(item) {
        const level = item?.parentElement;
        return level ? level.closest('.holi-tree-item') : null;
    }

    getFirstChildTrigger(item) {
        const submenu = this.getDirectSubmenu(item);
        if (!submenu || submenu.hidden) return null;
        const firstItem = Array.from(submenu.children).find((node) => node.classList?.contains('holi-tree-item'));
        if (!firstItem) return null;
        return this.getTrigger(firstItem);
    }

    isExpanded(item) {
        return item.getAttribute('aria-expanded') === 'true';
    }

    async toggleItem(item) {
        if (this.isExpanded(item)) {
            this.collapseItem(item);
        } else {
            await this.expandItem(item);
        }
    }

    async expandItem(item) {
        if (this.singleExpand) {
            this.collapseSiblings(item);
        }

        await this.ensureChildrenLoaded(item);

        const submenu = this.getDirectSubmenu(item);
        if (!submenu) return;

        submenu.hidden = false;
        item.setAttribute('aria-expanded', 'true');
        const expander = this.getDirectExpander(item);
        if (expander) expander.textContent = '-';
        this.syncFocusTargets();
        this.dispatchEvent('treeexpand', { item, id: item.getAttribute('data-node-id') || null });
    }

    collapseItem(item) {
        const submenu = this.getDirectSubmenu(item);
        if (!submenu) return;
        submenu.hidden = true;
        item.setAttribute('aria-expanded', 'false');
        const expander = this.getDirectExpander(item);
        if (expander) expander.textContent = '+';
        this.syncFocusTargets();
        this.dispatchEvent('treecollapse', { item, id: item.getAttribute('data-node-id') || null });
    }

    collapseSiblings(item) {
        const level = item.parentElement;
        if (!level) return;
        Array.from(level.children).forEach((sibling) => {
            if (sibling === item || !sibling.classList?.contains('holi-tree-item')) return;
            if (this.isExpanded(sibling)) this.collapseItem(sibling);
        });
    }

    async ensureChildrenLoaded(item) {
        const lazy = item.getAttribute('data-lazy') === 'true' || item.hasAttribute('data-lazy');
        if (!lazy || !this.childrenLoader) return;
        const nodeKey = this.ensureNodeKey(item);
        const { allowCache, ttl } = this.getCachePolicy(item);
        const now = Date.now();

        if (allowCache) {
            const cacheEntry = this.childrenCache.get(nodeKey);
            if (cacheEntry && now - cacheEntry.timestamp <= ttl) {
                this.applyLoadedChildren(item, cacheEntry.nodes);
                return;
            }
        }

        if (this.loadingRequests.has(nodeKey)) {
            await this.loadingRequests.get(nodeKey);
            return;
        }

        const loadTask = (async () => {
            this.setNodeLoading(item, true);
            const nodeId = item.getAttribute('data-node-id') || '';
            const result = await Promise.resolve(this.childrenLoader({ id: nodeId, item, tree: this }));
            const children = Array.isArray(result) ? result : [];
            this.applyLoadedChildren(item, children);
            if (allowCache) {
                this.childrenCache.set(nodeKey, { timestamp: Date.now(), nodes: children });
            }
        })();

        this.loadingRequests.set(nodeKey, loadTask);
        try {
            await loadTask;
        } finally {
            this.loadingRequests.delete(nodeKey);
            this.setNodeLoading(item, false);
        }
    }

    getCachePolicy(item) {
        const nodeNoCache = item.hasAttribute('data-no-cache');
        if (this.globalNoCache || nodeNoCache) {
            return { allowCache: false, ttl: 0 };
        }
        const nodeTtl = this.parseNumber(item.getAttribute('data-cache-ttl'), this.globalCacheTtl);
        return { allowCache: true, ttl: Math.max(0, nodeTtl) };
    }

    applyLoadedChildren(item, children) {
        const normalized = Array.isArray(children) ? children : [];
        let submenu = this.getDirectSubmenu(item);
        if (!submenu) {
            submenu = document.createElement('ul');
            item.appendChild(submenu);
        }
        submenu.replaceChildren();
        submenu.classList.add('holi-tree-level', 'holi-tree-children');
        submenu.setAttribute('role', 'group');
        submenu.hidden = true;

        normalized.forEach((node) => {
            submenu.appendChild(this.createNodeFromData(node));
        });

        const parentLevel = Number(item.getAttribute('aria-level') || 1);
        this.decorateLevel(submenu, parentLevel + 1);
        item.setAttribute('data-loaded', 'true');
        if (!normalized.length) {
            item.removeAttribute('data-lazy');
        }
    }

    setNodeLoading(item, loading) {
        const trigger = this.getTrigger(item);
        const expander = this.getDirectExpander(item);
        item.setAttribute('data-loading', loading ? 'true' : 'false');
        item.setAttribute('aria-busy', loading ? 'true' : 'false');
        if (trigger) {
            trigger.disabled = !!loading;
        }
        if (expander) {
            expander.disabled = !!loading;
            if (loading) {
                expander.textContent = '...';
            } else {
                expander.textContent = this.isExpanded(item) ? '-' : '+';
            }
        }
    }

    createNodeFromData(node) {
        const item = document.createElement('li');
        item.className = 'holi-tree-item';
        if (node && typeof node === 'object') {
            if (node.id != null) item.setAttribute('data-node-id', String(node.id));
            if (node.lazy) item.setAttribute('data-lazy', 'true');
        }

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'holi-tree-trigger';
        trigger.textContent = node?.label != null ? String(node.label) : 'Node';
        item.appendChild(trigger);

        if (Array.isArray(node?.children) && node.children.length) {
            const submenu = document.createElement('ul');
            node.children.forEach((child) => submenu.appendChild(this.createNodeFromData(child)));
            item.appendChild(submenu);
        }

        return item;
    }

    syncFocusTargets() {
        if (!this.element) return;
        const visibleTriggers = this.getVisibleTriggers();
        visibleTriggers.forEach((trigger) => trigger.setAttribute('tabindex', '-1'));

        if (!visibleTriggers.length) return;
        const activeStillVisible = this.activeTrigger && visibleTriggers.includes(this.activeTrigger);
        const next = activeStillVisible ? this.activeTrigger : visibleTriggers[0];
        next.setAttribute('tabindex', '0');
    }

    ensureNodeKey(item) {
        const existing = item.getAttribute('data-node-id') || item.getAttribute('data-node-key');
        if (existing) {
            if (!item.hasAttribute('data-node-key')) {
                item.setAttribute('data-node-key', String(existing));
            }
            return String(existing);
        }

        const autoKey = `node-${Math.random().toString(36).slice(2, 10)}`;
        item.setAttribute('data-node-key', autoKey);
        return autoKey;
    }

    getNodeLabel(item) {
        const trigger = this.getTrigger(item);
        if (!trigger) return '';
        return String(trigger.textContent || '').trim();
    }

    onDragStart(event) {
        const item = event.target.closest('.holi-tree-item');
        if (!item) return;
        this.dragState.sourceItem = item;
        item.classList.add('dragging');
        const id = item.getAttribute('data-node-id') || this.ensureNodeKey(item);
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', id);
        }
        this.dispatchEvent('treedragstart', { id, item });
    }

    onDragOver(event) {
        const target = event.target.closest('.holi-tree-item');
        if (!this.canDropOn(target)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        this.markDropTarget(target);
    }

    onDragLeave(event) {
        const target = event.target.closest('.holi-tree-item');
        if (!target) return;
        const stillInside = target.contains(event.relatedTarget);
        if (stillInside) return;
        target.classList.remove('drop-target');
    }

    async onDrop(event) {
        const target = event.target.closest('.holi-tree-item');
        if (!this.canDropOn(target)) return;
        event.preventDefault();

        const source = this.dragState.sourceItem;
        const fromId = source.getAttribute('data-node-id') || this.ensureNodeKey(source);
        const toId = target.getAttribute('data-node-id') || this.ensureNodeKey(target);

        target.parentElement?.insertBefore(source, target);
        const level = Number(target.getAttribute('aria-level') || 1);
        this.updateSubtreeLevels(source, level);
        this.syncFocusTargets();

        const detail = { source, target, fromId, toId, position: 'before' };
        this.dispatchEvent('treereorder', detail);
        if (this.reorderHandler) {
            await Promise.resolve(this.reorderHandler(detail));
        }
        this.onDragEnd();
    }

    onDragEnd() {
        const items = Array.from(this.element?.querySelectorAll('.holi-tree-item') || []);
        items.forEach((item) => item.classList.remove('dragging', 'drop-target'));
        this.dragState.sourceItem = null;
    }

    markDropTarget(target) {
        if (this.dragState.dropTarget && this.dragState.dropTarget !== target) {
            this.dragState.dropTarget.classList.remove('drop-target');
        }
        this.dragState.dropTarget = target;
        target.classList.add('drop-target');
    }

    canDropOn(target) {
        const source = this.dragState.sourceItem;
        if (!source || !target) return false;
        if (source === target) return false;
        if (source.contains(target)) return false;
        return true;
    }

    updateSubtreeLevels(item, level) {
        item.setAttribute('aria-level', String(level));
        const submenu = this.getDirectSubmenu(item);
        if (!submenu) return;
        Array.from(submenu.children)
            .filter((node) => node.classList?.contains('holi-tree-item'))
            .forEach((child) => this.updateSubtreeLevels(child, level + 1));
    }
}

if (typeof window !== 'undefined') {
    window.TreeComponent = TreeComponent;
}

export { TreeComponent };
