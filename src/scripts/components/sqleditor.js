import { Component } from './component.js';
import { SQL_FUNCTIONS, SQL_KEYWORDS, parameterNames, tokenize } from '../utils/sql_tokens.js';

/** Past this many characters the text is shown without colour, so typing stays quick. */
const HIGHLIGHT_LIMIT = 60000;
const MAX_SUGGESTIONS = 8;
const COLOURED = new Set(['comment', 'string', 'identifier', 'number', 'param', 'keyword', 'function']);
const KEYWORD_LIST = Array.from(SQL_KEYWORDS);

/**
 * An editor for SQL: coloured keywords, strings, numbers, comments and `:name` parameters; suggestions for keywords, functions, tables and
 * columns; Ctrl+Enter to run; Ctrl+/ to comment lines; and a row for each `:name` parameter in the text to give it a type and a value.
 *
 * ```html
 * <sqleditor schema='{"orders":["id","region","total"],"customers":["id","name"]}'>
 *     SELECT region, sum(total) FROM orders WHERE region = :region GROUP BY region
 * </sqleditor>
 * ```
 *
 * The text is the `value` attribute or, without it, the element's own text. `schema` (a JSON object of table to column names) feeds the
 * suggestions; `readonly` stops editing; `height` is the editor's height in pixels; `show-params` (default true) shows the parameter rows;
 * `run-label` is the run button's text.
 *
 * Events (on the editor element, bubbling):
 * - `sqleditorrun` -- Ctrl+Enter or the run button: `{ sql, selection, params }`, where `sql` is the selected text if there is a selection, and
 *   `params` is `[{ name, type, value }]` for the parameters that text uses
 * - `sqleditorchange` -- the text changed: `{ value, parameters }`
 * - `sqleditorparams` -- a parameter appeared, vanished, or had its type or value set: `{ params }`
 */
class SqlEditorComponent extends Component {
    static get selector() {
        return 'sqleditor';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'sqleditor';
    }

    static templateId = 'sqleditor-template';

    static props = {
        value: { attr: 'value', default: '' },
        schema: { attr: 'schema', type: 'object', default: {} },
        readonly: { attr: 'readonly', type: 'boolean', default: false },
        height: { attr: 'height', type: 'number', default: 180 },
        placeholder: { attr: 'placeholder', default: '' },
        runLabel: { attr: 'run-label', default: 'Run' },
        showParams: { attr: 'show-params', type: 'boolean', default: true }
    };

