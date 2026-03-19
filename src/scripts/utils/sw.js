const DEFAULT_CACHE_NAME = 'html-first-lib-v2-2026';
const OFFLINE_FALLBACK_URL = '/offline.html';
const SUPPORTED_EVENTS = new Set(['fetch', 'push', 'sync']);

class ServiceWorkerManager {
    static globalInstance = null;

    constructor(options = {}) {
        this.cacheName = options.cacheName || DEFAULT_CACHE_NAME;
        this.offlineFallbackUrl = options.offlineFallbackUrl || OFFLINE_FALLBACK_URL;
        this.remoteHandlers = new Map();
        this.runtimeHandlers = new Map();
        this.syncQueue = [];
        this.started = false;
        this.registration = null;

        this.handleMessageEvent = this.handleMessageEvent.bind(this);
        this.handleFetchEvent = this.handleFetchEvent.bind(this);
        this.handlePushEvent = this.handlePushEvent.bind(this);
        this.handleSyncEvent = this.handleSyncEvent.bind(this);
    }

    static isServiceWorkerScope(scope = globalThis) {
        return typeof ServiceWorkerGlobalScope !== 'undefined'
            && scope instanceof ServiceWorkerGlobalScope;
    }

    static isWindowScope(scope = globalThis) {
        return typeof window !== 'undefined' && scope === window;
    }

    static getInstance(options = {}) {
        if (!this.globalInstance) {
            this.globalInstance = new ServiceWorkerManager(options);
        }
        return this.globalInstance;
    }

    static create(options = {}) {
        return new ServiceWorkerManager(options);
    }

    static buildHandler(eventType, id, config = {}) {
        return {
            eventType,
            id,
            priority: Number(config.priority || 0),
            match: config.match || {},
            strategy: config.strategy || null,
            fallbackUrl: config.fallbackUrl || null
        };
    }

    isWorker() {
        return ServiceWorkerManager.isServiceWorkerScope();
    }

    isClient() {
        return ServiceWorkerManager.isWindowScope();
    }

    start() {
        if (!this.isWorker() || this.started) return this;

        self.addEventListener('message', this.handleMessageEvent);
        self.addEventListener('fetch', this.handleFetchEvent);
        self.addEventListener('push', this.handlePushEvent);
        self.addEventListener('sync', this.handleSyncEvent);
        this.started = true;
        return this;
    }

    on(eventType, id, handler, options = {}) {
        if (!SUPPORTED_EVENTS.has(eventType)) {
            throw new Error(`Unsupported service-worker event type: ${eventType}`);
        }
        if (typeof handler !== 'function') {
            throw new Error('Service worker runtime handler must be a function');
        }

        const key = this.toKey(eventType, id);
        this.runtimeHandlers.set(key, {
            eventType,
            id,
            priority: Number(options.priority || 0),
            match: options.match || null,
            handler
        });
        return this;
    }

    off(eventType, id) {
        this.runtimeHandlers.delete(this.toKey(eventType, id));
        this.remoteHandlers.delete(this.toKey(eventType, id));
        return this;
    }

    registerHandlers(handlers = []) {
        if (!this.isClient()) return Promise.resolve(false);
        const list = Array.isArray(handlers) ? handlers : [handlers];
        const payload = list
            .map((handler) => this.sanitizeRemoteHandler(handler))
            .filter(Boolean);
        if (!payload.length) return Promise.resolve(false);
        return this.postToServiceWorker({
            type: 'REGISTER_SW_HANDLERS',
            handlers: payload
        });
    }

    unregisterHandler(eventType, id) {
        if (!this.isClient()) return Promise.resolve(false);
        return this.postToServiceWorker({
            type: 'UNREGISTER_SW_HANDLER',
            eventType,
            id
        });
    }

    clearHandlers(eventType = null) {
        if (!this.isClient()) return Promise.resolve(false);
        return this.postToServiceWorker({
            type: 'CLEAR_SW_HANDLERS',
            eventType
        });
    }

    async registerWorker(scriptUrl = '/sw.js', registrationOptions = {}) {
        if (!this.isClient()) return null;
        if (!('serviceWorker' in navigator)) return null;
        this.registration = await navigator.serviceWorker.register(scriptUrl, registrationOptions);
        return this.registration;
    }

    async ready() {
        if (!this.isClient()) return null;
        if (!('serviceWorker' in navigator)) return null;
        return navigator.serviceWorker.ready;
    }

    async postToServiceWorker(payload) {
        const registration = this.registration || await this.ready();
        if (!registration) return false;
        const sw = navigator.serviceWorker.controller
            || registration.active
            || registration.waiting
            || registration.installing;
        if (!sw) return false;
        sw.postMessage(payload);
        return true;
    }

