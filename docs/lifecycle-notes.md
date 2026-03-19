# Holi Lifecycle Notes

This document summarizes current component lifecycle and registration behavior.

## Initialization Model

- `HoliApp.init(container)` performs one-time discovery and initialization through `ComponentRegistry.initAll(container)`.
- Discovery supports:
  - tag selectors (for example `<menubar>`)
  - `component="<name>"`
  - `role="<name>"`
- Runtime auto-mount is handled by `ComponentRegistry.observeLifecycle(...)` using `MutationObserver`.

## Role Selector Safety

- On initial page bootstrap, role-based discovery is enabled.
- For runtime mutation scans and nested child scans, role-based discovery is intentionally disabled.
- This prevents collisions with ARIA roles inside rendered templates (for example `role="dialog"`, `role="tree"`).

## Component Instance Tracking

- Each component host is tagged with `data-holi-component-class="<ClassName>"`.
- Registry keeps instance references in a `WeakMap`.
- Registry skips creating a component inside a descendant that already belongs to the same component class host.
- This prevents recursive self-instantiation for selectors that match native tags (for example `dialog`).

## Mount/Unmount Lifecycle

- Added nodes are auto-initialized via mutation observer.
- Removed nodes are queued and cleaned up in a microtask.
- If a removed node is reconnected before flush, teardown is skipped.
- Teardown calls `destroy()` recursively via base `Component`.

## Child Component Lifecycle

- Base `Component.render()` now calls:
  - `createChildren()` (default: registry init within current scope)
  - `syncChildren()` (tracks child instances)
- `refresh()` calls `refreshChildren()` by default.
- Container components that project/move nodes after render (for example `layout`, `block`) explicitly re-run child creation/sync after projection.

## Teardown Contract

- `destroy()` should:
  - remove event listeners/observers owned by the component
  - disconnect store/state bindings
  - call `super.destroy()`
- Base `destroy()` handles child destruction, host cleanup, instance unregister, and dispatches `destroy` event.

## Regression Harness

- Use `src/examples/pages/lifecycle-regression.html` as a smoke harness for:
  - dynamic mount/unmount checks
  - gallery dialog+carousel integration
  - tree/treepanel initialization checks
