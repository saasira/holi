import { Component } from './component.js';
import { attachLoaderState } from '../utils/loader_state.js';
import { attachComponentStateBinding } from '../utils/component_state_binding.js';

class SearchComponent extends Component {
    static get selector() {
        return '[data-search]';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'search';
    }

    static templateId = 'search-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = SearchComponent.templateId;
        this.config = {
            endpoint: this.readAttr(['data-endpoint', 'endpoint'], ''),
            suggestionsEndpoint: this.readAttr(['data-suggestions-endpoint', 'data-suggest-endpoint', 'suggestions'], ''),
            placeholder: this.readAttr(['placeholder', 'data-placeholder'], 'Search...'),
            minLength: Math.max(1, Number(this.readAttr(['data-min-length', 'min-length'], '1')) || 1),
            suggestionLimit: Math.max(1, Number(this.readAttr(['data-suggestion-limit', 'suggestion-limit'], '6')) || 6),
            resultLimit: Math.max(1, Number(this.readAttr(['data-limit', 'limit'], '10')) || 10),
            debounceMs: Math.max(0, Number(this.readAttr(['data-debounce-ms', 'debounce-ms'], '200')) || 200)
        };
        this.state = {
            query: '',
            suggestions: [],
            results: [],
            activeSuggestion: -1,
            open: false,
            loading: false
        };
        this.fetchSeq = 0;
        this.debounceTimer = null;
        this.boundOutsideClick = (event) => this.handleOutsideClick(event);
        this.init();
    }

    readAttr(names, fallback = '') {
        for (let i = 0; i < names.length; i += 1) {
            const value = this.container.getAttribute(names[i]);
            if (value != null && String(value).trim() !== '') return String(value).trim();
        }
        return fallback;
    }

    parseJsonAttr(attrName, fallback = []) {
        const raw = String(this.container.getAttribute(attrName) || '').trim();
        if (!raw) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : fallback;
        } catch (_error) {
            return fallback;
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
        this.bindEvents();
        this.renderSuggestions();
        this.renderResults();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-search');
        this.input = this.container.querySelector('[data-role="input"]');
        this.suggestionPanel = this.container.querySelector('[data-role="suggestions"]');
        this.suggestionList = this.container.querySelector('[data-role="suggestions-list"]');
        this.resultsPanel = this.container.querySelector('[data-role="results"]');
        this.resultsList = this.container.querySelector('[data-role="results-list"]');
        this.emptyEl = this.container.querySelector('[data-role="empty"]');
        this.loadingEl = this.container.querySelector('[data-role="loading"]');
        this.form = this.container.querySelector('[data-role="form"]');
        this.loaderState = attachLoaderState(this, {
            host: this.resultsPanel || this.element,
            busyTarget: this.resultsPanel || this.element,
            scope: 'block',
            defaultMessage: 'Searching...'
        });
        this.stateBinding = attachComponentStateBinding(this, {
            defaultPath: 'search',
            eventName: 'searchchange',
            getSnapshot: (component) => component.getBindableState(),
            applySnapshot: (component, snapshot) => component.applyBindableState(snapshot)
        });

        if (this.input) {
            this.input.placeholder = this.config.placeholder;
            this.input.setAttribute('autocomplete', 'off');
            this.input.setAttribute('aria-expanded', 'false');
            this.input.setAttribute('aria-autocomplete', 'list');
            this.input.setAttribute('role', 'combobox');
            this.input.setAttribute('aria-haspopup', 'listbox');

            const listId = this.suggestionList.id || `search-suggestions-${Math.random().toString(16).slice(2)}`;
            this.suggestionList.id = listId;
            this.input.setAttribute('aria-controls', listId);
        }
    }

    bindEvents() {
        this.input?.addEventListener('input', () => {
            const query = String(this.input.value || '').trim();
            this.state.query = query;
            this.state.activeSuggestion = -1;
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                void this.search(query);
            }, this.config.debounceMs);
        });

        this.form?.addEventListener('submit', (event) => {
            event.preventDefault();
            const query = String(this.input?.value || '').trim();
            this.state.query = query;
            this.closeSuggestions();
            void this.search(query);
        });

        this.input?.addEventListener('keydown', (event) => this.handleKeydown(event));
        this.suggestionList?.addEventListener('mousedown', (event) => event.preventDefault());
        this.suggestionList?.addEventListener('click', (event) => this.handleSuggestionClick(event));
        document.addEventListener('click', this.boundOutsideClick);
    }

    handleOutsideClick(event) {
        if (!this.container.contains(event.target)) {
            this.closeSuggestions();
        }
    }

    handleSuggestionClick(event) {
        const button = event.target?.closest?.('[data-role="suggestion"]');
        if (!button) return;
        const value = String(button.getAttribute('data-value') || '').trim();
        if (!value) return;
        this.selectSuggestion(value);
    }

    handleKeydown(event) {
        if (!this.state.open || !this.state.suggestions.length) {
            if (event.key === 'Escape') {
                this.closeSuggestions();
            }
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            const next = (this.state.activeSuggestion + 1) % this.state.suggestions.length;
            this.setActiveSuggestion(next);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            const prev = this.state.activeSuggestion <= 0
                ? this.state.suggestions.length - 1
                : this.state.activeSuggestion - 1;
            this.setActiveSuggestion(prev);
            return;
        }

        if (event.key === 'Enter') {
            if (this.state.activeSuggestion >= 0) {
                event.preventDefault();
                const item = this.state.suggestions[this.state.activeSuggestion];
                this.selectSuggestion(item?.value || item?.label || '');
            }
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            this.closeSuggestions();
        }
    }

    setActiveSuggestion(index) {
        this.state.activeSuggestion = index;
        const options = Array.from(this.suggestionList?.querySelectorAll('[data-role="suggestion"]') || []);
        options.forEach((button, idx) => {
            const active = idx === index;
            button.setAttribute('aria-selected', active ? 'true' : 'false');
            button.classList.toggle('is-active', active);
            if (active) {
                button.scrollIntoView({ block: 'nearest' });
                this.input?.setAttribute('aria-activedescendant', button.id);
            }
        });
    }

    selectSuggestion(value) {
        if (!this.input) return;
        this.input.value = value;
        this.state.query = value;
        this.state.activeSuggestion = -1;
        this.closeSuggestions();
        this.dispatchEvent('searchsuggestselect', { suggestion: value });
        void this.search(value);
    }

    async search(query) {
        const trimmed = String(query || '').trim();
        if (trimmed.length < this.config.minLength) {
            this.state.suggestions = [];
            this.state.results = [];
            this.state.activeSuggestion = -1;
            this.closeSuggestions();
            this.renderSuggestions();
            this.renderResults();
            return;
        }

        const seq = ++this.fetchSeq;
        this.setLoading(true);
        try {
            const [suggestions, results] = await Promise.all([
                this.fetchSuggestions(trimmed),
                this.fetchResults(trimmed)
            ]);
            if (seq !== this.fetchSeq) return;
            this.state.suggestions = suggestions;
            this.state.results = results;
            this.state.activeSuggestion = -1;
            this.openSuggestionsIfNeeded();
            this.renderSuggestions();
            this.renderResults();
            this.dispatchEvent('searchchange', {
                query: trimmed,
                suggestionCount: suggestions.length,
                resultCount: results.length
            });
        } finally {
            if (seq === this.fetchSeq) this.setLoading(false);
        }
    }

    openSuggestionsIfNeeded() {
        const shouldOpen = this.state.suggestions.length > 0 && document.activeElement === this.input;
        this.state.open = shouldOpen;
        if (this.suggestionPanel) this.suggestionPanel.hidden = !shouldOpen;
        this.input?.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        if (!shouldOpen) this.input?.removeAttribute('aria-activedescendant');
    }

    closeSuggestions() {
        this.state.open = false;
        if (this.suggestionPanel) this.suggestionPanel.hidden = true;
        this.input?.setAttribute('aria-expanded', 'false');
        this.input?.removeAttribute('aria-activedescendant');
    }

    async fetchSuggestions(query) {
        if (this.config.suggestionsEndpoint) {
            const url = new URL(this.config.suggestionsEndpoint, window.location.origin);
            url.searchParams.set('q', query);
            url.searchParams.set('limit', String(this.config.suggestionLimit));
            const response = await fetch(url.toString(), { credentials: 'same-origin' });
            if (!response.ok) return [];
            const payload = await response.json();
            const normalized = this.normalizeSuggestionList(payload);
            const q = query.toLowerCase();
            return normalized
                .filter((item) => item.label.toLowerCase().includes(q))
                .slice(0, this.config.suggestionLimit);
        }

        const local = this.parseJsonAttr('data-suggestions', []);
        const normalized = this.normalizeSuggestionList(local);
        const q = query.toLowerCase();
        return normalized.filter((item) => item.label.toLowerCase().includes(q)).slice(0, this.config.suggestionLimit);
    }

    async fetchResults(query) {
        if (this.config.endpoint) {
            const url = new URL(this.config.endpoint, window.location.origin);
            url.searchParams.set('q', query);
            url.searchParams.set('limit', String(this.config.resultLimit));
            const response = await fetch(url.toString(), { credentials: 'same-origin' });
            if (!response.ok) return [];
            const payload = await response.json();
            const normalized = this.normalizeResultList(payload);
            const q = query.toLowerCase();
            return normalized.filter((item) => {
                return item.title.toLowerCase().includes(q)
                    || item.description.toLowerCase().includes(q)
                    || item.url.toLowerCase().includes(q);
            }).slice(0, this.config.resultLimit);
        }

        const local = this.parseJsonAttr('data-search-data', []);
        const normalized = this.normalizeResultList(local);
        const q = query.toLowerCase();
        return normalized.filter((item) => {
            return item.title.toLowerCase().includes(q)
                || item.description.toLowerCase().includes(q)
                || item.url.toLowerCase().includes(q);
        }).slice(0, this.config.resultLimit);
    }

    normalizeSuggestionList(payload) {
        const list = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.items)
                ? payload.items
                : Array.isArray(payload?.rows)
                    ? payload.rows
                    : [];

        return list.map((item) => {
            if (item && typeof item === 'object') {
                const label = String(item.label ?? item.name ?? item.title ?? item.value ?? '').trim();
                const value = String(item.value ?? label).trim();
                return { label, value };
            }
            const value = String(item ?? '').trim();
            return { label: value, value };
        }).filter((item) => item.label);
    }

    normalizeResultList(payload) {
        const list = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.items)
                ? payload.items
                : Array.isArray(payload?.rows)
                    ? payload.rows
                    : Array.isArray(payload?.data)
                        ? payload.data
                        : [];

        return list.map((item) => {
            if (item && typeof item === 'object') {
                const title = String(item.title ?? item.name ?? item.label ?? '').trim();
                const description = String(item.description ?? item.content ?? '').trim();
                const url = String(item.url ?? item.href ?? '').trim();
                return { title, description, url, item };
            }
            return {
                title: String(item ?? '').trim(),
                description: '',
                url: '',
                item
            };
        }).filter((item) => item.title);
    }

    setLoading(loading) {
        this.state.loading = !!loading;
        if (this.loadingEl) this.loadingEl.hidden = !loading;
        this.loaderState?.setLoading?.(this.state.loading, 'Searching...');
    }

    getBindableState() {
        return {
            query: this.state.query || '',
            suggestions: [...(this.state.suggestions || [])],
            results: [...(this.state.results || [])]
        };
    }

    applyBindableState(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return;
        if (typeof snapshot.query !== 'string') return;
        const query = snapshot.query.trim();
        if (query === this.state.query) return;
        this.state.query = query;
        if (this.input) this.input.value = query;
        void this.search(query);
    }

    renderSuggestions() {
        if (!this.suggestionList) return;
        this.suggestionList.replaceChildren();
        const listId = this.suggestionList.id || `search-suggestions-${Math.random().toString(16).slice(2)}`;
        this.suggestionList.id = listId;

        this.state.suggestions.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'holi-search-suggestion-row';
            li.setAttribute('role', 'presentation');

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'holi-search-suggestion';
            button.setAttribute('data-role', 'suggestion');
            button.setAttribute('data-value', item.value);
            button.setAttribute('aria-selected', 'false');
            button.setAttribute('role', 'option');
            button.id = `${listId}-item-${index}`;
            button.textContent = item.label;

            li.appendChild(button);
            this.suggestionList.appendChild(li);
        });

        if (this.state.open && this.state.suggestions.length > 0) {
            this.suggestionPanel.hidden = false;
            this.input?.setAttribute('aria-expanded', 'true');
        } else {
            this.closeSuggestions();
        }
    }

    renderResults() {
        if (!this.resultsList) return;
        this.resultsList.replaceChildren();

        this.state.results.forEach((item) => {
            const row = document.createElement('article');
            row.className = 'holi-search-result';
            row.setAttribute('data-role', 'result');

            const title = document.createElement(item.url ? 'a' : 'h4');
            title.className = 'holi-search-result-title';
            title.textContent = item.title;
            if (item.url) {
                title.href = item.url;
                title.setAttribute('data-role', 'result-link');
            }

            row.appendChild(title);

            if (item.description) {
                const description = document.createElement('p');
                description.className = 'holi-search-result-description';
                description.textContent = item.description;
                row.appendChild(description);
            }

            this.resultsList.appendChild(row);
        });

        if (this.emptyEl) {
            const hasQuery = this.state.query.length >= this.config.minLength;
            this.emptyEl.hidden = this.state.loading || !hasQuery || this.state.results.length > 0;
        }
    }

    destroy() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.loaderState?.destroy?.();
        this.stateBinding?.disconnect?.();
        document.removeEventListener('click', this.boundOutsideClick);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.SearchComponent = SearchComponent;
}

export { SearchComponent };
