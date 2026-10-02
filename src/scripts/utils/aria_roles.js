/**
 * WAI-ARIA 1.2 roles (and the graphics and DPUB modules). Holi finds components by `role="<name>"` as well as by tag and
 * `component="<name>"`, and a component name that is also an ARIA role cannot be both: a template's `role="dialog"` or
 * `role="region"` -- there for assistive technology -- was taken for a Holi component and hydrated inside the component
 * that rendered it. So a component whose name is an ARIA role is found by `role="holi-<name>"`, and `role="<name>"`
 * keeps its ARIA meaning.
 */
const ARIA_ROLES = new Set([
    'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption', 'cell', 'checkbox',
    'code', 'columnheader', 'combobox', 'command', 'comment', 'complementary', 'composite', 'contentinfo', 'definition',
    'deletion', 'dialog', 'directory', 'document', 'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'gridcell',
    'group', 'heading', 'img', 'image', 'input', 'insertion', 'landmark', 'link', 'list', 'listbox', 'listitem', 'log',
    'main', 'mark', 'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'meter',
    'navigation', 'none', 'note', 'option', 'paragraph', 'presentation', 'progressbar', 'radio', 'radiogroup', 'range',
    'region', 'roletype', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'section', 'sectionhead',
    'select', 'separator', 'slider', 'spinbutton', 'status', 'strong', 'structure', 'subscript', 'suggestion',
    'superscript', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'time', 'timer', 'toolbar',
    'tooltip', 'tree', 'treegrid', 'treeitem', 'widget', 'window',
    'graphics-document', 'graphics-object', 'graphics-symbol'
]);

/** Whether a role value means something to assistive technology, and so cannot name a Holi component. */
function isAriaRole(value) {
    const role = String(value || '').trim().toLowerCase();
    return ARIA_ROLES.has(role) || role.startsWith('doc-');
}

/**
 * The `role` selectors that find a component of this name: always `[role="holi-<name>"]`, and `[role="<name>"]` too when
 * the name is not an ARIA role. A name already starting with `holi-` is used as it is.
 */
function roleSelectorsFor(name) {
    const value = String(name || '').trim();
    if (!value) return [];
    if (value.startsWith('holi-')) return [`[role="${value}"]`];
    const selectors = [`[role="holi-${value}"]`];
    if (!isAriaRole(value)) selectors.push(`[role="${value}"]`);
    return selectors;
}

/** The component name a role value gives -- `holi-tabs` and `tabs` both give `tabs` -- or '' for an ARIA role. */
function componentNameFromRole(value) {
    const role = String(value || '').trim();
    if (!role) return '';
    if (role.startsWith('holi-')) return role.slice('holi-'.length);
    return isAriaRole(role) ? '' : role;
}

export { ARIA_ROLES, isAriaRole, roleSelectorsFor, componentNameFromRole };