    handleMessageEvent(event) {
        const data = event && event.data ? event.data : {};
        const type = data.type;
        if (!type) return;

        if (type === 'REGISTER_SW_HANDLERS') {
            const incoming = Array.isArray(data.handlers) ? data.handlers : [];
            incoming.forEach((handler) => {
                const normalized = this.sanitizeRemoteHandler(handler);
                if (!normalized) return;
                this.remoteHandlers.set(this.toKey(normalized.eventType, normalized.id), normalized);
            });
            return;
        }

        if (type === 'UNREGISTER_SW_HANDLER') {
            this.remoteHandlers.delete(this.toKey(data.eventType, data.id));
            return;
        }

        if (type === 'CLEAR_SW_HANDLERS') {
            const eventType = data.eventType;
            if (!eventType) {
                this.remoteHandlers.clear();
                return;
            }
            Array.from(this.remoteHandlers.keys()).forEach((key) => {
                if (key.startsWith(`${eventType}:`)) {
                    this.remoteHandlers.delete(key);
                }
            });
            return;
        }

        if (type === 'SKIP_WAITING') {
            self.skipWaiting();
            return;
        }

        if (type === 'QUEUE_SYNC_TASK' && data.task && typeof data.task === 'object') {
            this.syncQueue.push(data.task);
            return;
        }

        if (type === 'SHOW_NOTIFICATION') {
            const payload = data.payload || {};
            event.waitUntil(this.showNotificationFromPayload(payload));
        }
    }

    handleFetchEvent(event) {
        const runtime = this.findRuntimeHandler('fetch', event);
        if (runtime) {
            event.respondWith(Promise.resolve(runtime.handler(event)));
            return;
        }

        const remote = this.findRemoteHandler('fetch', event);
        if (remote) {
            event.respondWith(this.executeFetchStrategy(remote, event));
            return;
        }

        event.respondWith(this.defaultFetch(event.request));
    }

    handlePushEvent(event) {
        const runtime = this.findRuntimeHandler('push', event);
        if (runtime) {
            event.waitUntil(Promise.resolve(runtime.handler(event)));
            return;
        }

        const remote = this.findRemoteHandler('push', event);
        if (remote) {
            event.waitUntil(this.executePush(remote, event));
            return;
        }

        event.waitUntil(self.registration.showNotification('Update Available'));
    }

    handleSyncEvent(event) {
        const runtime = this.findRuntimeHandler('sync', event);
        if (runtime) {
            event.waitUntil(Promise.resolve(runtime.handler(event)));
            return;
        }

        const remote = this.findRemoteHandler('sync', event);
        if (remote) {
            event.waitUntil(this.executeSync(remote, event));
        }
    }

    async executeFetchStrategy(handler, event) {
        const strategy = String(handler.strategy || 'network-first').toLowerCase();
        const request = event.request;

        if (strategy === 'image-optimize') {
            return this.optimizeImageFetch(request, handler);
        }

        if (strategy === 'cache-only') {
            const cached = await caches.match(request);
            return cached || this.defaultFetch(request);
        }

        if (strategy === 'network-only') {
            return fetch(request);
        }

        if (strategy === 'cache-first') {
            const cached = await caches.match(request);
            if (cached) return cached;
            const response = await fetch(request);
            this.cacheResponse(request, response);
            return response;
        }

        if (strategy === 'stale-while-revalidate') {
            const cached = await caches.match(request);
            const networkPromise = fetch(request)
                .then((response) => {
                    this.cacheResponse(request, response);
                    return response;
                })
                .catch(() => null);
            return cached || networkPromise || this.defaultFetch(request);
        }

        try {
            const response = await fetch(request);
            this.cacheResponse(request, response);
            return response;
        } catch (_error) {
            const cached = await caches.match(request);
            if (cached) return cached;
            const fallbackUrl = handler.fallbackUrl || this.offlineFallbackUrl;
            if (fallbackUrl) {
                const fallback = await caches.match(fallbackUrl);
                if (fallback) return fallback;
            }
            return Response.error();
        }
    }

    executePush(handler, event) {
        const payload = this.extractPushPayload(event);
        return this.showNotificationFromPayload({
            title: payload.title || (handler.notification && handler.notification.title) || 'Update Available',
            body: payload.body || (handler.notification && handler.notification.body) || '',
            icon: payload.icon || (handler.notification && handler.notification.icon),
            badge: payload.badge || (handler.notification && handler.notification.badge),
            data: payload.data || (handler.notification && handler.notification.data)
        });
    }

    async executeSync(handler, event) {
        const expectedTag = handler.match && handler.match.tag;
        if (expectedTag && event.tag !== expectedTag) {
            return;
        }

        await this.flushSyncQueue(event.tag);

        const syncConfig = handler.sync && typeof handler.sync === 'object' ? handler.sync : null;
        if (!syncConfig || !syncConfig.endpoint) return;

        await fetch(syncConfig.endpoint, {
            method: syncConfig.method || 'POST',
            headers: syncConfig.headers || { 'Content-Type': 'application/json' },
            body: syncConfig.body ? JSON.stringify(syncConfig.body) : undefined
        });
    }

