import { Component } from './component.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
const PALETTE = ['#2563eb', '#dc2626', '#f59e0b', '#10b981', '#7c3aed', '#0ea5e9', '#f97316', '#64748b'];
/** Tick steps an axis may use, finest first; the first that keeps labels apart wins. */
const TICK_STEPS = [1, 5, 10, 15, 30].map((n) => n * UNIT_MS.s)
    .concat([1, 2, 5, 10, 15, 30].map((n) => n * UNIT_MS.m))
    .concat([1, 2, 3, 6, 12].map((n) => n * UNIT_MS.h))
    .concat([1, 2, 7, 14, 30].map((n) => n * UNIT_MS.d));
const MARGIN = { top: 8, right: 8, bottom: 22, left: 44 };

/**
 * A time histogram: counts per time bucket, stacked by series, over a time axis -- the bar chart above a log search.
 *
 * Data is one object per bucket, its start time in `t` (ISO text or epoch milliseconds) and a count per series:
 * `[{ "t": "2026-10-02T10:00:00Z", "error": 3, "info": 41 }]`. `series` names the series in stacking order with a
 * label and colour each; without it every key but `t` is a series. The bucket width is `interval` ("1m", "5m" or
 * milliseconds), else the smallest gap between buckets. The axis spans `from`..`to` when given, so empty buckets at the
 * edges still take their room.
 *
 * Hovering shows a bucket's counts; dragging across the plot selects a range; clicking selects a bucket; clicking a
 * legend entry hides or shows its series. Events (bubbling, so a page may listen on the host):
 * - `histogrambrush` -- a dragged range: `{ from, to }` as ISO text
 * - `histogramselect` -- a clicked bucket: `{ from, to, values, total }`
 * - `histogramseriestoggle` -- `{ key, visible }`
 */
class HistogramComponent extends Component {
    static componentName = 'histogram';
    static templateId = 'histogram-template';

    static get selector() {
        return 'histogram';
    }

    static get library() {
        return 'holi';
    }

    static props = {
        data: { attr: 'data', type: 'array', default: [] },
        series: { attr: 'series', type: 'array', default: [] },
        interval: { attr: 'interval', default: '' },
        from: { attr: 'from', default: '' },
        to: { attr: 'to', default: '' },
        height: { attr: 'height', type: 'number', default: 180 },
        stacked: { attr: 'stacked', type: 'boolean', default: true },
        brush: { attr: 'brush', type: 'boolean', default: true },
        showLegend: { attr: 'show-legend', type: 'boolean', default: true },
        timezone: { attr: 'timezone', default: 'local' },
        valueLabel: { attr: 'value-label', default: 'count' }
    };

