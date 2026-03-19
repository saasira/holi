class Navigation {
    static instance = null;

    constructor({ base = '/', hashMode = false, trackHistory = true } = {}) {
        if (Navigation.instance) return Navigation.instance;
        Navigation.instance = this;

        this.base = this.normalizeBase(base);
        this.hashMode = !!hashMode;
        this.trackHistory = !!trackHistory;
        this.routes = [];
        this.current = null;
        this.previous = null;
        this.listeners = new Set();
        this.navigationHistory = [];

        this._onPopState = () => this.parseCurrent();
        this._onHashChange = () => this.parseCurrent();
        this._onClick = (e) => this.handleLinkClick(e);

        this.start();
    }

    normalizeBase(base) {
        const raw = String(base || '/').trim();
        const clean = raw.replace(/\/+$/, '');
        return clean || '/';
    }

    start() {
        this.parseCurrent();
        window.addEventListener('popstate', this._onPopState);
        if (this.hashMode) window.addEventListener('hashchange', this._onHashChange);
        document.addEventListener('click', this._onClick);
        if (typeof window !== 'undefined') {
            //window.Navigation = this;
            window.Navigation = Navigation;
        }
    }

    stop() {
        window.removeEventListener('popstate', this._onPopState);
        window.removeEventListener('hashchange', this._onHashChange);
        document.removeEventListener('click', this._onClick);
    }

    route(path, handler, meta = {}) {
        const normalizedPath = this.normalizePath(path);
        const keys = [];
        const regex = this.pathToRegex(normalizedPath, keys);
        this.routes.push({
            path: normalizedPath,
            handler,
            meta,
            keys,
            regex
        });
        return this;
    }

    go(path, state = {}, replace = false) {
        const targetPath = this.normalizePath(path);
        const url = this.hashMode ? `#${targetPath}` : this.buildUrl(targetPath);
        const method = replace ? 'replaceState' : 'pushState';
        window.history[method](state, '', url);
        this.parseCurrent();
    }

    replace(path, state = {}) {
        this.go(path, state, true);
    }

    back() {
        window.history.back();
    }

    forward() {
        window.history.forward();
    }

    dispatch(path) {
        this.parseCurrent(this.normalizePath(path));
    }

    onChange(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    getHistory() {
        return [...this.navigationHistory];
    }

    clearHistory() {
        this.navigationHistory = [];
    }

    parseCurrent(forcedPath = null) {
        const path = forcedPath || this.getCurrentPath();
        const query = this.getCurrentQuery();
        const matched = this.matchRoute(path);

        const next = {
            path,
            fullPath: this.getCurrentFullPath(path),
            query,
            params: matched?.params || {},
            route: matched?.route || null,
            state: window.history.state || null,
            ts: Date.now()
        };

        this.previous = this.current;
        this.current = next;

        if (this.trackHistory) this.navigationHistory.push(next);
        this.notifyChange(next, this.previous);
        matched?.route?.handler?.(next, this.previous);
    }

    matchRoute(path) {
        for (let i = 0; i < this.routes.length; i += 1) {
            const route = this.routes[i];
            const match = route.regex.exec(path);
            if (!match) continue;

            const params = {};
            route.keys.forEach((key, idx) => {
                params[key] = decodeURIComponent(match[idx + 1] || '');
            });

            return { route, params };
        }

        const fallback = this.routes.find((r) => r.path === '/');
        return fallback ? { route: fallback, params: {} } : null;
    }

    pathToRegex(path, keys) {
        const escaped = path
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\\\/:([a-zA-Z0-9_]+)/g, (_m, key) => {
                keys.push(key);
                return '/([^/]+)';
            });
        return new RegExp(`^${escaped}$`);
    }

    normalizePath(path) {
        let normalized = String(path || '/');
        if (!normalized.startsWith('/')) normalized = `/${normalized}`;
        normalized = normalized.replace(/\/{2,}/g, '/');
        if (normalized.length > 1) normalized = normalized.replace(/\/+$/, '');
        return normalized || '/';
    }

    buildUrl(path) {
        if (this.base === '/') return path;
        if (path === '/') return this.base;
        return `${this.base}${path}`;
    }

    getCurrentPath() {
        if (this.hashMode) {
            const hashPath = window.location.hash.replace(/^#/, '');
            return this.normalizePath(hashPath || '/');
        }

        const pathname = window.location.pathname || '/';
        if (this.base !== '/' && pathname.startsWith(this.base)) {
            const trimmed = pathname.slice(this.base.length) || '/';
            return this.normalizePath(trimmed);
        }
        return this.normalizePath(pathname);
    }

    getCurrentQuery() {
        const source = this.hashMode
            ? (window.location.hash.split('?')[1] || '')
            : window.location.search.replace(/^\?/, '');

        const params = new URLSearchParams(source);
        const query = {};
        params.forEach((value, key) => {
            if (Object.prototype.hasOwnProperty.call(query, key)) {
                if (Array.isArray(query[key])) query[key].push(value);
                else query[key] = [query[key], value];
            } else {
                query[key] = value;
            }
        });
        return query;
    }

    getCurrentFullPath(path) {
        const search = window.location.search || '';
        if (this.hashMode) {
            const hash = window.location.hash.replace(/^#/, '');
            return hash ? `/${hash.replace(/^\/+/, '')}` : path;
        }
        return `${path}${search}`;
    }

    notifyChange(next, prev) {
        this.listeners.forEach((cb) => cb(next, prev));
    }

    handleLinkClick(e) {
        const a = e.target.closest('a');
        if (!a || !a.href) return;

        if (a.target && a.target !== '_self') return;
        if (a.hasAttribute('download')) return;
        if (a.hasAttribute('data-native')) return;
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        const linkUrl = new URL(a.href, window.location.origin);
        if (linkUrl.origin !== window.location.origin) return;

        let path = '';
        if (this.hashMode) {
            path = linkUrl.hash ? linkUrl.hash.replace(/^#/, '') : '/';
        } else {
            path = linkUrl.pathname;
            if (this.base !== '/' && path.startsWith(this.base)) {
                path = path.slice(this.base.length) || '/';
            }
        }

        e.preventDefault();
        this.go(path);
    }
}


if (typeof window !== 'undefined') {
    window.Navigation = Navigation;
}

export { Navigation };