    async defaultFetch(request) {
        const cached = await caches.match(request);
        if (cached) return cached;

        try {
            return await fetch(request);
        } catch (_error) {
            const fallback = await caches.match(this.offlineFallbackUrl);
            return fallback || Response.error();
        }
    }

    async cacheResponse(request, response) {
        if (!response || !response.ok || request.method !== 'GET') return;
        const cache = await caches.open(this.cacheName);
        cache.put(request, response.clone());
    }

    async optimizeImageFetch(request, handler) {
        const sourceUrl = new URL(request.url);
        const maxWidth = Number(handler.maxWidth || 1280);
        const quality = Number(handler.quality || 75);

        sourceUrl.searchParams.set('auto', 'format,compress');
        sourceUrl.searchParams.set('fit', 'max');
        sourceUrl.searchParams.set('w', String(maxWidth));
        sourceUrl.searchParams.set('q', String(quality));

        const optimizedRequest = new Request(sourceUrl.toString(), request);
        const cached = await caches.match(optimizedRequest);
        if (cached) return cached;

        const response = await fetch(optimizedRequest);
        this.cacheResponse(optimizedRequest, response);
        return response;
    }

    async flushSyncQueue(tag = '') {
        if (!this.syncQueue.length) return;
        const pending = this.syncQueue.slice();
        this.syncQueue = [];

        for (let i = 0; i < pending.length; i += 1) {
            const task = pending[i];
            if (task.tag && tag && task.tag !== tag) {
                this.syncQueue.push(task);
                continue;
            }
            if (!task.url) continue;

            try {
                await fetch(task.url, {
                    method: task.method || 'POST',
                    headers: task.headers || { 'Content-Type': 'application/json' },
                    body: task.body ? JSON.stringify(task.body) : undefined
                });
            } catch (_error) {
                this.syncQueue.push(task);
            }
        }
    }

    extractPushPayload(event) {
        try {
            return event.data ? event.data.json() : {};
        } catch (_error) {
            return {
                title: 'Update Available',
                body: event.data ? event.data.text() : ''
            };
        }
    }

    showNotificationFromPayload(payload = {}) {
        return self.registration.showNotification(payload.title || 'Update Available', {
            body: payload.body || '',
            icon: payload.icon || null,
            badge: payload.badge || null,
            data: payload.data || null
        });
    }

    findRuntimeHandler(eventType, event) {
        let best = null;
        this.runtimeHandlers.forEach((handler) => {
            if (handler.eventType !== eventType) return;
            if (!this.matches(handler.match, event)) return;
            if (!best || handler.priority > best.priority) {
                best = handler;
            }
        });
        return best;
    }

    findRemoteHandler(eventType, event) {
        let best = null;
        this.remoteHandlers.forEach((handler) => {
            if (handler.eventType !== eventType) return;
            if (!this.matches(handler.match, event)) return;
            if (!best || handler.priority > best.priority) {
                best = handler;
            }
        });
        return best;
    }

    matches(match, event) {
        if (!match) return true;

        if (event.request) {
            const request = event.request;
            const url = new URL(request.url);
            if (match.method && String(match.method).toUpperCase() !== request.method) {
                return false;
            }
            if (match.urlStartsWith && !url.href.startsWith(String(match.urlStartsWith))) {
                return false;
            }
            if (match.urlIncludes && !url.href.includes(String(match.urlIncludes))) {
                return false;
            }
            if (match.urlPattern) {
                try {
                    const expression = new RegExp(String(match.urlPattern));
                    if (!expression.test(url.href)) return false;
                } catch (_error) {
                    return false;
                }
            }
        }

        if (typeof event.tag === 'string' && match.tag && match.tag !== event.tag) {
            return false;
        }

        return true;
    }

    sanitizeRemoteHandler(handler) {
        if (!handler || typeof handler !== 'object') return null;
        const eventType = String(handler.eventType || '').trim();
        const id = String(handler.id || '').trim();
        if (!eventType || !id || !SUPPORTED_EVENTS.has(eventType)) return null;

        return {
            eventType,
            id,
            priority: Number(handler.priority || 0),
            match: handler.match && typeof handler.match === 'object' ? { ...handler.match } : {},
            strategy: handler.strategy ? String(handler.strategy) : null,
            fallbackUrl: handler.fallbackUrl ? String(handler.fallbackUrl) : null,
            maxWidth: Number(handler.maxWidth || 1280),
            quality: Number(handler.quality || 75),
            notification: handler.notification && typeof handler.notification === 'object'
                ? { ...handler.notification }
                : null,
            sync: handler.sync && typeof handler.sync === 'object'
                ? { ...handler.sync }
                : null
        };
    }

    toKey(eventType, id) {
        return `${eventType}:${id}`;
    }
}

if (ServiceWorkerManager.isServiceWorkerScope()) {
    ServiceWorkerManager.getInstance().start();
}

if (typeof window !== 'undefined') {
    window.ServiceWorkerManager = ServiceWorkerManager;
}

export { ServiceWorkerManager };
