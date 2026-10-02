# RTE (Rich Text Editor) — Component & Extension Guide

The `rte` component is a `contentEditable`-based rich text editor with a data-driven, extensible
toolbar. This guide covers using it and — the main focus — **extending it with custom buttons and
actions**.

- Files: `src/scripts/components/rte.js`, `src/templates/components/rte.html`, `src/styles/components/rte.css`
- Discovery: `<rte>`, `<div component="rte">`, `<div role="rte">`
- Code-split: the editor chunk loads lazily the first time an editor appears on the page.

## Basic usage

```html
<!-- Progressive enhancement: authored HTML becomes the initial content -->
<rte name="article-body">
    <h2>Welcome</h2>
    <p>This content is <strong>editable</strong>.</p>
</rte>

<!-- Empty editor with a placeholder -->
<div component="rte" placeholder="Write something…"></div>
```

Attributes:

| Attribute     | Meaning                                                            |
|---------------|-------------------------------------------------------------------|
| `name`        | Name of the hidden `<input>` that mirrors the HTML (for form POST) |
| `value`       | Initial HTML, when there is no authored inner content             |
| `placeholder` | Empty-state hint                                                   |
| `toolbar`     | Explicit button set/order (see below)                             |
| `disabled`    | Read-only editor                                                   |

The content is available three ways: the hidden input value, the `value` getter, and the
`rtechange` event.

```js
const editor = document.querySelector('rte').rtecomponent; // instance auto-exposed on the element
editor.getHTML();          // current HTML
editor.value = '<p>Hi</p>'; // replace content
editor.addEventListener?.; // (use the element for events — see Events below)
```

## The command model

The toolbar is rendered from a list of **command descriptors**. Built-in commands (bold, italic,
headings, lists, link, …) are ordinary descriptors; your custom ones use the same shape:

```js
{
    name:   'highlight',      // unique id; also the button's data-command
    label:  'HL',             // button text (style it via CSS on [data-command="highlight"])
    title:  'Highlight',      // tooltip + aria-label
    exec:   'hiliteColor',    // OPTIONAL: an execCommand token (simple path)
    value:  'yellow',         // OPTIONAL: argument for exec
    run:    (rte, cmd) => {}, // OPTIONAL: custom action; overrides exec
    active: (rte, cmd) => {}  // OPTIONAL: toggle-state; true = reflect queryCommandState(exec)
}
```

Resolution: if `run` is present it is called; else if `exec` is present it runs
`rte.exec(exec, value)`. For toggle highlighting, set `active: true` (reflects
`queryCommandState(exec)`) or provide a predicate `active: (rte) => boolean`.

## Registering extensions

There are two entry points and one important timing rule.

### 1. A single command

```js
RteComponent.registerCommand({
    name: 'clear',
    label: '⌫',
    title: 'Clear all',
    run: (rte) => { rte.value = ''; }
});
```

### 2. A plugin (a bundle of commands + optional per-instance init)

```js
RteComponent.use({
    name: 'emoji',
    commands: [
        { name: 'emoji', label: '🙂', title: 'Insert emoji',
          run: (rte) => rte.insertHTML('🙂') }
    ],
    init: (rte) => { /* runs once per editor instance, in ready() */ }
});
```

### 3. Timing — register *before* the editor loads (the queue)

Because the RTE is code-split, `window.RteComponent` does not exist until the chunk loads — so you
usually cannot call `RteComponent.registerCommand` early enough. Register through the
**`window.HoliRte` queue** instead. Set it up before Holi runs; the component drains it on load and
then replaces it with a live API:

```html
<script>
    // Before holi.js runs (or any time before the first editor renders):
    window.HoliRte = window.HoliRte || { commands: [], plugins: [] };
    window.HoliRte.commands.push({
        name: 'date', label: '📅', title: 'Insert date',
        run: (rte) => rte.insertHTML(new Date().toLocaleDateString())
    });
    window.HoliRte.plugins.push({
        name: 'stamps',
        commands: [ /* … */ ]
    });
</script>
<script src="/dist/holi.js"></script>
```

