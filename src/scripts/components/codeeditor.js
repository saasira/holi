import { Component } from './component.js';
import { CodeLanguages } from '../utils/code_languages.js';

/** Past this many characters the text is shown without colour, so typing stays quick. */
const HIGHLIGHT_LIMIT = 60000;
const MAX_SUGGESTIONS = 8;
/** Token types that are left as plain text. */
const PLAIN = new Set(['space', 'word', 'plain', 'operator', 'punctuation', 'text']);
const WORD_BEFORE_CARET = /(?:([A-Za-z_][\w$]*)\.)?([A-Za-z_][\w$]*)?$/;
let nextId = 1;

/**
 * An editor for code in any language: the text is coloured by the language's tokenizer, completions come from the language, Ctrl+Enter runs, and Ctrl+/ comments
 * lines. The editor knows no language itself; languages are registered by name (see {@link CodeLanguages}) and chosen with `language`:
 *
 * ```html
 * <codeeditor language="sql" height="200">SELECT 1</codeeditor>
 * ```
 *
 * The text is the `value` attribute or, without it, the element's own text. `readonly` stops editing; `height` is the editor's height in pixels; `hint` is the
 * line beside the run button; `show-run="false"` takes the run button away (Ctrl+Enter still runs); `data` (JSON) is what the language's completions can draw on,
 * and `setData()` replaces it. Elements slotted as `actions` go in the toolbar; those slotted as `footer` go under the text.
 *
 * Events (on the editor element, bubbling):
 * - `codeeditorrun` -- Ctrl+Enter or the run button: `{ code, selection }`, where `code` is the selected text if there is a selection and `selection` says so
 * - `codeeditorchange` -- the text changed: `{ value }`
 */
class CodeEditorComponent extends Component {
    static get selector() {
        return 'codeeditor';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'codeeditor';
    }

    static templateId = 'codeeditor-template';

    static props = {
        value: { attr: 'value', default: '' },
        language: { attr: 'language', default: '' },
        data: { attr: 'data', type: 'object', default: {} },
        readonly: { attr: 'readonly', type: 'boolean', default: false },
        height: { attr: 'height', type: 'number', default: 180 },
        placeholder: { attr: 'placeholder', default: '' },
        runLabel: { attr: 'run-label', default: 'Run' },
        hint: { attr: 'hint', default: 'Ctrl+Enter runs the selection, or all of it' },
        showRun: { attr: 'show-run', type: 'boolean', default: true }
    };

