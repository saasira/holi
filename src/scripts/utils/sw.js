const DEFAULT_CACHE_NAME = 'html-first-lib-v3-2026';
const OFFLINE_FALLBACK_URL = '/offline.html';
const SUPPORTED_EVENTS = new Set(['fetch', 'push', 'sync', 'periodicsync']);
const CLIENT_PREFIX = 'sw:';

class ServiceWorkerManager {
    static globalInstance = null;

    constructor(options = {}) {
        this.cacheName = options.cacheName || DEFAULT_CACHE_NAME;
        this.offlineFallbackUrl = options.offlineFallbackUrl || OFFLINE_FALLBACK_URL;
        this.remoteHandlers = new Map();
        this.runtimeHandlers = new Map();
        this.requestQueue = [];
        this.responseQueue = [];
        this.networkProfile = this.readNetworkProfile(options.networkProfile);
        this.registration = null;
        this.started = false;
        this.clientMessagingStarted = false;
        this.handleMessageEvent = this.handleMessageEvent.bind(this);
        this.handleFetchEvent = this.handleFetchEvent.bind(this);
        this.handlePushEvent = this.handlePushEvent.bind(this);
        this.handleSyncEvent = this.handleSyncEvent.bind(this);
        this.handlePeriodicSyncEvent = this.handlePeriodicSyncEvent.bind(this);
        this.handleClientMessage = this.handleClientMessage.bind(this);
        this.handleConnectionChange = this.handleConnectionChange.bind(this);
    }

    static isServiceWorkerScope(scope = globalThis) {
        return typeof ServiceWorkerGlobalScope !== 'undefined' && scope instanceof ServiceWorkerGlobalScope;
    }

    static isWindowScope(scope = globalThis) {
        return typeof window !== 'undefined' && scope === window;
    }

    static getInstance(options = {}) {
        if (!this.globalInstance) this.globalInstance = new ServiceWorkerManager(options);
        return this.globalInstance;
    }

    static create(options = {}) {
        return new ServiceWorkerManager(options);
    }

    static registerHandler(a, b, c = [], d = 0, e = {}) {
        const legacy = SUPPORTED_EVENTS.has(String(a || '').toLowerCase())
            && typeof b === 'string'
            && !Array.isArray(c)
            && typeof c === 'object'
            && (typeof d !== 'number')
            && (!e || Object.keys(e).length === 0);
        if (legacy) {
            const config = c || {};
            return {
                name: b,
                type: String(a).toLowerCase(),
                capabilities: config.capabilities || [],
                priority: Number(config.priority || 0),
                handler: { ...config }
            };
        }

        const name = String(a || '').trim();
        const type = String(b || '').trim().toLowerCase();
        const capabilities = Array.isArray(c) ? c : (c ? [c] : []);
        const priority = typeof d === 'number' ? d : Number(d?.priority || 0);
        const handler = typeof d === 'number' ? (e || {}) : (d || {});

        return {
            name,
            type,
            capabilities,
            priority,
            handler: { ...(handler || {}) }
        };
    }

    isWorker() { return ServiceWorkerManager.isServiceWorkerScope(); }
    isClient() { return ServiceWorkerManager.isWindowScope(); }

    start() {
        if (!this.isWorker() || this.started) return this;
        self.addEventListener('message', this.handleMessageEvent);
        self.addEventListener('fetch', this.handleFetchEvent);
        self.addEventListener('push', this.handlePushEvent);
        self.addEventListener('sync', this.handleSyncEvent);
        self.addEventListener('periodicsync', this.handlePeriodicSyncEvent);
        this.started = true;
        return this;
    }

    startClientMessaging() {
        if (!this.isClient() || this.clientMessagingStarted || !('serviceWorker' in navigator)) return this;
        navigator.serviceWorker.addEventListener('message', this.handleClientMessage);
        this.observeNetworkQuality();
        this.clientMessagingStarted = true;
        return this;
    }

