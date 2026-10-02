# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- `timerange` component: quick relative ranges (`now-15m`, presets configurable), an absolute from/to, optional
  auto-refresh, and local or UTC display (`timezone="utc"`). A relative range is re-resolved whenever it is read.
  Emits bubbling `timerangechange` and `timerangerefresh` with `{ from, to, relative, label }`; API `getRange()`,
  `setRelative()`, `setAbsolute()`, `setRefresh()`.
- `histogram` component: counts per time bucket, stacked (or side by side) by series, over a time axis whose ticks fall
  on round times in the zone shown. Hover tooltip, drag-to-select (`histogrambrush`), click a bucket
  (`histogramselect`), legend toggles a series (`histogramseriestoggle`); redraws on resize; API `update(data, options)`.
- `tabs` accepts inline `<tab name="..." label="...">` children when it has no `data-source`, so page content can be
  tabbed without a content provider; `default="<name>"` picks the first tab, `selectTab(name)` switches by name, and
  `tabchange` carries the tab's `name`.
- Examples: `histogram.html`, `timerange.html`, and an inline variant in `tabs.html`, with smoke checks.

### Fixed

- In the minified `dist/` build a component's instance was not reachable from its host (`el.chartcomponent`,
  `el.datatable`): babel compiles each class to a function the minifier renamed to a single letter, and the instance
  key is the class name. Terser now keeps class and function names.

## [0.20.0] - 2026-06-06

### Added

- Added component authoring documentation for template-driven component structure, lifecycle, props, slots, events, and providers.
- Added template-driven `formdesigner` and `schedule` components with matching styles, templates, and examples.
- Added additional reusable page layout templates for single, dashboard, and column-based compositions.
- Added lazy component loading and form condition utility modules.

### Changed

- Expanded component runtime, page composition, provider, and layout behavior while preserving progressive enhancement.
- Updated examples build handling and CDN documentation for the current bundled asset conventions.

### Validation

- Pending release validation: `npm run ci:smoke`.

## [0.1.9] - 2026-03-21

### Changed

- Updated example smoke assertions to match the current declarative theme and locale example sources so CI release validation passes again.

### Validation

- Verified with `npm run ci:smoke`.

## [0.1.8] - 2026-03-21

### Added

- Added a template-driven `include` component that fetches HTML fragments from relative or absolute sources and injects them in place.

### Changed

- Updated the `page-layout.html` example to load its header and footer content through reusable included fragments.

### Validation

- Verified with `npm run build` and `npm run build:examples`.

## [0.1.7] - 2026-03-21

### Added

- Added declarative theme registration with a shared theme registry and release-aware page asset automation for `page[release]`.
- Added declarative locale registration with a shared locale registry and default-English document language fallback.

### Changed

- Scoped bundled component styles to the default theme so custom themes can provide their own component styling cleanly.
- Updated theme and locale switching flows to resolve through centralized registries instead of directly mutating document attributes ad hoc.

### Validation

- Verified with `npm run build`.

## [0.1.5] - 2026-03-19

### Added

- Added runtime page-layout composition with configurable layout resolution, named `block` and `region` slot mapping, and optional inherited slot fallbacks.
- Added layout-owned asset placement through `layout-head` for real head nodes and `tail` for deferred body-end assets.
- Added in-memory template and layout registries backed by bundled `dist/components.html` and `dist/layouts.html`.

### Changed

- Stopped injecting bundled component templates into the live page body; templates now stay in an internal registry.
- Renamed the primary bundled component-template artifact from `holi.html` to `components.html` while keeping `holi.html` as a compatibility bundle.
- Extended the example/build pipeline and smoke checks to cover runtime layout composition and layout asset containers.

### Validation

- Verified with `npm run build`, `npm run smoke:examples`, and `npm pack --dry-run`.

## [0.1.4] - 2026-03-19

### Changed

- Bumped the release after the successful bootstrap publish of `0.1.3` so npm can accept the next trusted-publishing run.
- Carried forward the GitHub Actions workflow fixes for Node `22.14.0`, npm `11.5.1`, and npm trusted publishing.

### Validation

- Verified packaging metadata with `npm pack --dry-run`.

## [0.1.3] - 2026-03-19

### Changed

- Recut the release from the scoped npm package setup so publishing can proceed with `@saasira/holi`.
- Carried forward the npm CDN workflow, changelog, and scoped CDN documentation into the new release line.

### Validation

- Verified packaging metadata with `npm pack --dry-run`.

## [0.1.2] - 2026-03-19

### Added

- Added a new template-driven `panel` component with matching styles and template assets.
- Added progressive-enhancement examples for panel, validator, native forms, and service worker management.
- Added runtime utilities for component state bridging, partial page refresh flows, native host integration, validation, and service worker support.

### Changed

- Expanded form control behavior across checkbox, radio, select, input, and textarea components.
- Improved shared component lifecycle and registry behavior to better support declarative updates and app-level orchestration.
- Extended datagrid, datatable, dropdown, and gallery behavior and styling for richer interactive scenarios.
- Updated the build to emit service worker assets and the new example pages into `public/examples`.

### Validation

- Verified with `npm run ci:smoke`.
