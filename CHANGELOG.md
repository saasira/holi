# Changelog

All notable changes to this project are documented in this file.

## [0.21.1] - 2026-10-02

### Changed (breaking for the role form of five components)

- A component name that is also a WAI-ARIA role -- `dialog`, `menubar`, `region`, `search`, `tree` -- is no longer found
  by `role="<name>"`: templates use those roles for assistive technology, and Holi hydrated them as components inside
  the component that rendered them. Use `role="holi-<name>"` (e.g. `role="holi-menubar"`); the tag and
  `component="<name>"` forms are unchanged. The explicit checkbox and radio input forms are now
  `input[type=checkbox][role="holi-checkbox"]` and `input[type=radio][role="holi-radio"]`. Every component also accepts
  `role="holi-<name>"`, so the prefixed form can be used throughout. The ARIA role list is `utils/aria_roles.js`.

### Added

- `accordion` takes its sections from a content provider (`provider` + `data-source`, or inline `items` JSON):
  `resolve(source)` answers `[{ name, label, content, open }]`; a section without `content` is asked of
  `getContent(item, index)` when first opened. `default="<name>"`, `openSection(name)`, `reload()`, and the section's
  `name` in `accordionchange`; `accordionload` when lazy content arrives.
- `menubar` builds its menu from a content provider: `resolve(source)` answers `[{ name, label, href, children }]` --
  `children` opens a submenu, `href` is a link, neither is an action. A `javascript:` or other non-web link is refused.
  `menuselect` reports every chosen item (`{ name, label, href }`); `reload()` re-reads the tree.
- Provider examples on the accordion and menubar pages, with smoke checks.

### Fixed

- `Navigation` was not in the bundle (nothing imported `utils/navigation.js`), and a route with a parameter
  (`/profile/:id`) never matched -- the pattern looked for an escaped slash the escaping never produced. The navigation
  example, which loaded no Holi at all and used APIs that no longer exist, is rewritten on `Navigation` (hash mode),
  `StateHub` and `StateConnector`.
- `accordion` cloned its sections and left the originals in place, so every section showed twice -- above the accordion
  and inside it -- and anything inside existed twice. Sections are now moved into their panels.
- `accordion`'s root carried `role="region"`, which Holi hydrated as a `region` component inside it.
- `menubar` submenus never opened on click or touch, only on hover: the press focused the trigger, focus opened the
  submenu and the click toggled it shut. Focus from a press now leaves opening to the click.
- `resolveProviderData` never asked the provider: an absent `items` attribute read as `null` inline data.
- A state value reflected onto a component property whose setter writes the state back looped without end -- the form
  example's radio group threw "Maximum call stack size exceeded" on about half the loads since 0.21.0. Reflection now
  skips an unchanged value and never re-enters the same path.

## [0.21.0] - 2026-10-02

### Added

- `browser` component: an item picker with its template, styles and example.
- `rte` rich-text editor component, with its extension API documented in `docs/rte.md`.
- `workflow` builder component (`utils/workflow_graph.js`), with an example over `workflow-steps.json`.
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

### Changed

- `breadcrumbs`, `formdesigner` and `schedule` reworked, with their examples.
- The development server runs on port 7777.
- CDN examples in the README and `docs/CDN.md` point at this release.

### Fixed

- In the minified `dist/` build a component's instance was not reachable from its host (`el.chartcomponent`,
  `el.datatable`): babel compiles each class to a function the minifier renamed to a single letter, and the instance
  key is the class name. Terser now keeps class and function names.
- The datatable's row-details dialog never opened from the built library: it looked its templates up with
  `document.getElementById`, while component templates live in the TemplateRegistry.

### Validation

- `npm run ci:smoke`; the new components driven in Chromium (hover, brush, select, legend, presets, absolute range,
  refresh, inline tabs).

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