    on(type, name, handler, options = {}) {
        const eventType = String(type || '').toLowerCase();
        if (!SUPPORTED_EVENTS.has(eventType)) throw new Error(`Unsupported service-worker event type: ${eventType}`);
        if (typeof handler !== 'function') throw new Error('Service worker runtime handler must be a function');
        const normalized = this.normalizeHandler({
            name,
            type: eventType,
            capabilities: options.capabilities || [],
            handler: { ...options, runtimeHandler: handler }
        });
        this.runtimeHandlers.set(this.toKey(normalized.type, normalized.name), normalized);
        return this;
    }

    off(type, name) {
        const key = this.toKey(type, name);
        this.runtimeHandlers.delete(key);
        this.remoteHandlers.delete(key);
        return this;
    }

    registerHandlers(handlers = []) {
        if (!this.isClient()) return Promise.resolve(false);
        this.startClientMessaging();
        const payload = (Array.isArray(handlers) ? handlers : [handlers]).map((h) => this.normalizeHandler(h)).filter(Boolean);
        if (!payload.length) return Promise.resolve(false);
        return this.postToServiceWorker({ type: 'REGISTER_SW_HANDLERS', handlers: payload });
    }

    unregisterHandler(type, name) {
        if (!this.isClient()) return Promise.resolve(false);
        return this.postToServiceWorker({ type: 'UNREGISTER_SW_HANDLER', eventType: String(type || '').toLowerCase(), name: String(name || '') });
    }

    clearHandlers(type = null) {
        if (!this.isClient()) return Promise.resolve(false);
        return this.postToServiceWorker({ type: 'CLEAR_SW_HANDLERS', eventType: type ? String(type).toLowerCase() : null });
    }

    async registerWorker(scriptUrl = '/sw.js', registrationOptions = {}) {
        if (!this.isClient() || !('serviceWorker' in navigator)) return null;
        this.registration = await navigator.serviceWorker.register(scriptUrl, registrationOptions);
        this.startClientMessaging();
        this.sendNetworkProfile();
        return this.registration;
    }

    async ready() {
        if (!this.isClient() || !('serviceWorker' in navigator)) return null;
        return navigator.serviceWorker.ready;
    }

    async postToServiceWorker(payload) {
        const registration = this.registration || await this.ready();
        if (!registration) return false;
        const sw = navigator.serviceWorker.controller || registration.active || registration.waiting || registration.installing;
        if (!sw) return false;
        sw.postMessage(payload);
        return true;
    }

    async registerPeriodicSync(tag, options = {}) {
        const registration = this.registration || await this.ready();
        if (!registration?.periodicSync?.register) return false;
        await registration.periodicSync.register(String(tag || 'holi-periodic-sync'), options);
        return true;
    }

    queueRequest(task = {}) { return this.isClient() ? this.postToServiceWorker({ type: 'QUEUE_REQUEST', task }) : Promise.resolve(false); }
    queueResponse(entry = {}) { return this.isClient() ? this.postToServiceWorker({ type: 'QUEUE_RESPONSE', entry }) : Promise.resolve(false); }
    flushQueues(tag = '') { return this.isClient() ? this.postToServiceWorker({ type: 'FLUSH_QUEUES', tag: String(tag || '') }) : Promise.resolve(false); }