After the chunk has loaded, `window.HoliRte` is a live object with the same methods:

```js
window.HoliRte.registerCommand({ /* … */ });
window.HoliRte.use({ /* … */ });
window.HoliRte.getCommand('bold');
```

Note: commands registered *after* an editor has already rendered its toolbar affect only editors
created afterward. Register via the queue for buttons to appear on first render.

## Choosing which buttons show

- **Default:** the built-in set, followed by any registered custom commands.
- **Explicit:** set `toolbar` on the element. Space-separated command names, `|` = separator:

```html
<div component="rte" toolbar="bold italic underline | h1 h2 | highlight emoji"></div>
```

Only commands named in `toolbar` are shown, in that order. The toolbar **wraps to the next line**
when it runs out of width.

## The editor API available to your actions

A command's `run(rte, cmd)` (and a plugin's `init(rte)`) receive the editor instance:

| Method / property             | Description                                                        |
|-------------------------------|-------------------------------------------------------------------|
| `rte.exec(command, value?)`   | Run an underlying editing command on the selection (the one place `execCommand` is used). |
| `rte.insertHTML(html)`        | Insert HTML at the caret (emoji, snippets, tables…).              |
| `rte.getHTML()` / `rte.value` | Current content as HTML.                                          |
| `rte.value = html`            | Replace the content.                                             |
| `rte.getText()`               | Plain-text projection.                                           |
| `rte.editable`                | The `contentEditable` element (for advanced Selection/Range work).|
| `rte.dispatchEvent(name,detail)` | Emit a custom event from the editor element.                 |
| `rte.refreshToolbarState()`   | Re-evaluate toggle (`active`) states after a programmatic change. |

Everything that touches the underlying command engine goes through `rte.exec()`, so your extensions
stay stable even if the engine is replaced later.

## Events

Listen on the editor element (`<rte>` / the host element):

```js
const host = document.querySelector('rte');
host.addEventListener('rtechange',  (e) => console.log('html:', e.detail.html));
host.addEventListener('rtecommand', (e) => console.log('ran:', e.detail.command));
```

- `rtechange` `{ html }` — fires on content input.
- `rtecommand` `{ command }` — fires after a toolbar command runs.

## Worked examples

**Toggle-state command (highlight):**

```js
window.HoliRte.registerCommand({
    name: 'highlight', label: 'HL', title: 'Highlight',
    run:    (rte) => rte.exec('hiliteColor', 'yellow'),
    active: () => document.queryCommandValue('hiliteColor') === 'yellow'
});
```

**Insert a snippet:**

```js
window.HoliRte.registerCommand({
    name: 'hr', label: '―', title: 'Divider',
    run: (rte) => rte.insertHTML('<hr>')
});
```

**Open your own dialog, then insert:**

```js
window.HoliRte.use({
    name: 'link-dialog',
    commands: [{
        name: 'linkDialog', label: '🔗+', title: 'Insert link (custom)',
        run: async (rte) => {
            const url = await myAppOpenLinkDialog();      // your UI
            if (url) rte.exec('createLink', url);
        }
    }]
});
```

## Styling custom buttons

Buttons are plain `<button class="holi-rte-btn" data-command="…">` with your `label` as text. Style
by command name:

```css
.holi-rte-btn[data-command="highlight"] { background: #fff8c5; }
```

## Notes & limits

- Built-in commands use `document.execCommand` (the long-standing contentEditable API — deprecated
  but universally supported). It is reached only via `rte.exec()`, so the internals can be swapped
  for a Selection/Range engine later without changing any command, plugin, the toolbar, or the
  template.
- `setEditableHtml`/`value` strips `<script>` but is **not** a full sanitizer — sanitize before
  loading untrusted content.
- Follow Holi's rules when extending internals: template-driven structure, no inline HTML strings in
  JS, no Shadow DOM, no `eval` (see `docs/holi-principles.md`).
