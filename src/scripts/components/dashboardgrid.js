import { Component } from './component.js';
import { autoPlace, compact, moveTile, resizeTile, sameLayout } from '../utils/grid_layout.js';

const DEFAULT_W = 6;
const DEFAULT_H = 3;
/** Below this width in pixels the tiles stack in one column and cannot be moved or resized. */
const STACK_BELOW = 640;

/**
 * A grid of tiles that a person can arrange: each direct child is a tile (a chart, a statscard, a table, anything), placed in a column and row
 * and sized in grid cells. Tiles flow around each other, never overlap, and settle upwards.
 *
 * ```html
 * <dashboardgrid cols="12" row-height="80" editable="true">
 *     <div id="revenue" data-title="Revenue" data-x="0" data-y="0" data-w="8" data-h="4"><chart ...></chart></div>
 *     <div id="orders"  data-title="Orders"  data-x="8" data-y="0" data-w="4" data-h="2"><statscard ...></statscard></div>
 * </dashboardgrid>
 * ```
 *
 * A child's `id` names the tile (one is made when it has none); `data-title` is the heading; `data-x`, `data-y`, `data-w`, `data-h` the place and
 * size, and a tile without a place goes to the first free spot. The `layout` attribute, a JSON array of `{ id, x, y, w, h }`, overrides the
 * children's own values, which is how a saved layout is applied.
 *
 * With `editable` a tile is dragged by its grip and resized from its corner, or by keyboard: the grip takes the arrow keys to move the tile and
 * Shift with the arrow keys to resize it. On a narrow screen the tiles stack in one column and are not editable.
 *
 * Events (on the grid element, bubbling):
 * - `dashboardlayoutchange` -- the layout changed by a person or by {@link DashboardGridComponent#setLayout}: `{ layout }`
 * - `dashboardtileremove` -- a tile's remove button was used: `{ id, element }`
 */
class DashboardGridComponent extends Component {
    static get selector() {
        return 'dashboardgrid';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'dashboardgrid';
    }

    static templateId = 'dashboardgrid-template';

    static props = {
        cols: { attr: 'cols', type: 'number', default: 12 },
        rowHeight: { attr: 'row-height', type: 'number', default: 80 },
        gap: { attr: 'gap', type: 'number', default: 12 },
        editable: { attr: 'editable', type: 'boolean', default: false },
        layout: { attr: 'layout', type: 'array', default: [] }
    };

