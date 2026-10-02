import { Component } from './component.js';

class OfflineIndicator extends Component {
    static get selector() {
        return 'offline';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'offline';
    }

    static templateId = 'offline-template';

    static getNativeSelectors() {
        return ['[data-offline]'];
    }

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = OfflineIndicator.templateId;
        this.scope = this.resolveScope(options.scope ?? this.readAttr('scope', 'page'));
        this.position = this.resolvePosition(options.position ?? this.readAttr('position', 'bottom-right'));
        this.hostSelector = String(options.hostSelector ?? this.readAttr('host', '')).trim();
        this.duration = this.parseNumber(options.duration ?? this.readAttr('duration', '4000'), 4000);
        this.maxAttempts = this.parseNumber(options.maxAttempts ?? this.readAttr('max-attempts', '5'), 5);
        this.heartbeatMs = this.parseNumber(options.heartbeatMs ?? this.readAttr('heartbeat-ms', '5000'), 5000);
        this.probeTimeoutMs = this.parseNumber(options.probeTimeoutMs ?? this.readAttr('probe-timeout-ms', '3000'), 3000);
        this.pingUrl = String(options.pingUrl ?? this.readAttr('ping-url', this.resolveDefaultPingUrl())).trim();
        this.syncQueue = [];
        this.reconnectAttempts = 0;
        this.isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
        this.heartbeatTimer = null;
        this.hideTimer = null;
        this.lastProbeSucceeded = this.isOnline;
        this.host = null;
        this.appliedRelativeHost = false;
        this.boundOnline = () => this.evaluateConnection();
        this.boundOffline = () => this.onOffline();
        this.boundSyncAdd = (event) => this.handleSyncAdd(event);
        this.boundSyncClear = () => this.clearSyncQueue();
        this.boundRetry = () => this.retryConnection();
        this.init();
    }

    readAttr(name, fallback = '') {
        const direct = this.container.getAttribute(name);
        if (direct != null) return String(direct);
        const dataValue = this.container.getAttribute(`data-${name}`);
        return dataValue != null ? String(dataValue) : fallback;
    }

    parseNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    resolveScope(scope) {
        const value = String(scope || 'page').trim().toLowerCase();
        if (value === 'inline' || value === 'block') return value;
        return 'page';
    }

    resolvePosition(position) {
        const value = String(position || 'bottom-right').trim().toLowerCase();
        const allowed = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center']);
        return allowed.has(value) ? value : 'bottom-right';
    }

    resolveDefaultPingUrl() {
        return '/api/ping';
    }

    resolveHost() {
        if (this.scope === 'page' || typeof document === 'undefined') return null;
        if (this.hostSelector) {
            const found = document.querySelector(this.hostSelector);
            if (found) return found;
        }
        return this.container.parentElement || this.container;
    }

    ensureHostPositionContext() {
        if (!this.host || this.scope !== 'block' || typeof window === 'undefined') return;
        const computed = window.getComputedStyle(this.host);
        if (computed.position === 'static') {
            this.host.style.position = 'relative';
            this.appliedRelativeHost = true;
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
        this.bindEvents();
        this.startNetworkWatcher();
        this.checkStatus();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-offline-indicator');
        this.statusEl = this.container.querySelector('[data-role="status-text"]');
        this.syncEl = this.container.querySelector('[data-role="sync-text"]');
        this.attemptEl = this.container.querySelector('[data-role="attempt-text"]');
        this.retryButton = this.container.querySelector('[data-action="retry"]');

        if (!this.element || !this.statusEl || !this.syncEl || !this.attemptEl || !this.retryButton) {
            throw new Error('Offline template is missing required nodes');
        }

        this.container.hidden = false;
        this.element.setAttribute('data-scope', this.scope);
        this.element.setAttribute('data-position', this.position);
        this.updateSyncCount();
        this.updateAttemptCount();

        if (this.scope === 'block') {
            this.host = this.resolveHost();
            if (this.host && this.element.parentElement !== this.host) {
                this.host.appendChild(this.element);
                this.ensureHostPositionContext();
            }
            this.container.hidden = true;
        }

        this.setVisible(!this.isOnline);
        this.updateStatusView();

        if (typeof this.container.offlineIndicator === 'undefined') {
            Object.defineProperty(this.container, 'offlineIndicator', {
                value: this,
                writable: false
            });
        }
    }

    bindEvents() {
        this.retryButton?.addEventListener('click', this.boundRetry);
        if (typeof window !== 'undefined') {
            window.addEventListener('online', this.boundOnline);
            window.addEventListener('offline', this.boundOffline);
        }
        if (typeof document !== 'undefined') {
            document.addEventListener('sync-queue:add', this.boundSyncAdd);
            document.addEventListener('sync-queue:clear', this.boundSyncClear);
        }
    }

    startNetworkWatcher() {
        if (typeof window === 'undefined' || this.heartbeatMs <= 0) return;
        this.stopNetworkWatcher();
        this.heartbeatTimer = window.setInterval(() => {
            this.evaluateConnection();
        }, this.heartbeatMs);
    }

    stopNetworkWatcher() {
        if (this.heartbeatTimer && typeof window !== 'undefined') {
            window.clearInterval(this.heartbeatTimer);
        }
        this.heartbeatTimer = null;
    }

    ping() {
        if (typeof fetch === 'undefined' || !this.pingUrl) {
            return Promise.reject(new Error('Ping is unavailable'));
        }
        const probeUrl = new URL(this.pingUrl, typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
        probeUrl.searchParams.set('_ts', String(Date.now()));
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller && typeof window !== 'undefined'
            ? window.setTimeout(() => controller.abort(), Math.max(250, this.probeTimeoutMs))
            : null;

        return fetch(probeUrl.toString(), {
            method: 'GET',
            cache: 'no-store',
            keepalive: true,
            signal: controller?.signal
        }).then((response) => {
            if (!response || !response.ok) {
                throw new Error(`Ping failed with status ${response?.status || 'unknown'}`);
            }
            return response;
        }).finally(() => {
            if (timeoutId && typeof window !== 'undefined') {
                window.clearTimeout(timeoutId);
            }
        });
    }

    evaluateConnection() {
        return this.ping().then(() => {
            this.lastProbeSucceeded = true;
            if (!this.isOnline) {
                this.onOnline();
            }
            return true;
        }).catch(() => {
            this.lastProbeSucceeded = false;
            if (this.isOnline || (typeof navigator !== 'undefined' && navigator.onLine)) {
                this.onOffline();
            }
            return false;
        });
    }

    checkStatus() {
        if (typeof navigator === 'undefined') {
            this.onOnline();
            return;
        }
        if (!navigator.onLine) {
            this.onOffline();
            return;
        }
        this.evaluateConnection();
    }

    handleSyncAdd(event) {
        const detail = event?.detail;
        this.syncQueue.push(detail);
        this.updateSyncCount();
    }

    clearSyncQueue() {
        this.syncQueue = [];
        this.updateSyncCount();
    }

    updateSyncCount() {
        if (!this.syncEl) return;
        const pending = this.syncQueue.length;
        this.syncEl.textContent = `${pending} pending`;
    }

    updateAttemptCount() {
        if (!this.attemptEl) return;
        this.attemptEl.textContent = `Retry ${this.reconnectAttempts}/${this.maxAttempts}`;
    }

    updateStatusView() {
        if (!this.element || !this.statusEl || !this.retryButton) return;
        const status = this.isOnline ? 'online' : 'offline';
        this.element.setAttribute('data-status', status);
        this.statusEl.textContent = this.isOnline ? 'Back online' : 'Offline';
        this.retryButton.disabled = this.isOnline;
        this.updateAttemptCount();
    }

    setVisible(visible) {
        if (!this.element) return;
        const next = !!visible;
        if (this.hideTimer && typeof window !== 'undefined') {
            window.clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
        this.element.hidden = !next;
        this.element.setAttribute('data-visible', next ? 'true' : 'false');
    }

    onOffline() {
        this.isOnline = false;
        this.reconnectAttempts = 0;
        this.setVisible(true);
        this.updateStatusView();
        if (typeof document !== 'undefined') {
            document.body?.classList?.add('app--offline');
            document.dispatchEvent(new CustomEvent('app:offline'));
        }
    }

    onOnline() {
        this.isOnline = true;
        this.reconnectAttempts = 0;
        this.updateStatusView();
        if (typeof document !== 'undefined') {
            document.body?.classList?.remove('app--offline');
        }

        if (this.syncQueue.length > 0) {
            this.processSyncQueue();
        }

        if (typeof window !== 'undefined') {
            this.hideTimer = window.setTimeout(() => this.setVisible(false), Math.max(0, this.duration));
        } else {
            this.setVisible(false);
        }

        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('app:online'));
        }
    }

    retryConnection() {
        this.reconnectAttempts += 1;
        this.setVisible(true);
        this.statusEl.textContent = 'Retrying connection';
        this.updateAttemptCount();
        this.notify('Reconnecting...');
        const delay = Math.min(1000 * this.reconnectAttempts, 10000);

        if (typeof window === 'undefined') return;
        window.setTimeout(() => {
            this.evaluateConnection().then((connected) => {
                if (connected) return;
                this.updateAttemptCount();
                if (this.reconnectAttempts < this.maxAttempts) {
                    this.statusEl.textContent = 'Still offline';
                    this.notify(`Retry ${this.reconnectAttempts}/${this.maxAttempts}`);
                    return;
                }
                this.statusEl.textContent = 'Connection lost';
                this.notify('Connection lost. Check your network.', { type: 'error' });
            });
        }, delay);
    }

    processSyncQueue() {
        this.notify(`${this.syncQueue.length} items syncing...`);
        this.clearSyncQueue();
    }

    notify(message, options = {}) {
        const text = String(message || '').trim();
        if (!text) return;
        const toast = typeof window !== 'undefined' ? window.Q?.toast : null;
        if (typeof toast === 'function') {
            toast(text, options);
            return;
        }
        if (options.type === 'error') {
            console.error(text);
            return;
        }
        console.info(text);
    }

    simulateOffline() {
        this.onOffline();
    }

    simulateOnline() {
        this.onOnline();
    }

    destroy() {
        this.stopNetworkWatcher();
        if (typeof window !== 'undefined') {
            window.removeEventListener('online', this.boundOnline);
            window.removeEventListener('offline', this.boundOffline);
            if (this.hideTimer) window.clearTimeout(this.hideTimer);
        }
        if (typeof document !== 'undefined') {
            document.removeEventListener('sync-queue:add', this.boundSyncAdd);
            document.removeEventListener('sync-queue:clear', this.boundSyncClear);
        }
        if (this.appliedRelativeHost && this.host) {
            this.host.style.position = '';
        }
        this.retryButton?.removeEventListener('click', this.boundRetry);
        super.destroy();
    }

    static queue(action) {
        if (typeof document === 'undefined') return;
        document.dispatchEvent(new CustomEvent('sync-queue:add', {
            detail: action
        }));
    }

    static clearQueue() {
        if (typeof document === 'undefined') return;
        document.dispatchEvent(new CustomEvent('sync-queue:clear'));
    }

    static create(options = {}) {
        const existing = typeof document !== 'undefined'
            ? document.querySelector('[data-offline], offline, [component="offline"], [role="offline"]')
            : null;
        if (existing?.offlineIndicator) return existing.offlineIndicator;
        if (existing?.offlineindicator) return existing.offlineindicator;
        if (typeof document === 'undefined') return null;

        const indicator = document.createElement('section');
        indicator.setAttribute('component', 'offline');
        indicator.setAttribute('data-offline', 'true');
        Object.entries(options || {}).forEach(([key, value]) => {
            if (value == null) return;
            indicator.setAttribute(`data-${key}`, String(value));
        });
        document.body.appendChild(indicator);
        return indicator.offlineIndicator || indicator.offlineindicator || new OfflineIndicator(indicator, options);
    }
}

if (typeof window !== 'undefined') {
    window.OfflineIndicator = OfflineIndicator;
}

export { OfflineIndicator };
