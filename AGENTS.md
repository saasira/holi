# Holi Agent Instructions

This repository follows strict architectural rules for all component work.

Read and enforce:
- `docs/holi-principles.md`

Non-negotiable summary:
- Template-driven structure only (`<template>` + `<slot>`)
- No inline HTML strings in JavaScript components
- Declarative attributes over imperative DOM construction
- Auto-discovery and auto-render on page load (unless lazy transform is explicit)
- Secure expression evaluation only (no `eval`)
- No Shadow DOM
- Progressive enhancement first
- Component file paths are fixed:
  - scripts: `src/scripts/components/<componentname>.js`
  - styles: `src/styles/components/<componentname>.css`
  - templates: `src/templates/components/<componentname>.html`
- Common non-component utilities must be in:
  - `src/scripts/utils/<utilityname>.js`
- Examples source/build convention:
  - source pages: `src/examples/pages/*.html`
  - source styles: `src/examples/styles/*.css`
  - source scripts: `src/examples/scripts/*.js`
  - build output: `public/examples/**` with pages referencing `dist/holi.js` and `dist/holi.css`
