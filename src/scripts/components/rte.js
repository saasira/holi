import { Component } from './component.js';

/**
 * Rich Text Editor.
 *
 * A contentEditable-based editor with an extensible formatting toolbar. Structure lives in the
 * `rte-*` templates; the JavaScript only wires behaviour and moves user content nodes — it never
 * builds component structure from HTML strings.
 *
 * Discovery: `<rte>`, `<div component="rte">`, `<div role="rte">`.
 *
 * Progressive enhancement: the element's authored inner HTML becomes the initial editor content, so
 * the formatted content is present (and SEO-visible) before JavaScript runs. Falls back to the
 * `value` attribute when there is no authored content.
 *
 * Value: mirrored into a hidden `<input>` (named by `name`) for form submission, exposed via the
 * `value` getter/setter, and emitted on `rtechange` as `{ html }`.
 *
 * ## Extensibility
 *
 * The toolbar is data-driven. Customers add buttons + actions without editing the component:
 *
 * ```js
 * // A single command:
 * RteComponent.registerCommand({
 *     name: 'highlight',
 *     label: 'HL',
 *     title: 'Highlight',
 *     run: (rte) => rte.exec('hiliteColor', 'yellow'),
 *     active: (rte) => document.queryCommandValue('hiliteColor') === 'yellow'
 * });
 *
 * // Or a plugin (a bundle of commands + optional per-instance init):
 * RteComponent.use({
 *     name: 'emoji',
 *     commands: [{ name: 'emoji', label: '🙂', title: 'Insert emoji',
 *                  run: (rte) => rte.insertHTML('🙂') }],
 *     init: (rte) => { /* per-instance setup *\/ }
 * });
 * ```
 *
 * Which buttons show (and their order) is the built-in default plus any registered custom commands;
 * an instance may override with `toolbar="bold italic | h1 h2 | emoji"` (`|` = separator).
 *
 * A command descriptor:
 * - `name`    unique id (also the `data-command` value)
 * - `label`   button text (styled via CSS by `data-command`)
 * - `title`   tooltip / aria-label
 * - `exec`    optional `execCommand` token (simple path)
 * - `value`   optional argument for `exec`
 * - `run`     optional `(rte, cmd) => void` custom action (overrides `exec`)
 * - `active`  optional `true` (reflect `queryCommandState(exec)`) or `(rte, cmd) => boolean`
 *
 * Note: the built-in commands use `document.execCommand` (the long-standing contentEditable command
 * API — deprecated but universally supported). It is reached only through {@link exec}, so the engine
 * can be replaced later without touching commands, plugins, the toolbar, or the template.
 */
class RteComponent extends Component {
    static get selector() {
        return 'rte';
    }

    static get componentName() {
        return 'rte';
    }

    static get library() {
        return 'holi';
    }

    static templateId = 'rte-template';

    static props = {
        name: { attr: 'name', default: '' },
        value: { attr: 'value', default: '' },
        placeholder: { attr: 'placeholder', default: 'Start writing…' },
        toolbar: { attr: 'toolbar', default: '' },
        disabled: { attr: 'disabled', type: 'boolean', default: false }
    };

    static events = {
        'click [data-command]': 'onToolbar',
        'input [data-role="editable"]': 'onInput',
        'keyup [data-role="editable"]': 'refreshToolbarState',
        'mouseup [data-role="editable"]': 'refreshToolbarState',
        'focus [data-role="editable"]': 'refreshToolbarState'
    };

    // -------------------------------------------------------------------------
    // Command registry (extension surface)
    // -------------------------------------------------------------------------

    static commands = new Map();     // name -> descriptor
    static builtInNames = new Set(); // to distinguish defaults from customer additions
    static plugins = [];             // registered plugins (for per-instance init hooks)
    static defaultToolbar = [
        'bold', 'italic', 'underline', 'strikeThrough', '|',
        'h1', 'h2', 'h3', 'paragraph', 'blockquote', '|',
        'ul', 'ol', '|',
        'link', 'unlink', 'removeFormat'
    ];

    /** Register (or override) a toolbar command. */
    static registerCommand(command) {
        if (!command || typeof command !== 'object') return;
        const name = String(command.name || '').trim();
        if (!name) return;
        this.commands.set(name, { ...command, name });
    }

    static registerCommands(list = []) {
        (Array.isArray(list) ? list : [list]).forEach((c) => this.registerCommand(c));
    }

    static getCommand(name) {
        return this.commands.get(String(name || '').trim()) || null;
    }

    /** Register a plugin: its commands plus an optional per-instance `init(rte)` hook. */
    static use(plugin) {
        if (!plugin || typeof plugin !== 'object') return;
        this.registerCommands(plugin.commands || []);
        if (!this.plugins.includes(plugin)) this.plugins.push(plugin);
    }