    static events = {
        'click [data-action="toggle-series"]': 'toggleSeries'
    };

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = HistogramComponent.templateId;
        this.hidden = new Set();
        this.buckets = [];
        this.drag = null;
        this.onPointerDown = (event) => this.pointerDown(event);
        this.onPointerMove = (event) => this.pointerMove(event);
        this.onPointerUp = (event) => this.pointerUp(event);
        this.onPointerLeave = () => this.pointerLeave();
        this.initComponent();
    }

    setup() {
        this.utc = String(this.props.timezone).toLowerCase() === 'utc';
        this.load(this.props.data, this.props);
    }

    afterRender() {
        this.element = this.container.querySelector('.holi-histogram');
        this.plotEl = this.element.querySelector('[data-role="plot"]');
        this.svgEl = this.element.querySelector('[data-role="svg"]');
        this.tooltipEl = this.element.querySelector('[data-role="tooltip"]');
        this.emptyEl = this.element.querySelector('[data-role="empty"]');
        this.legendEl = this.element.querySelector('[data-role="legend"]');
        this.svgEl.style.height = `${Math.max(80, this.props.height)}px`;

        this.plotEl.addEventListener('pointerdown', this.onPointerDown);
        this.plotEl.addEventListener('pointermove', this.onPointerMove);
        this.plotEl.addEventListener('pointerup', this.onPointerUp);
        this.plotEl.addEventListener('pointerleave', this.onPointerLeave);
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.scheduleDraw());
            this.resizeObserver.observe(this.plotEl);
        }
        this.draw();
    }

    // ---- data -----------------------------------------------------------------------------------------

    /** Milliseconds from "30s", "5m", "1h", "1d" or a number; null for anything else. */
    static parseInterval(value) {
        if (value == null || value === '') return null;
        if (typeof value === 'number') return value > 0 ? value : null;
        const match = /^(\d+(?:\.\d+)?)\s*([smhdw])?$/.exec(String(value).trim());
        if (!match) return null;
        const ms = Number(match[1]) * (match[2] ? UNIT_MS[match[2]] : 1);
        return ms > 0 ? ms : null;
    }

    static toMillis(value) {
        if (value == null || value === '') return null;
        if (value instanceof Date) return value.getTime();
        const ms = /^\d+$/.test(String(value)) ? Number(value) : Date.parse(value);
        return Number.isFinite(ms) ? ms : null;
    }

    load(data, options = {}) {
        const rows = (Array.isArray(data) ? data : [])
            .map((row) => ({ ...row, t: HistogramComponent.toMillis(row?.t ?? row?.time ?? row?.ts) }))
            .filter((row) => row.t != null)
            .sort((a, b) => a.t - b.t);

        const declared = Array.isArray(options.series) && options.series.length ? options.series : null;
        const keys = declared ? declared.map((s) => (typeof s === 'string' ? s : s.key))
            : Array.from(rows.reduce((set, row) => {
                Object.keys(row).forEach((k) => { if (k !== 't' && k !== 'time' && k !== 'ts') set.add(k); });
                return set;
            }, new Set()));
        this.series = keys.map((key, index) => {
            const spec = declared ? declared[index] : null;
            return {
                key,
                label: (spec && typeof spec === 'object' && spec.label) || key,
                color: (spec && typeof spec === 'object' && spec.color) || PALETTE[index % PALETTE.length]
            };
        });

        let interval = HistogramComponent.parseInterval(options.interval);
        if (!interval) {
            for (let i = 1; i < rows.length; i += 1) {
                const gap = rows[i].t - rows[i - 1].t;
                if (gap > 0 && (!interval || gap < interval)) interval = gap;
            }
        }
        this.interval = interval || UNIT_MS.m;
        this.buckets = rows.map((row) => ({
            t: row.t,
            values: Object.fromEntries(this.series.map((s) => [s.key, Math.max(0, Number(row[s.key]) || 0)]))
        }));

        const from = HistogramComponent.toMillis(options.from);
        const to = HistogramComponent.toMillis(options.to);
        this.domain = {
            from: from ?? (rows.length ? rows[0].t : Date.now() - UNIT_MS.h),
            to: to ?? (rows.length ? rows[rows.length - 1].t + this.interval : Date.now())
        };
        if (this.domain.to <= this.domain.from) this.domain.to = this.domain.from + this.interval;
    }

    /** Replaces the data; options may also carry series, interval, from and to. */
    update(data = [], options = {}) {
        this.load(data, {
            series: options.series ?? (this.series || []).map((s) => ({ ...s })),
            interval: options.interval ?? (this.props.interval || null),
            from: options.from ?? null,
            to: options.to ?? null
        });
        this.draw();
    }

    totalOf(bucket) {
        return this.series.reduce((sum, s) => sum + (this.hidden.has(s.key) ? 0 : bucket.values[s.key]), 0);
    }

    // ---- drawing --------------------------------------------------------------------------------------

    scheduleDraw() {
        if (this.drawPending) return;
        this.drawPending = true;
        requestAnimationFrame(() => {
            this.drawPending = false;
            this.draw();
        });
    }

    draw() {
        if (!this.svgEl) return;
        this.svgEl.replaceChildren();
        const hasData = this.buckets.some((b) => this.series.some((s) => b.values[s.key] > 0));
        this.emptyEl.hidden = hasData;
        this.drawLegend();

        const width = Math.max(120, Math.floor(this.plotEl.clientWidth || 600));
        const height = Math.max(80, this.props.height);
        this.svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
        this.svgEl.setAttribute('width', String(width));
        this.svgEl.setAttribute('height', String(height));
        this.svgEl.setAttribute('aria-label', `Histogram of ${this.props.valueLabel} over time`);

        const plot = { x: MARGIN.left, y: MARGIN.top, w: width - MARGIN.left - MARGIN.right,
            h: height - MARGIN.top - MARGIN.bottom };
        this.plot = plot;
        const span = this.domain.to - this.domain.from;
        this.xOf = (t) => plot.x + ((t - this.domain.from) / span) * plot.w;
        this.tOf = (x) => this.domain.from + ((Math.min(Math.max(x, plot.x), plot.x + plot.w) - plot.x) / plot.w) * span;

        const peak = Math.max(1, ...this.buckets.map((b) => (this.props.stacked
            ? this.totalOf(b)
            : Math.max(0, ...this.series.filter((s) => !this.hidden.has(s.key)).map((s) => b.values[s.key])))));
        const top = HistogramComponent.niceCeiling(peak);
        const yOf = (v) => plot.y + plot.h - (v / top) * plot.h;

        const grid = this.svgNode('g', { class: 'holi-histogram-grid' });
        [0, top / 2, top].forEach((v) => {
            const y = yOf(v);
            grid.appendChild(this.svgNode('line', { x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y }));
            const label = this.svgNode('text', { x: plot.x - 6, y: y + 4, class: 'holi-histogram-axis-y' });
            label.textContent = HistogramComponent.formatCount(v);
            grid.appendChild(label);
        });
        this.svgEl.appendChild(grid);
        this.drawTimeAxis(plot);

        const bars = this.svgNode('g', { class: 'holi-histogram-bars' });
        this.buckets.forEach((bucket, index) => {
            const x0 = this.xOf(bucket.t);
            const x1 = this.xOf(bucket.t + this.interval);
            if (x1 < plot.x || x0 > plot.x + plot.w) return;
            const left = Math.max(plot.x, x0);
            const barWidth = Math.max(1, Math.min(plot.x + plot.w, x1) - left - (x1 - x0 > 4 ? 1 : 0));
            let base = 0;
            this.series.forEach((s, seriesIndex) => {
                if (this.hidden.has(s.key)) return;
                const value = bucket.values[s.key];
                if (!value) return;
                const offset = this.props.stacked ? base : 0;
                const y = yOf(offset + value);
                const barHeight = Math.max(1, yOf(offset) - y);
                const rect = this.svgNode('rect', {
                    x: left + (this.props.stacked ? 0 : (barWidth / this.series.length) * seriesIndex),
                    y,
                    width: this.props.stacked ? barWidth : Math.max(1, barWidth / this.series.length),
                    height: barHeight,
                    fill: s.color,
                    class: 'holi-histogram-bar',
                    'data-bucket-index': index,
                    'data-series': s.key
                });
                bars.appendChild(rect);
                base += value;
            });
        });
        this.svgEl.appendChild(bars);

        this.hoverEl = this.svgNode('rect', { class: 'holi-histogram-hover', x: 0, y: plot.y, width: 0,
            height: plot.h, visibility: 'hidden' });
        this.brushEl = this.svgNode('rect', { class: 'holi-histogram-brush', x: 0, y: plot.y, width: 0,
            height: plot.h, visibility: 'hidden' });
        this.svgEl.append(this.hoverEl, this.brushEl);
    }

    drawTimeAxis(plot) {
        const span = this.domain.to - this.domain.from;
        const maxTicks = Math.max(2, Math.floor(plot.w / 90));
        const step = TICK_STEPS.find((s) => span / s <= maxTicks) || TICK_STEPS[TICK_STEPS.length - 1];
        // Ticks fall on round times in the zone shown: local midnight and local hours, not UTC ones.
        const offset = this.utc || step < UNIT_MS.h ? 0 : -new Date(this.domain.from).getTimezoneOffset() * 60000;
        const first = Math.ceil((this.domain.from + offset) / step) * step - offset;
        const axis = this.svgNode('g', { class: 'holi-histogram-axis-x' });
        axis.appendChild(this.svgNode('line', { x1: plot.x, y1: plot.y + plot.h, x2: plot.x + plot.w,
            y2: plot.y + plot.h }));
        let previousDay = null;
        for (let t = first; t <= this.domain.to; t += step) {
            const x = this.xOf(t);
            axis.appendChild(this.svgNode('line', { x1: x, y1: plot.y + plot.h, x2: x, y2: plot.y + plot.h + 4 }));
            const label = this.svgNode('text', { x, y: plot.y + plot.h + 16 });
            const day = this.format(t, { month: 'short', day: 'numeric' });
            const clock = this.format(t, step < UNIT_MS.m
                ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
                : { hour: '2-digit', minute: '2-digit', hour12: false });
            label.textContent = step >= UNIT_MS.d ? day : (day !== previousDay && previousDay !== null ? `${day} ${clock}` : clock);
            previousDay = day;
            axis.appendChild(label);
        }
        this.svgEl.appendChild(axis);
    }

    drawLegend() {
        this.legendEl.hidden = !this.props.showLegend || !this.series.length;
        if (this.legendEl.hidden) return;
        const items = this.series.map((s) => ({
            key: s.key,
            label: s.label,
            total: HistogramComponent.formatCount(this.buckets.reduce((sum, b) => sum + b.values[s.key], 0))
        }));
        this.renderList(this.legendEl, 'histogram-legend-item-template', items);
        this.legendEl.querySelectorAll('[data-action="toggle-series"]').forEach((button, index) => {
            const s = this.series[index];
            button.querySelector('[data-role="swatch"]').style.background = s.color;
            button.setAttribute('aria-pressed', String(!this.hidden.has(s.key)));
            button.classList.toggle('is-hidden', this.hidden.has(s.key));
        });
    }

    format(t, options) {
        return new Intl.DateTimeFormat(undefined, this.utc ? { ...options, timeZone: 'UTC' } : options)
            .format(new Date(t));
    }

    /** The smallest round number at or above the value -- 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 times a power of ten. */
    static niceCeiling(value) {
        const power = 10 ** Math.floor(Math.log10(Math.max(1, value)));
        const scaled = value / power;
        const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => scaled <= s + 1e-9);
        return Math.max(1, Math.round(step * power));
    }

    static formatCount(value) {
        if (value >= 1e6) return `${+(value / 1e6).toFixed(1)}M`;
        if (value >= 1e4) return `${+(value / 1e3).toFixed(1)}k`;
        return String(Math.round(value * 100) / 100);
    }

    svgNode(tag, attrs = {}) {
        const node = document.createElementNS(SVG_NS, tag);
        Object.entries(attrs).forEach(([name, value]) => {
            if (value != null) node.setAttribute(name, String(value));
        });
        return node;
    }

    // ---- interaction ----------------------------------------------------------------------------------

    localX(event) {
        const box = this.svgEl.getBoundingClientRect();
        return event.clientX - box.left;
    }

    bucketAt(x) {
        const t = this.tOf(x);
        for (let i = this.buckets.length - 1; i >= 0; i -= 1) {
            const b = this.buckets[i];
            if (t >= b.t && t < b.t + this.interval) return i;
        }
        return -1;
    }

    pointerDown(event) {
        if (event.button !== 0 || !this.plot) return;
        const x = this.localX(event);
        if (x < this.plot.x || x > this.plot.x + this.plot.w) return;
        this.drag = { startX: x, moved: false };
        this.plotEl.setPointerCapture?.(event.pointerId);
    }

    pointerMove(event) {
        if (!this.plot) return;
        const x = this.localX(event);
        if (this.drag && this.props.brush) {
            if (Math.abs(x - this.drag.startX) > 4) this.drag.moved = true;
            if (this.drag.moved) {
                const left = Math.max(this.plot.x, Math.min(x, this.drag.startX));
                const right = Math.min(this.plot.x + this.plot.w, Math.max(x, this.drag.startX));
                this.brushEl.setAttribute('x', String(left));
                this.brushEl.setAttribute('width', String(right - left));
                this.brushEl.setAttribute('visibility', 'visible');
                this.tooltipEl.hidden = true;
                return;
            }
        }
        this.showTooltip(this.bucketAt(x), x);
    }

    pointerUp(event) {
        if (!this.drag) return;
        const drag = this.drag;
        this.drag = null;
        this.brushEl?.setAttribute('visibility', 'hidden');
        const x = this.localX(event);
        if (drag.moved && this.props.brush) {
            const from = this.tOf(Math.min(x, drag.startX));
            const to = this.tOf(Math.max(x, drag.startX));
            if (to > from) this.emit('histogrambrush', { from: new Date(from).toISOString(), to: new Date(to).toISOString() });
            return;
        }
        const index = this.bucketAt(x);
        if (index < 0) return;
        const bucket = this.buckets[index];
        this.emit('histogramselect', {
            from: new Date(bucket.t).toISOString(),
            to: new Date(bucket.t + this.interval).toISOString(),
            values: { ...bucket.values },
            total: this.totalOf(bucket)
        });
    }

    pointerLeave() {
        if (this.drag) return;
        this.tooltipEl.hidden = true;
        this.hoverEl?.setAttribute('visibility', 'hidden');
    }

    showTooltip(index, x) {
        if (index < 0) {
            this.pointerLeave();
            return;
        }
        const bucket = this.buckets[index];
        const x0 = Math.max(this.plot.x, this.xOf(bucket.t));
        const x1 = Math.min(this.plot.x + this.plot.w, this.xOf(bucket.t + this.interval));
        this.hoverEl.setAttribute('x', String(x0));
        this.hoverEl.setAttribute('width', String(Math.max(1, x1 - x0)));
        this.hoverEl.setAttribute('visibility', 'visible');

        const clock = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
        if (this.interval < UNIT_MS.m) clock.second = '2-digit';
        this.tooltipEl.querySelector('[data-role="tooltip-time"]').textContent =
            `${this.format(bucket.t, clock)} – ${this.format(bucket.t + this.interval, clock)}${this.utc ? ' UTC' : ''}`;
        const rows = this.series.filter((s) => !this.hidden.has(s.key))
            .map((s) => ({ label: s.label, value: HistogramComponent.formatCount(bucket.values[s.key]), color: s.color }));
        const list = this.tooltipEl.querySelector('[data-role="tooltip-rows"]');
        this.renderList(list, 'histogram-tooltip-row-template', rows);
        list.querySelectorAll('[data-role="swatch"]').forEach((swatch, i) => { swatch.style.background = rows[i].color; });
        this.tooltipEl.querySelector('[data-role="tooltip-total"]').textContent =
            `${HistogramComponent.formatCount(this.totalOf(bucket))} ${this.props.valueLabel}`;
        this.tooltipEl.hidden = false;
        const room = this.plotEl.clientWidth - this.tooltipEl.offsetWidth - 4;
        this.tooltipEl.style.left = `${Math.max(0, Math.min(room, x + 12))}px`;
    }

    toggleSeries(_event, trigger) {
        const key = trigger.getAttribute('data-series');
        if (this.hidden.has(key)) this.hidden.delete(key);
        else if (this.hidden.size < this.series.length - 1) this.hidden.add(key);   // one series stays visible
        this.draw();
        this.emit('histogramseriestoggle', { key, visible: !this.hidden.has(key) });
    }

    emit(name, detail) {
        this.element?.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
    }

    destroy() {
        this.resizeObserver?.disconnect();
        this.plotEl?.removeEventListener('pointerdown', this.onPointerDown);
        this.plotEl?.removeEventListener('pointermove', this.onPointerMove);
        this.plotEl?.removeEventListener('pointerup', this.onPointerUp);
        this.plotEl?.removeEventListener('pointerleave', this.onPointerLeave);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.HistogramComponent = HistogramComponent;
}

export { HistogramComponent };
