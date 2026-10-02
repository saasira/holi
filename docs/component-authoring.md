# Holi Component Authoring Contract

This document defines the preferred API for new Holi components. The goal is a uniform authoring model while preserving Holi's HTML-first rules.

## Required Files

Each component must use the fixed component paths:

- script: `src/scripts/components/<componentname>.js`
- template: `src/templates/components/<componentname>.html`
- style: `src/styles/components/<componentname>.css`

Component structure belongs in `<template>` files. Component JavaScript may clone templates and create small dynamic nodes where unavoidable, but must not build component structure with HTML strings.

## Minimal Component

```js
import { Component } from './component.js';

class ExampleComponent extends Component {
    static componentName = 'example';
    static templateId = 'example-template';

    static get selector() {
        return 'example';
    }

    static get library() {
        return 'holi';
    }

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = ExampleComponent.templateId;
        this.initComponent();
    }

    afterRender() {
        this.element = this.container.querySelector('.example');
    }
}

export { ExampleComponent };
```

## Lifecycle

New components should prefer `initComponent()` from the base class. It runs:

1. `validateStructure()`
2. `captureSlots()`
3. `beforeSetup()`
4. `setup()`
5. `render()`
6. `afterRender()`
7. `bindDeclaredEvents()`
8. `ready()`

Existing custom `init()` methods remain supported, but new components should use the standard lifecycle unless they have a specific reason not to.

## Props

Declare component inputs with `static props` and read them from `this.props`.

```js
static props = {
    label: { attr: 'label', default: 'Untitled' },
    pageSize: { attr: 'page-size', type: 'number', default: 25 },
    open: { attr: 'open', type: 'boolean', default: false },
    items: { attr: 'items', type: 'array', default: [] }
};
```

Supported type values:

- `string`
- `boolean` / `bool`
- `number`
- `integer` / `int`
- `json`
- `object`
- `array`
- custom coercion function: `(value, fallback, component) => nextValue`

Use direct helpers for one-off reads:

```js
this.readAttr('label', 'Default');
this.readBooleanAttr('disabled', false);
this.readNumberAttr('step', 1);
this.readJsonAttr('items', []);
```

Attributes may be declared as either `name` or `data-name`.

## Slots

Use native `<slot>` in templates.

```html
<template id="example-template">
    <section class="example">
        <header><slot name="header"></slot></header>
        <main><slot name="content"></slot></main>
    </section>
</template>
```

Project slots after rendering:

```js
afterRender() {
    this.element = this.container.querySelector('.example');
    this.projectSlots(['header', 'content']);
}
```

`initComponent()` captures direct slotted children before render. If a component needs a custom slot strategy, call `this.captureSlots()` explicitly.

## Events

Prefer declarative delegated events.

```js
static events = {
    'click [data-action="save"]': 'save',
    'input [data-role="query"]': 'search'
};

save(event, trigger) {
    this.dispatchEvent('examplesave', { trigger });
}
```

`bindDeclaredEvents()` is called by `initComponent()`. Event listeners are removed automatically during `destroy()`.

## Template Fragments

For repeated or dynamic data, keep the item structure in a template and render it through the base helpers.

```html
<template id="example-item-template">
    <li data-id="@{item.id}">@{item.label}</li>
</template>
```

```js
renderItems() {
    const list = this.element.querySelector('[data-role="items"]');
    this.renderList(list, 'example-item-template', this.items, 'item');
}
```

For a single fragment:

```js
const fragment = this.renderTemplate('example-item-template', { item });
target.appendChild(fragment);
```

## Data Providers

Data-aware components should use common provider attributes:

- `provider`
- `source` / `data-source`
- `items` / `data-items` for inline JSON data

```js
async setup() {
    this.items = await this.resolveProviderData({
        fallback: [],
        inlineAttr: ['items', 'data-items']
    });
}
```

The default provider method is `resolve(source, params, component)`. If unavailable, Holi falls back to `getContent(source, params, component)`.

## Public Events

Use `dispatchEvent(name, detail)` for component events. Event names should be lowercase and prefixed by the component name, for example:

- `scheduleload`
- `scheduleadd`
- `dropdownselect`

## Authoring Rules

Mandatory:

- Use `<template>` and `<slot>` for structure.
- Use `@{...}` interpolation for binding.
- Prefer `static props`, `static events`, `projectSlots`, and `renderTemplate` for consistency.
- Keep reusable non-component utilities under `src/scripts/utils`.
- Support tag, `component="name"`, and `role="holi-name"` discovery through `selector` and `componentName`
  (`role="name"` is matched too unless the name is an ARIA role -- `roleSelectorsFor` in `utils/aria_roles.js`).

Forbidden:

- `innerHTML = '<div>...'`
- `insertAdjacentHTML(...)`
- `eval`
- `new Function`
- Shadow DOM
- inline `onclick`, `onchange`, or similar template handlers