    static events = {
        'click [data-action="run"]': 'runClicked',
        'input [data-role="input"]': 'inputChanged',
        'keydown [data-role="input"]': 'keyPressed',
        'input [data-role="param-value"]': 'paramEdited',
        'change [data-role="param-type"]': 'paramEdited',
        'mousedown [data-role="suggest"] li': 'suggestionPicked'
    };

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = SqlEditorComponent.templateId;
        this.paramState = new Map();
        this.names = [];
        this.suggestions = [];
        this.active = 0;
        this.initComponent();
    }

    setup() {
        const texts = Array.from(this.container.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
        const inline = texts.map((node) => node.textContent).join('').trim();
        texts.forEach((node) => node.remove());
        this.initial = this.props.value || inline;
        this.schema = this.normaliseSchema(this.props.schema);
    }

    afterRender() {
        this.element = this.container.querySelector('.holi-sqleditor');
        this.inputEl = this.element.querySelector('[data-role="input"]');
        this.highlightEl = this.element.querySelector('[data-role="highlight"]');
        this.suggestEl = this.element.querySelector('[data-role="suggest"]');
        this.paramsEl = this.element.querySelector('[data-role="params"]');
        this.runEl = this.element.querySelector('[data-action="run"]');
        if (!this.inputEl || !this.highlightEl || !this.suggestEl || !this.paramsEl || !this.runEl) {
            throw new Error('SQL editor template is missing required nodes');
        }
        this.projectSlots(['actions']);
        this.element.style.setProperty('--sqleditor-height', `${Math.max(80, this.props.height)}px`);
        this.runEl.textContent = this.props.runLabel;
        this.inputEl.readOnly = !!this.props.readonly;
        if (this.props.placeholder) this.inputEl.placeholder = this.props.placeholder;
        this.inputEl.value = this.initial || '';
        this.paramsEl.hidden = !this.props.showParams;
        this.inputEl.addEventListener('scroll', () => this.syncScroll());
        this.inputEl.addEventListener('blur', () => this.closeSuggestions());
        this.redraw();
    }

    // ---- public API ------------------------------------------------------------------------------------------------

    getValue() {
        return this.inputEl.value;
    }

    setValue(sql) {
        this.inputEl.value = String(sql ?? '');
        this.redraw();
        this.emit('sqleditorchange', { value: this.getValue(), parameters: this.names.slice() });
    }

    /** The parameters the text uses now, as `[{ name, type, value }]`. */
    getParams() {
        return this.names.map((name) => ({ name, ...this.paramState.get(name) }));
    }

    /** Sets the type and value of parameters by name, as `[{ name, type, value }]`; names the text does not use are remembered for when it does. */
    setParams(params) {
        (Array.isArray(params) ? params : []).forEach((p) => {
            const state = this.paramState.get(p.name) || { type: 'text', value: '' };
            this.paramState.set(p.name, { type: p.type || state.type, value: p.value ?? state.value });
        });
        this.renderParams();
    }

    setSchema(schema) {
        this.schema = this.normaliseSchema(schema);
    }

    focus() {
        this.inputEl.focus();
    }

    // ---- rendering -------------------------------------------------------------------------------------------------

    /** Redraws the colouring, the parameter rows and the scroll position from the text. */
    redraw() {
        this.paintHighlight();
        this.updateParameters();
        this.syncScroll();
    }

    paintHighlight() {
        const text = this.inputEl.value;
        const fragment = document.createDocumentFragment();
        if (text.length > HIGHLIGHT_LIMIT) {
            fragment.appendChild(document.createTextNode(text));
        } else {
            tokenize(text).forEach((token) => {
                if (!COLOURED.has(token.type)) {
                    fragment.appendChild(document.createTextNode(token.text));
                    return;
                }
                const span = document.createElement('span');
                span.className = `holi-sql-${token.type}`;
                span.textContent = token.text;
                fragment.appendChild(span);
            });
        }
        // A final newline keeps the last line as tall here as in the textarea.
        fragment.appendChild(document.createTextNode('\n'));
        this.highlightEl.replaceChildren(fragment);
    }

    syncScroll() {
        this.highlightEl.scrollTop = this.inputEl.scrollTop;
        this.highlightEl.scrollLeft = this.inputEl.scrollLeft;
    }

    updateParameters() {
        const names = parameterNames(this.inputEl.value);
        const changed = names.length !== this.names.length || names.some((name, i) => name !== this.names[i]);
        this.names = names;
        names.forEach((name) => {
            if (!this.paramState.has(name)) this.paramState.set(name, { type: 'text', value: '' });
        });
        if (changed) {
            this.renderParams();
            this.emit('sqleditorparams', { params: this.getParams() });
        }
    }

    renderParams() {
        const items = this.names.map((name) => ({ name, value: this.paramState.get(name).value }));
        this.renderList(this.paramsEl, 'sqleditor-param-template', items, 'item');
        this.paramsEl.querySelectorAll('[data-role="param-type"]').forEach((select) => {
            select.value = this.paramState.get(select.dataset.param).type;
        });
        this.paramsEl.querySelectorAll('[data-role="param-value"]').forEach((input) => {
            input.type = this.paramState.get(input.dataset.param).type === 'text' ? 'text' : this.paramState.get(input.dataset.param).type;
            input.value = this.paramState.get(input.dataset.param).value;
        });
    }

    // ---- events ----------------------------------------------------------------------------------------------------

    inputChanged() {
        this.redraw();
        this.emit('sqleditorchange', { value: this.getValue(), parameters: this.names.slice() });
        this.openSuggestions(false);
    }

    paramEdited(event, trigger) {
        const name = trigger.dataset.param;
        const state = this.paramState.get(name);
        if (!state) return;
        if (trigger.dataset.role === 'param-type') {
            state.type = trigger.value;
            const input = this.paramsEl.querySelector(`[data-role="param-value"][data-param="${CSS.escape(name)}"]`);
            if (input) input.type = state.type === 'text' ? 'text' : state.type;
        } else {
            state.value = trigger.value;
        }
        this.emit('sqleditorparams', { params: this.getParams() });
    }

    runClicked() {
        this.run();
    }

    run() {
        const input = this.inputEl;
        const selected = input.selectionStart !== input.selectionEnd;
        const sql = selected ? input.value.slice(input.selectionStart, input.selectionEnd) : input.value;
        const used = new Set(parameterNames(sql));
        this.emit('sqleditorrun', { sql, selection: selected, params: this.getParams().filter((p) => used.has(p.name)) });
    }

    keyPressed(event) {
        if (this.suggestEl.hidden === false && this.suggestions.length) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                this.moveActive(event.key === 'ArrowDown' ? 1 : -1);
                return;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                this.acceptSuggestion(this.active);
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                this.closeSuggestions();
                return;
            }
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            this.run();
        } else if (event.key === ' ' && event.ctrlKey) {
            event.preventDefault();
            this.openSuggestions(true);
        } else if (event.key === '/' && (event.ctrlKey || event.metaKey) && !this.props.readonly) {
            event.preventDefault();
            this.toggleComment();
        } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
            this.closeSuggestions();
        }
    }

    /** Comments out the selected lines with `-- `, or takes the marks off when every non-empty line has one. */
    toggleComment() {
        const input = this.inputEl;
        const text = input.value;
        const start = text.lastIndexOf('\n', input.selectionStart - 1) + 1;
        let end = text.indexOf('\n', input.selectionEnd);
        if (end < 0) end = text.length;
        const lines = text.slice(start, end).split('\n');
        const filled = lines.filter((line) => line.trim() !== '');
        const uncomment = filled.length > 0 && filled.every((line) => /^\s*--/.test(line));
        const next = lines.map((line) => {
            if (line.trim() === '') return line;
            return uncomment ? line.replace(/^(\s*)-- ?/, '$1') : line.replace(/^(\s*)/, '$1-- ');
        }).join('\n');
        input.value = text.slice(0, start) + next + text.slice(end);
        input.setSelectionRange(start, start + next.length);
        this.inputChanged();
    }

    // ---- suggestions -----------------------------------------------------------------------------------------------

    normaliseSchema(schema) {
        const out = {};
        if (schema && typeof schema === 'object') {
            Object.keys(schema).forEach((table) => {
                out[table] = Array.isArray(schema[table]) ? schema[table].map((column) => String(column?.name ?? column)) : [];
            });
        }
        return out;
    }

    /** Offers completions for the word before the caret; {@code force} also offers them for an empty word (Ctrl+Space). */
    openSuggestions(force) {
        const input = this.inputEl;
        if (input.readOnly || input.selectionStart !== input.selectionEnd) return this.closeSuggestions();
        const caret = input.selectionStart;
        if (this.insideLiteral(caret)) return this.closeSuggestions();
        const match = /(?:([A-Za-z_][\w$]*)\.)?([A-Za-z_][\w$]*)?$/.exec(input.value.slice(0, caret));
        const qualifier = match?.[1] || '';
        const prefix = match?.[2] || '';
        if (!force && !prefix && !qualifier) return this.closeSuggestions();
        if (!force && !qualifier && prefix.length < 2) return this.closeSuggestions();
        const found = this.candidates(qualifier, prefix);
        if (!found.length) return this.closeSuggestions();
        this.suggestions = found;
        this.prefixLength = prefix.length;
        this.active = 0;
        this.paintSuggestions();
        this.placeSuggestions(caret);
    }

    /** True when the caret is inside a string, a quoted name, a comment or a parameter, where completions would only be in the way. */
    insideLiteral(caret) {
        const text = this.inputEl.value;
        if (text.length > HIGHLIGHT_LIMIT) return true;
        return tokenize(text).some((token) => (token.type === 'string' || token.type === 'identifier' || token.type === 'comment' || token.type === 'param')
            && caret > token.start && caret <= token.end);
    }

    candidates(qualifier, prefix) {
        const lower = prefix.toLowerCase();
        const matches = (name) => name.toLowerCase().startsWith(lower) && name !== prefix;
        const tables = Object.keys(this.schema);
        if (qualifier) {
            const table = tables.find((name) => name.toLowerCase() === qualifier.toLowerCase());
            return table ? this.schema[table].filter(matches).map((name) => ({ label: name, kind: 'column' })).slice(0, MAX_SUGGESTIONS) : [];
        }
        const seen = new Set();
        const out = [];
        const add = (label, kind) => {
            const key = `${kind}:${label}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ label, kind });
        };
        tables.filter(matches).forEach((name) => add(name, 'table'));
        tables.forEach((table) => this.schema[table].filter(matches).forEach((name) => add(name, 'column')));
        const lowerCase = prefix !== '' && prefix === prefix.toLowerCase();
        const cased = (word) => (lowerCase ? word.toLowerCase() : word);
        KEYWORD_LIST.filter((word) => word.toLowerCase().startsWith(lower) && word.toLowerCase() !== lower).forEach((word) => add(cased(word), 'keyword'));
        SQL_FUNCTIONS.filter((word) => word.toLowerCase().startsWith(lower) && word.toLowerCase() !== lower).forEach((word) => add(cased(word), 'function'));
        return out.slice(0, MAX_SUGGESTIONS);
    }

    paintSuggestions() {
        const items = this.suggestions.map((s, index) => ({ label: s.label, kind: s.kind, index }));
        this.renderList(this.suggestEl, 'sqleditor-suggest-item-template', items, 'item');
        this.suggestEl.hidden = false;
        this.markActive();
    }

    markActive() {
        this.suggestEl.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', String(i === this.active)));
    }

    moveActive(step) {
        this.active = (this.active + step + this.suggestions.length) % this.suggestions.length;
        this.markActive();
    }

    /** Puts the list under the caret. The text is monospace, so a column is `ch` wide and a line is a fixed height (see the stylesheet). */
    placeSuggestions(caret) {
        const before = this.inputEl.value.slice(0, caret);
        const line = before.split('\n').length - 1;
        const column = caret - (before.lastIndexOf('\n') + 1);
        const style = this.suggestEl.style;
        style.setProperty('--caret-line', String(line));
        style.setProperty('--caret-col', String(column - this.prefixLength));
        style.setProperty('--scroll-x', `${this.inputEl.scrollLeft}px`);
        style.setProperty('--scroll-y', `${this.inputEl.scrollTop}px`);
    }

    closeSuggestions() {
        this.suggestions = [];
        if (this.suggestEl) this.suggestEl.hidden = true;
    }

    suggestionPicked(event, trigger) {
        event.preventDefault();
        this.acceptSuggestion(Number(trigger.dataset.index));
    }

    acceptSuggestion(index) {
        const choice = this.suggestions[index];
        if (!choice) return;
        const input = this.inputEl;
        const caret = input.selectionStart;
        input.setRangeText(choice.label, caret - this.prefixLength, caret, 'end');
        this.closeSuggestions();
        this.redraw();
        this.emit('sqleditorchange', { value: this.getValue(), parameters: this.names.slice() });
        input.focus();
    }

    emit(name, detail) {
        this.element?.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
    }
}

export { SqlEditorComponent };
