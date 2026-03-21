# Changelog

All notable changes to this project are documented in this file.

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
