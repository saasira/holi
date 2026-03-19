// Register for auto-loading
// ComponentRegistry.registerLibrary('holi', [TabsComponent]);
// ComponentRegistry.registerLibrary('holi', [ModalComponent, ToastComponent]);

class ComponentRegistry {
    static libraries = new Map();
    static instances = new WeakMap();
    static lifecycleObserver = null;
    static pendingRemovedNodes = new Set();
    static removalFlushScheduled = false;

    static registerLibrary(libraryName, components) {
        this.libraries.set(libraryName, components);
    }

    static initAll(container = document, options = {}) {
        this.libraries.forEach((components, libraryName) => {
            components.forEach((ComponentClass) => {
                this.initLibraryComponents(ComponentClass, libraryName, container, options);
            });
        });
    }

    static registerInstance(element, instance) {
        if (!(element instanceof Element) || !instance) return;
        const existing = this.instances.get(element);
        const map = existing instanceof Map ? existing : new Map();
        map.set(instance.constructor?.name || 'Component', instance);
        this.instances.set(element, map);
    }

    static unregisterInstance(element, instance) {
        if (!(element instanceof Element)) return;
        const map = this.instances.get(element);
        if (!(map instanceof Map)) return;

        if (instance) {
            map.forEach((value, key) => {
                if (value === instance) map.delete(key);
            });
        } else {
            map.clear();
        }

        if (map.size === 0) {
            this.instances.delete(element);
            return;
        }
        this.instances.set(element, map);
    }

    static getKnownInstanceKeys() {
        const keys = new Set();
        this.libraries.forEach((components) => {
            components.forEach((ComponentClass) => {
                if (!ComponentClass?.name) return;
                keys.add(ComponentClass.name.toLowerCase());
            });
        });
        return Array.from(keys);
    }

    static getElementInstances(element) {
        if (!(element instanceof Element)) return [];
        const found = new Set();

        const map = this.instances.get(element);
        if (map instanceof Map) {
            map.forEach((instance) => {
                if (instance) found.add(instance);
            });
        }

        this.getKnownInstanceKeys().forEach((key) => {
            const candidate = element[key];
            if (candidate && typeof candidate.destroy === 'function') {
                found.add(candidate);
            }
        });

        return Array.from(found);
    }

    static collectInstances(container, includeContainer = false) {
        if (!(container instanceof Element) && container !== document) return [];
        const instances = [];
        const seen = new Set();
        const pushUnique = (instance) => {
            if (!instance || seen.has(instance)) return;
            seen.add(instance);
            instances.push(instance);
        };

        if (includeContainer && container instanceof Element) {
            this.getElementInstances(container).forEach(pushUnique);
        }

        if (container.querySelectorAll) {
            container.querySelectorAll('*').forEach((el) => {
                this.getElementInstances(el).forEach(pushUnique);
            });
        }

        return instances;
    }

    static resolveComponentName(ComponentClass) {
        if (ComponentClass.componentName) {
            return String(ComponentClass.componentName).toLowerCase();
        }

        const selector = (ComponentClass.selector || '').trim();
        if (/^[a-z][a-z0-9-]*$/i.test(selector)) {
            return selector.toLowerCase();
        }

        const className = (ComponentClass.name || '').replace(/Component$/i, '');
        return className ? className.toLowerCase() : '';
    }

    static getDiscoverySelectors(ComponentClass, options = {}) {
        const includeRoleSelectors = options.includeRoleSelectors !== false;
        const selectors = new Set();
        const selector = (ComponentClass.selector || '').trim();
        if (selector) selectors.add(selector);

        const componentName = this.resolveComponentName(ComponentClass);
        if (componentName) {
            selectors.add(componentName);
            selectors.add(`[component="${componentName}"]`);
            if (includeRoleSelectors) {
                selectors.add(`[role="${componentName}"]`);
            }
        }

        if (typeof ComponentClass.getNativeSelectors === 'function') {
            const nativeSelectors = ComponentClass.getNativeSelectors(options);
            (nativeSelectors || []).forEach((nativeSelector) => {
                const value = String(nativeSelector || '').trim();
                if (value) selectors.add(value);
            });
        }

        return Array.from(selectors);
    }

    static shouldDeferInit(element) {
        const transformMode = (element.getAttribute('transform') || '').toLowerCase();
        const lazyTransform = (element.getAttribute('lazy-transform') || element.dataset.lazyTransform || '').toLowerCase();
        return transformMode === 'lazy' || lazyTransform === 'true' || lazyTransform === '1';
    }

    static initLibraryComponents(ComponentClass, libraryName, container, options = {}) {
        const selectors = this.getDiscoverySelectors(ComponentClass, options);
        if (!selectors.length) return;

        const elements = new Set();
        selectors.forEach((selector) => {
            if (container instanceof Element && container.matches(selector)) {
                elements.add(container);
            }
            container.querySelectorAll(selector).forEach((el) => elements.add(el));
        });

        elements.forEach((el) => {
            const host = typeof ComponentClass.prepareHost === 'function'
                ? (ComponentClass.prepareHost(el) || el)
                : el;
            if (!(host instanceof Element)) return;
            if (!ComponentClass.matchesLibrary(host, libraryName)) return;
            if (this.shouldDeferInit(host)) return;
            const owner = host.closest?.(`[data-holi-component-class="${ComponentClass.name}"]`);
            if (owner && owner !== host) return;

            if (!host[ComponentClass.name.toLowerCase()]) {
                new ComponentClass(host);
            }
        });
    }

    static destroyContainerInstances(container) {
        if (!(container instanceof Element)) return;
        const instances = this.collectInstances(container, true);
        instances.reverse().forEach((instance) => {
            if (!instance?.isDestroyed && typeof instance.destroy === 'function') {
                instance.destroy();
            }
        });
    }

    static flushRemovedNodes() {
        this.removalFlushScheduled = false;
        const nodes = Array.from(this.pendingRemovedNodes);
        this.pendingRemovedNodes.clear();

        nodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            if (node.isConnected) return;
            this.destroyContainerInstances(node);
        });
    }

    static scheduleRemovedFlush() {
        if (this.removalFlushScheduled) return;
        this.removalFlushScheduled = true;
        queueMicrotask(() => this.flushRemovedNodes());
    }

    static observeLifecycle(container = document) {
        if (this.lifecycleObserver) return;
        const root = container?.documentElement || container;
        if (!(root instanceof Element) && root !== document) return;

        this.lifecycleObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof Element)) return;
                    this.initAll(node, { includeRoleSelectors: false });
                });

                mutation.removedNodes.forEach((node) => {
                    if (!(node instanceof Element)) return;
                    this.pendingRemovedNodes.add(node);
                });
            });

            this.scheduleRemovedFlush();
        });

        this.lifecycleObserver.observe(root, { childList: true, subtree: true });
    }
}

export { ComponentRegistry };