    static events = {
        'click [data-action="run"]': 'runClicked',
        'input [data-role="input"]': 'inputChanged',
        'keydown [data-role="input"]': 'keyPressed',
        'mousedown [data-role="suggest"] li': 'suggestionPicked'
    };

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = CodeEditorComponent.templateId;
        this.tokens = [];
        this.suggestions = [];
        this.active = 0;
        this.initComponent();
    }

    setup() {
        const texts = Array.from(this.container.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
        const inline = texts.map((node) => node.textContent).join('').trim();
        texts.forEach((node) => node.remove());
        this.initial = this.props.value || inline;
        this.languageName = this.props.language;
        this.contextData = this.props.data && typeof this.props.data === 'object' ? this.props.data : {};
    }

    afterRender() {
        this.element = this.container.querySelector('.holi-codeeditor');
        this.inputEl = this.element.querySelector('[data-role="input"]');
        this.highlightEl = this.element.querySelector('[data-role="highlight"]');
        this.suggestEl = this.element.querySelector('[data-role="suggest"]');
        this.runEl = this.element.querySelector('[data-action="run"]');
        this.hintEl = this.element.querySelector('[data-role="hint"]');
        if (!this.inputEl || !this.highlightEl || !this.suggestEl || !this.runEl || !this.hintEl) {
            throw new Error('Code editor template is missing required nodes');
        }
        this.projectSlots(['actions', 'footer']);
        this.element.style.setProperty('--codeeditor-height', `${Math.max(80, this.props.height)}px`);
        this.runEl.textContent = this.props.runLabel;
        this.runEl.hidden = !this.props.showRun;
        this.hintEl.id = `codeeditor-hint-${nextId++}`;
        this.hintEl.textContent = this.props.hint;
        this.inputEl.setAttribute('aria-describedby', this.hintEl.id);
        this.inputEl.readOnly = !!this.props.readonly;
        if (this.props.placeholder) this.inputEl.placeholder = this.props.placeholder;
        this.inputEl.value = this.initial || '';
        this.inputEl.addEventListener('scroll', () => this.syncScroll());
        this.inputEl.addEventListener('blur', () => this.closeSuggestions());
        // A language registered after this editor was drawn colours it as soon as it is there.
        this.stopListening = CodeLanguages.onRegister((name) => {
            if (name === String(this.languageName || '').toLowerCase()) this.redraw();
        });
        this.redraw();
    }

    // ---- public API ------------------------------------------------------------------------------------------------

    getValue() {
        return this.inputEl.value;
    }

    setValue(code) {
        this.inputEl.value = String(code ?? '');
        this.closeSuggestions();
        this.redraw();
        this.emit('codeeditorchange', { value: this.getValue() });
    }

    /** The selected text, or an empty string. */
    getSelection() {
        return this.inputEl.value.slice(this.inputEl.selectionStart, this.inputEl.selectionEnd);
    }

    /** Puts text at the caret, in place of the selection, and leaves the caret after it. */
    insertText(text) {
        this.inputEl.focus();
        this.inputEl.setRangeText(String(text), this.inputEl.selectionStart, this.inputEl.selectionEnd, 'end');
        this.inputChanged();
    }

    /** What the language's completions can draw on (a database schema, the names in scope): any object the language understands. */
    setData(data) {
        this.contextData = data && typeof data === 'object' ? data : {};
    }

    setLanguage(name) {
        this.languageName = String(name || '');
        this.redraw();
    }

    focus() {
        this.inputEl.focus();
    }

    language() {
        return CodeLanguages.get(this.languageName);
    }

    // ---- rendering -------------------------------------------------------------------------------------------------

    /** Redraws the colouring and the scroll position from the text. */
    redraw() {
        const text = this.inputEl.value;
        const language = this.language();
        this.tokens = language && text.length <= HIGHLIGHT_LIMIT ? this.tokenize(language, text) : [];
        const fragment = document.createDocumentFragment();
        if (!this.tokens.length) {
            fragment.appendChild(document.createTextNode(text));
        } else {
            this.tokens.forEach((token) => {
                if (PLAIN.has(token.type)) {
                    fragment.appendChild(document.createTextNode(token.text));
                    return;
                }
                const span = document.createElement('span');
                span.className = `holi-code-${token.type}`;
                span.textContent = token.text;
                fragment.appendChild(span);
            });
        }
        // A final newline keeps the last line as tall here as in the textarea.
        fragment.appendChild(document.createTextNode('\n'));
        this.highlightEl.replaceChildren(fragment);
        this.syncScroll();
    }

    /** The language's tokens, or none when it fails: a faulty tokenizer must not take the editor down. */
    tokenize(language, text) {
        try {
            const tokens = language.tokenize(text);
            return Array.isArray(tokens) ? tokens : [];
        } catch (error) {
            console.warn('The code language failed to tokenize:', error);
            return [];
        }
    }

    syncScroll() {
        this.highlightEl.scrollTop = this.inputEl.scrollTop;
        this.highlightEl.scrollLeft = this.inputEl.scrollLeft;
    }

    // ---- events ----------------------------------------------------------------------------------------------------

    inputChanged() {
        this.redraw();
        this.emit('codeeditorchange', { value: this.getValue() });
        this.openSuggestions(false);
    }

    runClicked() {
        this.run();
    }

    run() {
        const selected = this.inputEl.selectionStart !== this.inputEl.selectionEnd;
        this.emit('codeeditorrun', { code: selected ? this.getSelection() : this.getValue(), selection: selected });
    }

    keyPressed(event) {
        // Ctrl+Enter runs even with the list open; plain Enter and Tab choose from it.
        if (this.suggestEl.hidden === false && this.suggestions.length && !event.ctrlKey && !event.metaKey) {
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

    /** Puts the language's line-comment mark on the selected lines, or takes it off when every non-empty line has one. */
    toggleComment() {
        const mark = this.language()?.comment;
        if (!mark) return;
        const escaped = mark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const bare = new RegExp(`^\\s*${escaped}`);
        const strip = new RegExp(`^(\\s*)${escaped} ?`);
        const input = this.inputEl;
        const text = input.value;
        const start = text.lastIndexOf('\n', input.selectionStart - 1) + 1;
        let end = text.indexOf('\n', input.selectionEnd);
        if (end < 0) end = text.length;
        const lines = text.slice(start, end).split('\n');
        const filled = lines.filter((line) => line.trim() !== '');
        const uncomment = filled.length > 0 && filled.every((line) => bare.test(line));
        const next = lines.map((line) => {
            if (line.trim() === '') return line;
            return uncomment ? line.replace(strip, '$1') : line.replace(/^(\s*)/, `$1${mark} `);
        }).join('\n');
        input.value = text.slice(0, start) + next + text.slice(end);
        input.setSelectionRange(start, start + next.length);
        this.inputChanged();
    }

    // ---- suggestions -----------------------------------------------------------------------------------------------

    /** Offers the language's completions for the word before the caret; {@code force} also offers them for an empty word (Ctrl+Space). */
    openSuggestions(force) {
        const language = this.language();
        const input = this.inputEl;
        if (!language || typeof language.suggest !== 'function' || input.readOnly || input.selectionStart !== input.selectionEnd) return this.closeSuggestions();
        const caret = input.selectionStart;
        if (this.insideLiteral(caret)) return this.closeSuggestions();
        const match = WORD_BEFORE_CARET.exec(input.value.slice(0, caret));
        const qualifier = match?.[1] || '';
        const prefix = match?.[2] || '';
        if (!force && !qualifier && !prefix) return this.closeSuggestions();
        const minimum = Number.isFinite(language.minPrefix) ? language.minPrefix : 2;
        if (!force && !qualifier && prefix.length < minimum) return this.closeSuggestions();
        let found = [];
        try {
            found = language.suggest({ text: input.value, caret, prefix, qualifier, force: !!force, tokens: this.tokens, data: this.contextData }) || [];
        } catch (error) {
            console.warn('The code language failed to suggest:', error);
        }
        found = found.filter((s) => s && s.label).slice(0, MAX_SUGGESTIONS);
        if (!found.length) return this.closeSuggestions();
        this.suggestions = found;
        this.prefixLength = prefix.length;
        this.active = 0;
        this.paintSuggestions();
        this.placeSuggestions(caret);
    }

    /** True when the caret is inside a string or a comment, where completions would only be in the way. */
    insideLiteral(caret) {
        return this.tokens.some((token) => (token.type === 'string' || token.type === 'comment') && caret > token.start && caret <= token.end);
    }

    paintSuggestions() {
        const items = this.suggestions.map((s, index) => ({ label: s.label, kind: s.kind || '', index }));
        this.renderList(this.suggestEl, 'codeeditor-suggest-item-template', items, 'item');
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
        this.emit('codeeditorchange', { value: this.getValue() });
        input.focus();
    }

    emit(name, detail) {
        this.element?.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
    }

    destroy() {
        this.stopListening?.();
        super.destroy();
    }
}

export { CodeEditorComponent };