    static registerBuiltIns() {
        if (this.builtInNames.size) return;
        BUILTIN_COMMANDS.forEach((c) => {
            this.registerCommand(c);
            this.builtInNames.add(c.name);
        });
    }

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = RteComponent.templateId;
        this._value = '';
        RteComponent.registerBuiltIns();
        this.initComponent();
    }

    /** Capture authored content before the template is rendered into the host. */
    beforeSetup() {
        this._initialHtml = this.container.innerHTML;
        this.container.replaceChildren(); // cleared; re-injected into the editable surface after render
    }

    afterRender() {
        this.element = this.container.querySelector('.holi-rte');
        this.editable = this.container.querySelector('[data-role="editable"]');
        this.valueInput = this.container.querySelector('[data-role="value"]');
        this.toolbar = this.container.querySelector('[data-role="toolbar"]');

        if (this.valueInput && this.prop('name')) {
            this.valueInput.setAttribute('name', this.prop('name'));
        }
        if (this.editable && this.prop('placeholder')) {
            this.editable.setAttribute('data-placeholder', this.prop('placeholder'));
        }

        this.buildToolbar();

        const authored = (this._initialHtml || '').trim();
        const initial = authored || String(this.prop('value') || '');
        if (initial) this.setEditableHtml(initial);

        this.setDisabled(this.prop('disabled'));
        this.syncValue();
        this.refreshToolbarState();
    }

    ready() {
        // Per-instance plugin initialization.
        RteComponent.plugins.forEach((plugin) => {
            if (typeof plugin.init === 'function') {
                try { plugin.init(this); } catch (_error) {}
            }
        });
    }

    // -------------------------------------------------------------------------
    // Toolbar (rendered from the resolved command list; wraps to next line via CSS)
    // -------------------------------------------------------------------------

    resolveToolbarNames() {
        const spec = String(this.prop('toolbar') || '').trim();
        if (spec) return spec.split(/\s+/);

        const names = [...RteComponent.defaultToolbar];
        const customs = Array.from(RteComponent.commands.keys())
            .filter((name) => !RteComponent.builtInNames.has(name));
        if (customs.length) names.push('|', ...customs);
        return names;
    }

    buildToolbar() {
        if (!this.toolbar) return;
        this.toolbar.replaceChildren();
        let lastWasSep = true; // suppress leading separators
        this.resolveToolbarNames().forEach((token) => {
            if (token === '|') {
                if (!lastWasSep) {
                    this.toolbar.appendChild(this.renderTemplate('rte-separator-template'));
                    lastWasSep = true;
                }
                return;
            }
            const command = RteComponent.getCommand(token);
            if (!command) return;
            this.toolbar.appendChild(this.renderTemplate('rte-button-template', {
                cmd: {
                    name: command.name,
                    label: command.label != null ? command.label : command.name,
                    title: command.title || command.name,
                    value: command.value != null ? command.value : ''
                }
            }));
            lastWasSep = false;
        });
    }

    // -------------------------------------------------------------------------
    // Command execution
    // -------------------------------------------------------------------------

    onToolbar(event, trigger) {
        event.preventDefault();
        if (this.prop('disabled')) return;
        this.runCommand(trigger.getAttribute('data-command'), trigger.getAttribute('data-value') || null);
    }

    runCommand(name, value = null) {
        const command = RteComponent.getCommand(name);
        if (!command || !this.editable) return;
        this.editable.focus();

        if (typeof command.run === 'function') {
            command.run(this, command);
        } else if (command.exec) {
            this.exec(command.exec, value != null ? value : (command.value != null ? command.value : null));
        }

        this.syncValue();
        this.refreshToolbarState();
        this.dispatchEvent('rtecommand', { command: name });
    }

    /**
     * Run an underlying editing command against the current selection. Public so custom command
     * `run` handlers and plugins can reuse it. This is the sole call site of `execCommand`.
     */
    exec(command, value = null) {
        if (!this.editable) return;
        this.editable.focus();
        let arg = value;
        if (command === 'createLink') {
            const url = window.prompt('Link URL', 'https://');
            if (!url) return;
            arg = url;
        }
        try {
            document.execCommand(command, false, arg);
        } catch (_error) {
            // Command unsupported in this browser — ignored; toolbar stays usable.
        }
        this.syncValue();
    }

    /** Insert HTML at the caret. Handy for plugins (emoji, tables, snippets). */
    insertHTML(html) {
        this.exec('insertHTML', String(html || ''));
        this.refreshToolbarState();
    }

    refreshToolbarState() {
        if (!this.toolbar) return;
        this.toolbar.querySelectorAll('[data-command]').forEach((button) => {
            const command = RteComponent.getCommand(button.getAttribute('data-command'));
            if (!command) return;
            let active = null;
            if (typeof command.active === 'function') {
                try { active = !!command.active(this, command); } catch (_error) { active = null; }
            } else if (command.active === true && command.exec) {
                try { active = document.queryCommandState(command.exec); } catch (_error) { active = null; }
            }
            if (active === null) button.removeAttribute('aria-pressed');
            else button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    // -------------------------------------------------------------------------
    // Value
    // -------------------------------------------------------------------------

    onInput() {
        this.syncValue();
        this.dispatchEvent('rtechange', { html: this._value });
    }

    syncValue() {
        this._value = this.editable ? this.editable.innerHTML : '';
        if (this.valueInput) this.valueInput.value = this._value;
    }

    /**
     * Parses a dynamic HTML string into nodes and sets it as the editor content. Uses the browser's
     * parser (not an innerHTML string literal); strips <script> for safety. Not a full sanitizer —
     * content is assumed to come from a trusted author.
     */
    setEditableHtml(html) {
        if (!this.editable) return;
        const range = document.createRange();
        range.selectNodeContents(this.editable);
        const fragment = range.createContextualFragment(String(html || ''));
        fragment.querySelectorAll('script').forEach((node) => node.remove());
        this.editable.replaceChildren(fragment);
    }

    setDisabled(disabled) {
        const off = !!disabled;
        if (this.editable) this.editable.setAttribute('contenteditable', off ? 'false' : 'true');
        if (this.element) this.element.setAttribute('data-disabled', off ? 'true' : 'false');
        if (this.toolbar) {
            this.toolbar.querySelectorAll('[data-command]').forEach((button) => {
                button.disabled = off;
            });
        }
        this.props.disabled = off;
    }

    get value() {
        return this._value;
    }

    set value(next) {
        this.setEditableHtml(next == null ? '' : String(next));
        this.syncValue();
        this.refreshToolbarState();
    }

    /** Current editor content as an HTML string. */
    getHTML() {
        return this._value;
    }

    /** Plain-text projection of the current content. */
    getText() {
        return this.editable ? this.editable.textContent : '';
    }
}

// Built-in commands. Registered once via RteComponent.registerBuiltIns().
const BUILTIN_COMMANDS = [
    { name: 'bold', label: 'B', title: 'Bold (Ctrl+B)', exec: 'bold', active: true },
    { name: 'italic', label: 'I', title: 'Italic (Ctrl+I)', exec: 'italic', active: true },
    { name: 'underline', label: 'U', title: 'Underline (Ctrl+U)', exec: 'underline', active: true },
    { name: 'strikeThrough', label: 'S', title: 'Strikethrough', exec: 'strikeThrough', active: true },
    { name: 'h1', label: 'H1', title: 'Heading 1', exec: 'formatBlock', value: 'h1' },
    { name: 'h2', label: 'H2', title: 'Heading 2', exec: 'formatBlock', value: 'h2' },
    { name: 'h3', label: 'H3', title: 'Heading 3', exec: 'formatBlock', value: 'h3' },
    { name: 'paragraph', label: '¶', title: 'Paragraph', exec: 'formatBlock', value: 'p' },
    { name: 'blockquote', label: '“”', title: 'Quote', exec: 'formatBlock', value: 'blockquote' },
    { name: 'ul', label: '•', title: 'Bulleted list', exec: 'insertUnorderedList', active: true },
    { name: 'ol', label: '1.', title: 'Numbered list', exec: 'insertOrderedList', active: true },
    { name: 'link', label: '\u{1f517}', title: 'Insert link', exec: 'createLink' },
    { name: 'unlink', label: '⦄', title: 'Remove link', exec: 'unlink' },
    { name: 'removeFormat', label: '✕', title: 'Clear formatting', exec: 'removeFormat' }
];

RteComponent.registerBuiltIns();

if (typeof window !== 'undefined') {
    // The RTE is code-split, so customers can't call RteComponent directly before it loads. They may
    // instead queue extensions on `window.HoliRte` (a plain { commands: [], plugins: [] } object)
    // before Holi loads; drain that queue here, then replace it with a live API for post-load use.
    const queued = window.HoliRte;
    if (queued && typeof queued === 'object' && !queued.registerCommand) {
        RteComponent.registerCommands(queued.commands || []);
        (queued.plugins || []).forEach((plugin) => RteComponent.use(plugin));
    }
    window.RteComponent = RteComponent;
    window.HoliRte = {
        registerCommand: (command) => RteComponent.registerCommand(command),
        registerCommands: (list) => RteComponent.registerCommands(list),
        use: (plugin) => RteComponent.use(plugin),
        getCommand: (name) => RteComponent.getCommand(name),
        RteComponent
    };
}

export { RteComponent };
