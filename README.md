# Holi

Holi is a template-driven frontend component library focused on progressive enhancement, declarative rendering, and secure expression-based bindings.

It is designed for teams that want reusable UI components without committing to a virtual DOM framework or Shadow DOM component model.

## Philosophy

Holi follows strict architectural principles:

- HTML templates are the source of truth (`<template>` + `<slot>`).
- Component JS must not generate structure using inline HTML strings.
- Rendering is declarative through attributes such as `data-if`, `data-repeat`, and `@{...}` interpolation.
- Components auto-discover and auto-render on page load (with explicit lazy transform opt-in).
- Expression evaluation is secure-by-design (no `eval`, no `new Function`).
- No Shadow DOM.
- Progressive enhancement first.
- Multiple component libraries and pluggable content providers are supported.

Canonical reference: `docs/holi-principles.md`.

## What You Get

- Auto initialization on `DOMContentLoaded` via `HoliApp.init(document)`.
- Three discovery styles for each component:
  - Tag: `<tabs></tabs>`
  - Attribute: `<section component="tabs"></section>`
  - Role: `<section role="tabs"></section>`
- Template library bundling (`dist/holi.html`) and runtime template injection.
- Template bindings:
  - `@{expression}` interpolation
  - `data-if`, `data-show`, `data-open`, `visible`
  - `data-repeat` loops with contextual item/index
- Lifecycle-aware component registry with DOM mutation observation.
- Content provider pattern for dynamic/lazy content per component.
- jQuery-like utility surface (`Q`) and native HTTP helper (`HTTP`).
- Prebuilt component set including accordion, calendar, carousel, chart, datagrid, datatable, dialog, drawer, dropdown, form controls, gallery, tabs, toast, tree, wizard, and more.

## Declarative Dependencies

Holi supports declarative dependent updates between components.

- Source components publish change notifications through the central runtime.
- Subscriber components declare interest in one or more source components.
- The framework only resolves and delivers the notification.
- The subscriber decides how to react based on its own data source and behavior.

This means "local refresh" vs "remote/PPR reload" is not decided by the framework. It is decided by the subscriber component after it receives the dependency update.

Common attributes:

- Source side: `update`, `render`, `data-ppr-update`
- Subscriber side: `data-ppr-listen`, `data-ppr-source`

Common subscriber hook contract:

- `handlePprUpdate(payload)`
- `refreshPpr(payload)`
- `refresh(payload)`
- `updateView(payload)`

JSF-style target tokens such as `@this`, `@parent`, `@form`, `@all`, and explicit ids are supported by the dependency resolver.

## Quick Start

```bash
npm install
npm run build
npm run serve
```

Main artifacts:

- `dist/holi.js`
- `dist/holi.css`
- `dist/holi.html` (templates)
- Example site output: `public/examples/**`

## CDN Usage

Holi can be shipped directly from a free CDN after publishing the package to npm.

Recommended jsDelivr links for `v0.1.2`:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@saasira/holi@0.1.2/dist/holi.css" />
<script src="https://cdn.jsdelivr.net/npm/@saasira/holi@0.1.2/dist/holi.js"></script>
<link rel="preload" as="fetch" href="https://cdn.jsdelivr.net/npm/@saasira/holi@0.1.2/dist/holi.html" crossorigin="anonymous" />
```

Fallback unpkg links:

```html
<link rel="stylesheet" href="https://unpkg.com/@saasira/holi@0.1.2/dist/holi.css" />
<script src="https://unpkg.com/@saasira/holi@0.1.2/dist/holi.js"></script>
<link rel="preload" as="fetch" href="https://unpkg.com/@saasira/holi@0.1.2/dist/holi.html" crossorigin="anonymous" />
```

Repository setup details for automated npm publishing are documented in `docs/CDN.md`.

## Minimal Usage

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="/dist/holi.css" />
    <script src="/dist/holi.js"></script>
  </head>
  <body>
    <tabs provider="demo" data-source="@{demo.simple}"></tabs>

    <script>
      const tabData = [{ label: "Overview", content: "Overview content" }];
      window.contentProviders = window.contentProviders || {};
      window.contentProviders.demo = class {
        resolve(expr) {
          return expr === "@{demo.simple}" ? tabData : [];
        }
        async getContent(item) {
          return item?.content || "";
        }
      };
    </script>
  </body>
</html>
```

## Project Structure Contracts

- Component scripts: `src/scripts/components/<componentname>.js`
- Component styles: `src/styles/components/<componentname>.css`
- Component templates: `src/templates/components/<componentname>.html`
- Shared utilities: `src/scripts/utils/<utilityname>.js`
- Example sources:
  - `src/examples/pages/*.html`
  - `src/examples/styles/*.css`
  - `src/examples/scripts/*.js`
- Built examples: `public/examples/**` (referencing `dist/holi.js` and `dist/holi.css`)

## Holi vs React / Angular / Vue

| Area | Holi | React | Angular | Vue |
|---|---|---|---|---|
| Primary model | HTML template + declarative attrs | Component functions + JSX | Framework with DI, modules, templates | SFC/templates + reactivity |
| Runtime style | Direct DOM + template clone/bind | Virtual DOM | Framework-managed change detection | Virtual DOM + compiler/runtime |
| Auto discovery | Yes (tag/component/role selectors) | No (explicit mount) | No (bootstrapped app) | No (explicit mount) |
| Progressive enhancement | First-class | Possible, not default | Usually app-shell centric | Possible, typically app-centric |
| Shadow DOM | Not used | Not required | Optional with Angular Elements | Not required |
| Secure expression engine | Built-in `@{...}` parser (no eval) | N/A (JS expressions in render code) | Template parser | Template parser |
| Best fit | Multi-page apps, server-rendered pages, declarative component islands | Large SPAs and highly interactive app UIs | Enterprise apps needing full framework conventions | Progressive SPAs and mixed-complexity apps |

Practical summary:

- Choose Holi when your HTML-first architecture, declarative enhancement, and low-framework runtime footprint are priorities.
- Choose React/Angular/Vue when you need the broader ecosystem around SPA routing/state tooling, compile-time optimizations, and framework-level DX conventions.

## Development Scripts

- `npm run build`: Build library and examples.
- `npm run build:dev`: Development build and examples.
- `npm run build:examples`: Build example pages into `public/examples`.
- `npm run serve`: Build examples and start webpack dev server.
- `npm run smoke:examples`: Run example smoke checks.
- `npm run ci:smoke`: Full build + smoke.

## Notes

- Holi exports `window.HoliApp` / `window.Holi`.
- Auto init can be disabled with `window.HoliAutoInit = false` before loading `dist/holi.js`.
- Templates are loaded from `dist/holi.html` (with runtime fallback paths).