    static events = {
        'pointerdown [data-role="handle"]': 'beginMove',
        'pointerdown [data-role="resize"]': 'beginResize',
        'keydown [data-role="handle"]': 'handleKey',
        'click [data-action="remove-tile"]': 'removeClick'
    };

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = DashboardGridComponent.templateId;
        this.items = [];
        this.frames = new Map();
        this.drag = null;
        this.stacked = false;
        this.onDragMove = (event) => this.dragMove(event);
        this.onDragEnd = () => this.endDrag();
        this.initComponent();
    }

    setup() {
        this.cols = Math.max(1, Math.round(this.props.cols) || 12);
        this.editable = !!this.props.editable;
        this.pending = Array.from(this.container.children);
    }

    afterRender() {
        this.element = this.container.querySelector('.holi-dashboardgrid');
        this.surface = this.element.querySelector('[data-role="surface"]');
        this.emptyEl = this.element.querySelector('[data-role="empty"]');
        if (!this.surface || !this.emptyEl) throw new Error('Dashboard grid template is missing required nodes');
        this.surface.style.setProperty('--dg-cols', String(this.cols));
        this.surface.style.setProperty('--dg-row-height', `${Math.max(20, this.props.rowHeight)}px`);
        this.surface.style.setProperty('--dg-gap', `${Math.max(0, this.props.gap)}px`);

        const saved = new Map((Array.isArray(this.props.layout) ? this.props.layout : []).map((tile) => [String(tile.id), tile]));
        const requested = this.pending.map((child, index) => {
            const id = this.tileId(child, index);
            const own = {
                x: this.numberOf(child.dataset.x),
                y: this.numberOf(child.dataset.y),
                w: this.numberOf(child.dataset.w) ?? DEFAULT_W,
                h: this.numberOf(child.dataset.h) ?? DEFAULT_H
            };
            this.mountTile(id, child);
            return { id, ...own, ...(saved.get(id) || {}) };
        });
        this.pending = [];
        this.items = compact(autoPlace(requested, this.cols), this.cols);
        this.setEditable(this.editable);
        this.apply();

        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.measure());
            this.resizeObserver.observe(this.surface);
        }
        this.measure();
    }

    numberOf(value) {
        if (value === undefined || value === null || value === '') return undefined;
        const n = Number(value);
        return Number.isFinite(n) ? n : undefined;
    }

    tileId(child, index) {
        const id = child.id || child.dataset.tileId || `tile-${index + 1}-${Math.random().toString(36).slice(2, 7)}`;
        child.dataset.tileId = id;
        return id;
    }

    /** Puts the child inside a tile frame, under its heading, and registers the frame under the tile's id. */
    mountTile(id, child) {
        const frame = this.renderTemplate('dashboardgrid-tile-template', { item: { id } }).firstElementChild;
        frame.querySelector('[data-role="title"]').textContent = child.dataset.title || '';
        frame.querySelector('[data-role="body"]').appendChild(child);
        this.surface.appendChild(frame);
        this.frames.set(id, { frame, content: child });
    }

    /** Writes every tile's place into the CSS custom properties its frame is positioned by. */
    apply() {
        this.items.forEach((item) => {
            const entry = this.frames.get(item.id);
            if (!entry) return;
            entry.frame.style.setProperty('--x', String(item.x));
            entry.frame.style.setProperty('--y', String(item.y));
            entry.frame.style.setProperty('--w', String(item.w));
            entry.frame.style.setProperty('--h', String(item.h));
        });
        this.emptyEl.hidden = this.items.length > 0;
    }

    measure() {
        const width = this.surface.getBoundingClientRect().width;
        const stacked = width > 0 && width < STACK_BELOW;
        if (stacked === this.stacked && this.element.hasAttribute('data-stacked')) return;
        this.stacked = stacked;
        this.element.setAttribute('data-stacked', String(stacked));
    }

    // ---- public API ------------------------------------------------------------------------------------------------

    /** The layout now: one `{ id, x, y, w, h }` per tile, to save and to give back as the `layout` attribute or {@link setLayout}. */
    getLayout() {
        return this.items.map((item) => ({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h }));
    }

    /** Applies a saved layout; tiles it does not mention keep their place, and tiles it names that do not exist are ignored. */
    setLayout(layout) {
        const byId = new Map((Array.isArray(layout) ? layout : []).map((tile) => [String(tile.id), tile]));
        this.items = compact(this.items.map((item) => ({ ...item, ...(byId.get(item.id) || {}) })), this.cols);
        this.apply();
        this.emitLayoutChange();
    }

    /** Adds a tile for the element at the given place (or the first free spot) and returns its id. */
    addTile(element, spec = {}) {
        const index = this.items.length;
        if (spec.id) element.id = spec.id;
        if (spec.title !== undefined) element.dataset.title = spec.title;
        const id = this.tileId(element, index);
        this.mountTile(id, element);
        const added = { id, x: spec.x, y: spec.y, w: spec.w ?? DEFAULT_W, h: spec.h ?? DEFAULT_H };
        this.items = compact(autoPlace([...this.items, added], this.cols), this.cols);
        this.apply();
        this.emitLayoutChange();
        return id;
    }

    /** Takes a tile out of the grid, along with its content, and lets the others settle. */
    removeTile(id) {
        const entry = this.frames.get(id);
        if (!entry) return false;
        entry.frame.remove();
        this.frames.delete(id);
        this.items = compact(this.items.filter((item) => item.id !== id), this.cols);
        this.apply();
        this.emitLayoutChange();
        return true;
    }

    setEditable(on) {
        this.editable = !!on;
        this.element.setAttribute('data-editable', String(this.editable));
        this.frames.forEach(({ frame }) => {
            frame.querySelector('[data-role="handle"]').tabIndex = this.editable ? 0 : -1;
        });
    }

    // ---- pointer and keyboard editing ---------------------------------------------------------------------------------

    beginMove(event, trigger) {
        this.beginDrag(event, trigger, 'move');
    }

    beginResize(event, trigger) {
        this.beginDrag(event, trigger, 'resize');
    }

    beginDrag(event, trigger, mode) {
        if (!this.editable || this.stacked || event.button > 0 || this.drag) return;
        const frame = trigger.closest('.holi-dashboardgrid-tile');
        const item = this.items.find((candidate) => candidate.id === frame.dataset.tile);
        if (!item) return;
        event.preventDefault();
        const box = this.surface.getBoundingClientRect();
        const gap = Math.max(0, this.props.gap);
        this.drag = {
            mode,
            id: item.id,
            target: trigger,
            frame,
            startX: event.clientX,
            startY: event.clientY,
            origin: { ...item },
            before: this.items.map((tile) => ({ ...tile })),
            colWidth: (box.width + gap) / this.cols,
            rowHeight: Math.max(20, this.props.rowHeight) + gap
        };
        try {
            trigger.setPointerCapture?.(event.pointerId);
        } catch (_error) {
            // A pointer that is gone (or a synthetic one) cannot be captured; the drag then follows the pointer only while it stays over the grip.
        }
        trigger.addEventListener('pointermove', this.onDragMove);
        trigger.addEventListener('pointerup', this.onDragEnd);
        trigger.addEventListener('pointercancel', this.onDragEnd);
        frame.classList.add('is-dragging');
    }

    dragMove(event) {
        const d = this.drag;
        if (!d) return;
        const dCols = Math.round((event.clientX - d.startX) / d.colWidth);
        const dRows = Math.round((event.clientY - d.startY) / d.rowHeight);
        this.items = d.mode === 'move'
            ? moveTile(d.before, d.id, d.origin.x + dCols, d.origin.y + dRows, this.cols)
            : resizeTile(d.before, d.id, d.origin.w + dCols, d.origin.h + dRows, this.cols);
        this.apply();
    }

    endDrag() {
        const d = this.drag;
        if (!d) return;
        d.target.removeEventListener('pointermove', this.onDragMove);
        d.target.removeEventListener('pointerup', this.onDragEnd);
        d.target.removeEventListener('pointercancel', this.onDragEnd);
        d.frame.classList.remove('is-dragging');
        this.drag = null;
        if (!sameLayout(d.before, this.items)) this.emitLayoutChange();
    }

    /** Arrow keys on a tile's grip move it a cell; with Shift they resize it a cell. */
    handleKey(event, trigger) {
        if (!this.editable || this.stacked) return;
        const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!step) return;
        const id = trigger.closest('.holi-dashboardgrid-tile').dataset.tile;
        const item = this.items.find((candidate) => candidate.id === id);
        if (!item) return;
        event.preventDefault();
        const before = this.items.map((tile) => ({ ...tile }));
        this.items = event.shiftKey
            ? resizeTile(before, id, item.w + step[0], item.h + step[1], this.cols)
            : moveTile(before, id, item.x + step[0], item.y + step[1], this.cols);
        this.apply();
        if (!sameLayout(before, this.items)) this.emitLayoutChange();
    }

    removeClick(event, trigger) {
        if (!this.editable) return;
        const id = trigger.dataset.tile;
        const entry = this.frames.get(id);
        if (!entry) return;
        this.removeTile(id);
        this.emit('dashboardtileremove', { id, element: entry.content });
    }

    emitLayoutChange() {
        this.emit('dashboardlayoutchange', { layout: this.getLayout() });
    }

    emit(name, detail) {
        this.element?.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
    }

    destroy() {
        this.resizeObserver?.disconnect();
        super.destroy();
    }
}

export { DashboardGridComponent };