    observeNetworkQuality() {
        if (!this.isClient()) return;
        const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!c) return;
        c.removeEventListener?.('change', this.handleConnectionChange);
        c.addEventListener?.('change', this.handleConnectionChange);
        this.handleConnectionChange();
    }

    handleConnectionChange() {
        this.networkProfile = this.readNetworkProfile();
        this.dispatchClientEvent('network-profile', { profile: this.networkProfile });
        this.sendNetworkProfile();
    }

    sendNetworkProfile() {
        return this.isClient() ? this.postToServiceWorker({ type: 'UPDATE_NETWORK_PROFILE', profile: this.networkProfile }) : Promise.resolve(false);
    }

    handleClientMessage(event) {
        const data = event?.data || {};
        if (!String(data.type || '').startsWith(CLIENT_PREFIX)) return;
        this.dispatchClientEvent(String(data.type).slice(CLIENT_PREFIX.length), data.detail || {});
    }

    dispatchClientEvent(name, detail = {}) {
        if (typeof document === 'undefined') return;
        document.dispatchEvent(new CustomEvent(`sw:${name}`, { detail }));
    }

    handleMessageEvent(event) {
        const data = event?.data || {};
        const type = data.type;
        if (!type) return;
        if (type === 'REGISTER_SW_HANDLERS') {
            (Array.isArray(data.handlers) ? data.handlers : []).forEach((handler) => {
                const normalized = this.normalizeHandler(handler);
                if (normalized) this.remoteHandlers.set(this.toKey(normalized.type, normalized.name), normalized);
            });
            return this.emitToClients('handlers-registered', { count: this.remoteHandlers.size });
        }
        if (type === 'UNREGISTER_SW_HANDLER') {
            this.remoteHandlers.delete(this.toKey(data.eventType, data.name || data.id));
            return this.emitToClients('handler-unregistered', { type: data.eventType, name: data.name || data.id });
        }
        if (type === 'CLEAR_SW_HANDLERS') {
            if (!data.eventType) {
                this.remoteHandlers.clear();
            } else {
                Array.from(this.remoteHandlers.keys()).forEach((key) => { if (key.startsWith(`${data.eventType}:`)) this.remoteHandlers.delete(key); });
            }
            return this.emitToClients('handlers-cleared', { type: data.eventType || 'all' });
        }
        if (type === 'SKIP_WAITING') return self.skipWaiting();
        if (type === 'UPDATE_NETWORK_PROFILE') { this.networkProfile = this.readNetworkProfile(data.profile); return; }
        if (type === 'QUEUE_REQUEST' || type === 'QUEUE_SYNC_TASK') { if (data.task) this.enqueueRequest(data.task); return; }
        if (type === 'QUEUE_RESPONSE') { if (data.entry) this.enqueueResponse(data.entry); return; }
        if (type === 'FLUSH_QUEUES') return event.waitUntil?.(this.flushAllQueues(String(data.tag || '')));
        if (type === 'SHOW_NOTIFICATION') return event.waitUntil?.(this.showNotificationFromPayload(data.payload || {}));
    }

    handleFetchEvent(event) {
        const runtime = this.findRuntimeHandler('fetch', event);
        if (runtime) return event.respondWith(Promise.resolve(runtime.handler.runtimeHandler(event, runtime, this)));
        const remote = this.findRemoteHandler('fetch', event);
        if (remote) return event.respondWith(this.executeGenericHandler(remote, event));
        event.respondWith(this.defaultFetch(event.request));
    }

    handlePushEvent(event) {
        const runtime = this.findRuntimeHandler('push', event);
        if (runtime) return event.waitUntil(Promise.resolve(runtime.handler.runtimeHandler(event, runtime, this)));
        const remote = this.findRemoteHandler('push', event);
        if (remote) return event.waitUntil(this.executeGenericHandler(remote, event));
        event.waitUntil(self.registration.showNotification('Update Available'));
    }

    handleSyncEvent(event) {
        const runtime = this.findRuntimeHandler('sync', event);
        if (runtime) return event.waitUntil(Promise.resolve(runtime.handler.runtimeHandler(event, runtime, this)));
        const remote = this.findRemoteHandler('sync', event);
        if (remote) event.waitUntil(this.executeGenericHandler(remote, event));
    }

    handlePeriodicSyncEvent(event) {
        const runtime = this.findRuntimeHandler('periodicsync', event);
        if (runtime) return event.waitUntil(Promise.resolve(runtime.handler.runtimeHandler(event, runtime, this)));
        const remote = this.findRemoteHandler('periodicsync', event);
        if (remote) event.waitUntil(this.executeGenericHandler(remote, event));
    }

    async executeGenericHandler(handler, event) {
        if (handler.type === 'fetch') return this.executeFetchHandler(handler, event);
        if (handler.type === 'push') return this.executePushHandler(handler, event);
        if (handler.type === 'sync') return this.executeSyncHandler(handler, event);
        if (handler.type === 'periodicsync') return this.executePeriodicSyncHandler(handler, event);
        return null;
    }

    async executeFetchHandler(handler, event) {
        let request = event.request;
        if (handler.capabilitySet.has('adaptive-data-loading')) request = this.applyAdaptiveRequest(request, handler);
        if (handler.capabilitySet.has('network-throttling')) await this.applyNetworkThrottling(handler);
        try {
            const response = handler.capabilitySet.has('caching')
                ? await this.executeCachingHandler(handler, request)
                : await this.executeFetchStrategy(handler, request);
            if (handler.capabilitySet.has('response-queueing')) await this.captureResponseQueue(handler, request, response);
            return response;
        } catch (error) {
            if (handler.capabilitySet.has('request-queueing')) {
                const queued = await this.queueFailedRequest(handler, request, error);
                if (queued) return queued;
            }
            throw error;
        }
    }

    executePushHandler(handler, event) {
        const payload = this.extractPushPayload(event);
        return this.showNotificationFromPayload({
            title: payload.title || handler.handler.notification?.title || 'Update Available',
            body: payload.body || handler.handler.notification?.body || '',
            icon: payload.icon || handler.handler.notification?.icon,
            badge: payload.badge || handler.handler.notification?.badge,
            data: payload.data || handler.handler.notification?.data
        });
    }

    async executeSyncHandler(handler, event) {
        const tag = event.tag || '';
        if (handler.match.tag && handler.match.tag !== tag) return;
        await this.flushAllQueues(tag);
        const sync = handler.handler.sync || {};
        if (!sync.endpoint) return;
        await fetch(sync.endpoint, {
            method: sync.method || 'POST',
            headers: sync.headers || { 'Content-Type': 'application/json' },
            body: sync.body ? JSON.stringify(sync.body) : undefined
        });
    }

    async executePeriodicSyncHandler(handler, event) {
        const periodic = handler.handler.periodicSync || {};
        const tag = event.tag || '';
        const expected = handler.match.tag || periodic.tag || '';
        if (expected && expected !== tag) return;
        if (handler.capabilitySet.has('request-queueing')) await this.flushRequestQueue(tag);
        if (!periodic.endpoint) return;
        await fetch(periodic.endpoint, { method: periodic.method || 'GET', headers: periodic.headers || {} });
    }

    async executeFetchStrategy(handler, request) {
        const strategy = String(handler.handler.strategy || handler.strategy || 'network-first').toLowerCase();
        if (strategy === 'image-optimize') return this.optimizeImageFetch(request, handler);
        if (strategy === 'cache-only') return (await caches.match(request)) || this.defaultFetch(request);
        if (strategy === 'network-only') return this.fetchWithHooks(request, handler);
        if (strategy === 'cache-first') {
            const cached = await caches.match(request);
            if (cached) return cached;
            const response = await this.fetchWithHooks(request, handler);
            await this.cacheResponse(request, response);
            return response;
        }
        if (strategy === 'stale-while-revalidate') {
            const cached = await caches.match(request);
            const network = this.fetchWithHooks(request, handler).then(async (response) => {
                await this.cacheResponse(request, response);
                return response;
            }).catch(() => null);
            return cached || network || this.defaultFetch(request);
        }
        try {
            const response = await this.fetchWithHooks(request, handler);
            await this.cacheResponse(request, response);
            return response;
        } catch (error) {
            const cached = await caches.match(request);
            if (cached) return cached;
            const fallbackUrl = handler.handler.fallbackUrl || handler.fallbackUrl || this.offlineFallbackUrl;
            if (fallbackUrl) {
                const fallback = await caches.match(fallbackUrl);
                if (fallback) return fallback;
            }
            throw error;
        }
    }

    async executeCachingHandler(handler, request) {
        const cacheConfig = handler.handler.cache || {};
        const cacheName = String(cacheConfig.cacheName || this.cacheName).trim() || this.cacheName;
        const mode = String(cacheConfig.mode || handler.handler.strategy || 'network-first').toLowerCase();
        const cache = await caches.open(cacheName);
        const cacheKey = this.resolveCacheKey(request, cacheConfig.cacheKey);
        const cached = await cache.match(cacheKey);
        const ttlMs = Number(cacheConfig.ttlMs || 0);

        if (cached && ttlMs > 0) {
            const ts = Number(cached.headers.get('x-holi-cache-ts') || 0);
            if (ts > 0 && (Date.now() - ts) > ttlMs) {
                await cache.delete(cacheKey);
            }
        }

        const freshCached = await cache.match(cacheKey);
        if (mode === 'cache-only') {
            return freshCached || this.defaultFetch(request);
        }
        if (mode === 'cache-first' && freshCached) {
            return freshCached;
        }
        if (mode === 'stale-while-revalidate') {
            const network = this.fetchWithHooks(request, handler)
                .then((response) => this.storeCachedResponse(cache, cacheKey, response))
                .catch(() => null);
            return freshCached || network || this.defaultFetch(request);
        }

        try {
            const response = await this.fetchWithHooks(request, handler);
            return this.storeCachedResponse(cache, cacheKey, response);
        } catch (error) {
            if (freshCached) return freshCached;
            throw error;
        }
    }

    fetchWithHooks(request, handler) {
        this.emitToClients('fetch-start', { name: handler.name, type: handler.type, url: request.url });
        return fetch(request).then((response) => {
            this.emitToClients('fetch-complete', { name: handler.name, type: handler.type, url: request.url, status: response.status });
            return response;
        }).catch((error) => {
            this.emitToClients('fetch-error', { name: handler.name, type: handler.type, url: request.url, message: String(error?.message || error) });
            throw error;
        });
    }

    applyNetworkThrottling(handler) {
        const delayMs = Number(handler.handler.throttle?.delayMs || 0);
        return delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve();
    }

    applyAdaptiveRequest(request, handler) {
        const profile = this.networkProfile || {};
        const adaptive = handler.handler.adaptive || {};
        const url = new URL(request.url);
        const type = String(profile.effectiveType || '4g').toLowerCase();
        const constrained = !!profile.saveData || ['slow-2g', '2g', '3g'].includes(type);
        url.searchParams.set(adaptive.qualityParam || 'quality', constrained ? 'low' : 'high');
        if (adaptive.pageSizeParam) {
            url.searchParams.set(adaptive.pageSizeParam, String(constrained ? Number(adaptive.lowPageSize || 10) : Number(adaptive.highPageSize || 30)));
        }
        const headers = new Headers(request.headers || {});
        headers.set('x-network-effective-type', type);
        headers.set('x-network-save-data', profile.saveData ? 'true' : 'false');
        return new Request(url.toString(), { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.clone().body, credentials: request.credentials, cache: request.cache, keepalive: request.keepalive, mode: request.mode, redirect: request.redirect, referrer: request.referrer, integrity: request.integrity });
    }

    async queueFailedRequest(handler, request, error) {
        const queue = handler.handler.queue || {};
        const methods = Array.isArray(queue.methods) ? queue.methods : ['POST', 'PUT', 'PATCH', 'DELETE'];
        if (!methods.includes(String(request.method || 'GET').toUpperCase())) return null;
        const task = {
            id: `req-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name: handler.name,
            type: handler.type,
            tag: queue.tag || handler.match.tag || '',
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: ['GET', 'HEAD'].includes(request.method) ? '' : await request.clone().text(),
            hooks: queue.hooks || {}
        };
        this.enqueueRequest(task);
        this.emitToClients('queue-enqueued', { queue: 'request', task, message: String(error?.message || error) });
        return new Response(JSON.stringify({ queued: true, id: task.id, message: 'Request queued for retry' }), { status: Number(queue.acceptedStatus || 202), headers: { 'Content-Type': 'application/json' } });
    }

    async captureResponseQueue(handler, request, response) {
        const cfg = handler.handler.responseQueue || {};
        const entry = {
            id: `res-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name: handler.name,
            type: handler.type,
            tag: cfg.tag || '',
            url: request.url,
            status: response.status,
            body: await response.clone().text(),
            hooks: cfg.hooks || {}
        };
        this.enqueueResponse(entry);
        this.emitToClients('response-captured', { queue: 'response', entry });
    }

    enqueueRequest(task) { this.requestQueue.push({ ...task, method: String(task.method || 'POST').toUpperCase() }); }
    enqueueResponse(entry) { this.responseQueue.push({ ...entry }); }
    async flushAllQueues(tag = '') { await this.flushRequestQueue(tag); await this.flushResponseQueue(tag); }

    async flushRequestQueue(tag = '') {
        if (!this.requestQueue.length) return;
        const pending = this.requestQueue.slice();
        this.requestQueue = [];
        for (let i = 0; i < pending.length; i += 1) {
            const task = pending[i];
            if (task.tag && tag && task.tag !== tag) { this.requestQueue.push(task); continue; }
            try {
                const response = await fetch(task.url, { method: task.method, headers: task.headers || { 'Content-Type': 'application/json' }, body: ['GET', 'HEAD'].includes(task.method) ? undefined : task.body });
                this.emitQueueHook(task.hooks?.successEvent || 'queue-item-success', { queue: 'request', task, status: response.status });
            } catch (error) {
                this.requestQueue.push(task);
                this.emitQueueHook(task.hooks?.failureEvent || 'queue-item-failure', { queue: 'request', task, message: String(error?.message || error) });
            } finally {
                this.emitQueueHook(task.hooks?.completeEvent || 'queue-item-complete', { queue: 'request', task });
            }
        }
        this.emitToClients('queue-flushed', { queue: 'request', remaining: this.requestQueue.length });
    }

    async flushResponseQueue(tag = '') {
        if (!this.responseQueue.length) return;
        const pending = this.responseQueue.slice();
        this.responseQueue = [];
        pending.forEach((entry) => {
            if (entry.tag && tag && entry.tag !== tag) { this.responseQueue.push(entry); return; }
            this.emitQueueHook(entry.hooks?.completeEvent || 'response-queue-complete', { queue: 'response', entry });
        });
        this.emitToClients('queue-flushed', { queue: 'response', remaining: this.responseQueue.length });
    }

    emitQueueHook(name, detail) { this.emitToClients(name, detail); }

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
        if (!response?.ok || request.method !== 'GET') return;
        const cache = await caches.open(this.cacheName);
        await cache.put(request, response.clone());
    }

    resolveCacheKey(request, cacheKey) {
        if (!cacheKey) return request;
        if (cacheKey instanceof Request) return cacheKey;
        const key = String(cacheKey || '').trim();
        if (!key) return request;
        return new Request(key, {
            method: 'GET',
            headers: request.headers
        });
    }

    async storeCachedResponse(cache, cacheKey, response) {
        if (!response?.ok) return response;
        const headers = new Headers(response.headers || {});
        headers.set('x-holi-cache-ts', String(Date.now()));
        const body = await response.clone().blob();
        const cachedResponse = new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers
        });
        await cache.put(cacheKey, cachedResponse.clone());
        return response;
    }

    async optimizeImageFetch(request, handler) {
        const url = new URL(request.url);
        const maxWidth = Number(handler.handler.maxWidth || 1280);
        const quality = Number(handler.handler.quality || 75);
        url.searchParams.set('auto', 'format,compress');
        url.searchParams.set('fit', 'max');
        url.searchParams.set('w', String(maxWidth));
        url.searchParams.set('q', String(quality));
        const optimized = new Request(url.toString(), request);
        const cached = await caches.match(optimized);
        if (cached) return cached;
        const response = await fetch(optimized);
        await this.cacheResponse(optimized, response);
        return response;
    }

    extractPushPayload(event) {
        try { return event.data ? event.data.json() : {}; }
        catch (_error) { return { title: 'Update Available', body: event.data ? event.data.text() : '' }; }
    }

    showNotificationFromPayload(payload = {}) {
        return self.registration.showNotification(payload.title || 'Update Available', {
            body: payload.body || '',
            icon: payload.icon || null,
            badge: payload.badge || null,
            data: payload.data || null
        });
    }

    findRuntimeHandler(type, event) {
        let best = null;
        this.runtimeHandlers.forEach((handler) => {
            if (handler.type !== type || !this.matches(handler.match, event)) return;
            if (!best || handler.priority > best.priority) best = handler;
        });
        return best;
    }

    findRemoteHandler(type, event) {
        let best = null;
        this.remoteHandlers.forEach((handler) => {
            if (handler.type !== type || !this.matches(handler.match, event)) return;
            if (!best || handler.priority > best.priority) best = handler;
        });
        return best;
    }

    matches(match, event) {
        if (!match) return true;
        if (event.request) {
            const request = event.request;
            const url = new URL(request.url);
            if (match.method && String(match.method).toUpperCase() !== request.method) return false;
            if (match.urlStartsWith && !url.href.startsWith(String(match.urlStartsWith))) return false;
            if (match.urlIncludes && !url.href.includes(String(match.urlIncludes))) return false;
            if (match.urlPattern) {
                try { if (!(new RegExp(String(match.urlPattern))).test(url.href)) return false; }
                catch (_error) { return false; }
            }
        }
        if (typeof event.tag === 'string' && match.tag && match.tag !== event.tag) return false;
        return true;
    }

    normalizeHandler(handler) {
        if (!handler || typeof handler !== 'object') return null;
        const name = String(handler.name || handler.id || '').trim();
        const type = String(handler.type || handler.eventType || '').trim().toLowerCase();
        if (!name || !type || !SUPPORTED_EVENTS.has(type)) return null;
        const caps = Array.isArray(handler.capabilities) ? handler.capabilities : (handler.capabilities ? [handler.capabilities] : []);
        const capabilitySet = new Set(caps.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
        const config = handler.handler && typeof handler.handler === 'object' ? { ...handler.handler } : { ...handler };
        return {
            name,
            id: name,
            type,
            eventType: type,
            priority: Number(handler.priority || config.priority || 0),
            match: config.match && typeof config.match === 'object' ? { ...config.match } : {},
            capabilities: Array.from(capabilitySet),
            capabilitySet,
            strategy: config.strategy ? String(config.strategy) : null,
            fallbackUrl: config.fallbackUrl ? String(config.fallbackUrl) : null,
            handler: config
        };
    }

    readNetworkProfile(override = null) {
        if (override && typeof override === 'object') {
            return { effectiveType: String(override.effectiveType || '4g'), downlink: Number(override.downlink || 10), rtt: Number(override.rtt || 50), saveData: !!override.saveData };
        }
        if (!this.isClient()) return this.networkProfile || { effectiveType: '4g', downlink: 10, rtt: 50, saveData: false };
        const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        return { effectiveType: String(c?.effectiveType || '4g'), downlink: Number(c?.downlink || 10), rtt: Number(c?.rtt || 50), saveData: !!c?.saveData };
    }

    emitToClients(name, detail = {}) {
        if (!this.isWorker()) return Promise.resolve();
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            clients.forEach((client) => client.postMessage({ type: `${CLIENT_PREFIX}${name}`, detail }));
        });
    }

    toKey(type, name) {
        return `${String(type || '').toLowerCase()}:${String(name || '').trim()}`;
    }
}

if (ServiceWorkerManager.isServiceWorkerScope()) {
    ServiceWorkerManager.getInstance().start();
}

if (typeof window !== 'undefined') {
    window.ServiceWorkerManager = ServiceWorkerManager;
}

export { ServiceWorkerManager };
