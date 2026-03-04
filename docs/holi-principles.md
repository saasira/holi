# Holi Core Principles

This document is the canonical architecture and implementation contract for the Holi library.
All component, runtime, and API changes must conform to these rules.

## 1) HTML Template Driven

Mandatory:
- Use native `<template>` and `<slot>` for component structure.
- Component structure must be defined in template files, not JS strings.
- Support declarative binding attributes like:
  - `data-if="@{...}"`
  - `data-repeat="@{...}"`
  - `data-slot="@{...}"`

Forbidden:
- Inline HTML template strings in component JS (`innerHTML = "<div>..."`, `insertAdjacentHTML(...)`).

## 2) Automatic Discovery and Rendering

On page load (DOMContentLoaded), components should be discovered and initialized automatically.
Page developers may declare a component in any supported style:

- Tag style:
```html
<tabs provider="tabs"></tabs>
```

- Attribute style:
```html
<section component="tabs" provider="tabs"></section>
```

- Role style:
```html
<section role="tabs" provider="tabs"></section>
```

By default:
- No manual `new Component()` should be required for normal page usage.
- Progressive enhancement behavior should be preserved.

Deferred transform:
- Components may opt out of immediate transform only when explicitly declared lazy, e.g.:
  - `transform="lazy"`
  - `lazy-transform="true"`

## 3) Expression and Template Engine

Mandatory:
- Use `@{expression}` interpolation format.
- Use secure expression parsing/evaluation.
- Escape output by default to prevent XSS where applicable.

Forbidden:
- `eval`, `new Function`, or equivalent unsafe dynamic code execution.

## 4) Multi-Library and Content Providers

Mandatory:
- Multiple component libraries must be registerable.
- Content providers must be pluggable and reusable across components.
- Components should resolve content providers declaratively from element/app context.

## 5) jQuery-Compatible Utility Surface (No jQuery Dependency)

Mandatory:
- Provide selector and AJAX utility ergonomics compatible with jQuery-style usage.
- Implement using native browser APIs; do not require jQuery runtime.
- Coexist safely if jQuery is present.

## 6) Structural Constraints

Mandatory:
- No Shadow DOM.
- CSS-driven layout/behavior where possible.
- Reusable components encapsulate behavior + styles while structure remains template-driven.
- Site-level orchestration lives in centralized app surface (`HoliApp` singleton pattern).

## 7) Implementation Guardrails

When implementing or refactoring:
- Prefer cloning templates and binding data over generating DOM via HTML strings.
- Use DOM node creation APIs only for minimal dynamic controls when template alternatives are unavailable.
- Keep public behavior/API stable unless a change is explicitly requested.
- Validate with build/tests after changes.

## 8) Review Checklist

Before finalizing a change, verify:
- No inline HTML strings were introduced in component JS.
- Component can be discovered via tag, `component="name"`, and `role="name"` forms.
- No unsafe expression evaluation path exists.
- Templates remain the source of structural truth.
- Progressive enhancement behavior is preserved.

## 9) Component File Contracts

Component file locations are mandatory:
- component scripts: `src/scripts/components/<componentname>.js`
- component styles: `src/styles/components/<componentname>.css`
- component templates: `src/templates/components/<componentname>.html`

Notes:
- Keep one primary component per file.
- Component JS must reference template IDs defined in the matching template file.

## 10) Utility File Contracts

Common non-component utilities must be placed in:
- `src/scripts/utils/<utilityname>.js`

Examples:
- state hub/connector
- DOM/AJAX helper wrappers
- app-level orchestration helpers that are not components

## 11) Examples Build Contracts

Examples live in source-first directories:
- pages: `src/examples/pages/*.html`
- styles: `src/examples/styles/*.css`
- scripts: `src/examples/scripts/*.js`

Build output requirements:
- generated examples must be emitted under `public/examples/**`
- example pages must reference built library assets from `dist/` (for example `../../../dist/holi.js`)
