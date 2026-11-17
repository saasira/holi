import { Component } from './component.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#7c3aed', '#14b8a6', '#f97316'];
const TYPES = ['line', 'bar', 'area', 'pie', 'doughnut', 'scatter'];
const SERIES_TYPES = ['line', 'bar', 'area', 'scatter'];
const MARGIN = { top: 10, right: 12, bottom: 30, left: 54 };
const RIGHT_AXIS_MARGIN = 54;
const TITLE_ROOM = 14;
/** How near, in pixels, a pointer must be to a scatter point to pick it. */
const HIT_RADIUS = 24;

/**
 * A chart over rows of data: lines, bars, areas and scatter points on one or two value axes, stacked or side by side, and pie or doughnut.
 *
 * Data is one object per row. `x` names the column that is the x axis (its text for lines and bars, its number for scatter); `series` names the
 * columns drawn, as strings or as `{ key, label, color, type, axis }` where `type` is line, bar, area or scatter (so a bar series and a line series
 * share a chart) and `axis` is "left" (the default) or "right" (a second value axis, with its own scale):
 *
 * ```html
 * <chart type="bar" x="month" series='[{"key":"revenue"},{"key":"margin","type":"line","axis":"right"}]'
 *        data='[{"month":"Jan","revenue":120,"margin":0.31},{"month":"Feb","revenue":-40,"margin":0.12}]'></chart>
 * ```
 *
 * Values may be negative; a bar grows from zero in either direction. `stacked` stacks bar and area series (positives up from zero, negatives down).
 * Without `x` or `series` the first column is x and every other numeric column a series. The older form, one series of `{ label, value }`, still
 * works, and is what pie and doughnut draw (a slice per row). Hovering shows the values; clicking a legend entry hides or shows its series.
 *
 * Events (on the chart element, bubbling):
 * - `chartpointselect` -- a clicked point, bar or slice: `{ index, item, type, series }`
 * - `chartupdate` -- after `update()`: `{ type, count }`
 */
class ChartComponent extends Component {
    static get selector() {
        return 'chart';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'chart';
    }

    static templateId = 'chart-template';

    static props = {
        type: { attr: 'type', default: 'line' },
        height: { attr: 'height', type: 'number', default: 220 },
        showLegend: { attr: 'show-legend', type: 'boolean', default: true },
        title: { attr: 'title', default: '' },
        colors: { attr: 'colors', default: '' },
        data: { attr: 'data', type: 'array', default: [] },
        series: { attr: 'series', type: 'array', default: [] },
        x: { attr: 'x', default: '' },
        stacked: { attr: 'stacked', type: 'boolean', default: false },
        xTitle: { attr: 'x-title', default: '' },
        yTitle: { attr: 'y-title', default: '' },
        y2Title: { attr: 'y2-title', default: '' }
    };

    static events = {
        'click [data-action="toggle-series"]': 'toggleSeries'
    };

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = ChartComponent.templateId;
        this.rows = [];
        this.series = [];
        this.values = {};
        this.categories = [];
        this.hidden = new Set();
        this.legacy = false;
        this.hover = null;
        this.onPointerMove = (event) => this.pointerMove(event);
        this.onPointerLeave = () => this.clearHover();
        this.onClick = (event) => this.pointClicked(event);
        this.initComponent();
    }

    setup() {
        this.props.type = ChartComponent.resolveType(this.props.type);
        this.load(this.props.data, this.props);
    }

    afterRender() {
        this.element = this.container.querySelector('.holi-chart');
        this.plotEl = this.element.querySelector('[data-role="plot"]');
        this.svgEl = this.element.querySelector('[data-role="svg"]');
        this.emptyEl = this.element.querySelector('[data-role="empty"]');
        this.legendEl = this.element.querySelector('[data-role="legend"]');
        this.titleEl = this.element.querySelector('[data-role="title"]');
        this.tooltipEl = this.element.querySelector('[data-role="tooltip"]');
        this.tooltipHeadEl = this.element.querySelector('[data-role="tooltip-head"]');
        this.tooltipRowsEl = this.element.querySelector('[data-role="tooltip-rows"]');
        if (!this.svgEl || !this.legendEl || !this.emptyEl || !this.titleEl || !this.plotEl || !this.tooltipEl) {
            throw new Error('Chart template is missing required nodes');
        }
        this.element.style.setProperty('--chart-height', `${Math.max(120, this.props.height)}px`);
        this.titleEl.textContent = this.props.title;
        this.titleEl.hidden = !this.props.title;

        this.plotEl.addEventListener('pointermove', this.onPointerMove);
        this.plotEl.addEventListener('pointerleave', this.onPointerLeave);
        this.svgEl.addEventListener('click', this.onClick);
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.scheduleDraw());
            this.resizeObserver.observe(this.plotEl);
        }
        this.draw();
    }

    // ---- data -----------------------------------------------------------------------------------------

    static resolveType(type) {
        const next = String(type || 'line').trim().toLowerCase();
        return TYPES.includes(next) ? next : 'line';
    }

    static toNumber(value) {
        if (value == null || value === '' || typeof value === 'boolean') return null;
        const n = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(n) ? n : null;
    }

    palette() {
        const raw = this.props.colors;
        let list = [];
        if (Array.isArray(raw)) list = raw;
        else if (String(raw || '').trim().startsWith('[')) {
            try {
                list = JSON.parse(raw);
            } catch (_error) {
                list = [];
            }
        } else if (String(raw || '').trim()) {
            list = String(raw).split(',');
        }
        list = list.map((c) => String(c).trim()).filter(Boolean);
        return list.length ? list : DEFAULT_COLORS;
    }

    /** Reads rows, the x column and the series out of the data and the options (series, x) that go with it. */
    load(data, options = {}) {
        let rows = (Array.isArray(data) ? data : []).filter((r) => r && typeof r === 'object');
        let specs = Array.isArray(options.series) ? options.series : [];
        let xKey = String(options.x || '');

        // The older attribute `series` carried the data itself, [{label, value}].
        if (!rows.length && specs.length && specs.every((s) => s && typeof s === 'object' && !('key' in s) && ('value' in s))) {
            rows = specs;
            specs = [];
        }
        const oldShape = !specs.length && !xKey && rows.length
            && rows.every((r) => ('value' in r || 'y' in r || 'amount' in r) && ('label' in r || 'name' in r || 'x' in r));
        this.legacy = oldShape;
        if (oldShape) {
            this.data = rows.map((r, i) => ({
                label: String(r.label ?? r.name ?? r.x ?? `Item ${i + 1}`),
                value: Math.max(0, ChartComponent.toNumber(r.value ?? r.y ?? r.amount) ?? 0)
            }));
            rows = this.data;
            xKey = 'label';
            specs = [{ key: 'value', label: this.props.title || 'value' }];
        } else {
            this.data = rows;
            if (!xKey && rows.length) xKey = Object.keys(rows[0])[0] || '';
            if (!specs.length) {
                const keys = [];
                rows.forEach((r) => Object.keys(r).forEach((k) => {
                    if (k !== xKey && !keys.includes(k)) keys.push(k);
                }));
                specs = keys.filter((k) => rows.some((r) => ChartComponent.toNumber(r[k]) != null));
            }
        }

        const colors = this.palette();
        const defaultType = SERIES_TYPES.includes(this.props.type) ? this.props.type : 'bar';
        this.xKey = xKey;
        this.rows = rows;
        this.series = specs.map((spec, index) => {
            const o = typeof spec === 'string' ? { key: spec } : spec;
            const type = SERIES_TYPES.includes(String(o.type || '').toLowerCase()) ? String(o.type).toLowerCase() : defaultType;
            return {
                key: String(o.key),
                label: String(o.label ?? o.key),
                color: String(o.color || colors[index % colors.length]),
                type,
                axis: String(o.axis || '').toLowerCase() === 'right' ? 'right' : 'left'
            };
        });
        this.values = Object.fromEntries(this.series.map((s) => [s.key, rows.map((r) => ChartComponent.toNumber(r[s.key]))]));
        this.categories = rows.map((r, i) => (r[xKey] == null ? `Item ${i + 1}` : String(r[xKey])));
        this.xs = rows.map((r) => ChartComponent.toNumber(r[xKey]));
        // x is a number line when every series is scatter; otherwise rows sit side by side as categories.
        this.linear = this.series.length > 0 && this.series.every((s) => s.type === 'scatter')
            && this.props.type !== 'pie' && this.props.type !== 'doughnut';
        this.hidden = new Set([...this.hidden].filter((k) => this.series.some((s) => s.key === k)));
    }

    /** Replaces the data. Options may also carry type, height, colors, title, showLegend, series, x and stacked. */
    update(data = [], options = {}) {
        if (options.type) this.props.type = ChartComponent.resolveType(options.type);
        if (options.height != null) {
            this.props.height = ChartComponent.toNumber(options.height) ?? this.props.height;
            this.element?.style.setProperty('--chart-height', `${Math.max(120, this.props.height)}px`);
        }
        if (options.colors) this.props.colors = options.colors;
        if (options.title != null) {
            this.props.title = String(options.title || '').trim();
            if (this.titleEl) {
                this.titleEl.textContent = this.props.title;
                this.titleEl.hidden = !this.props.title;
            }
        }
        if (options.showLegend != null) this.props.showLegend = !!options.showLegend;
        if (options.stacked != null) this.props.stacked = !!options.stacked;
        ['xTitle', 'yTitle', 'y2Title'].forEach((k) => {
            if (options[k] != null) this.props[k] = String(options[k]);
        });
        this.hidden = new Set();
        this.load(data, { series: options.series ?? [], x: options.x ?? '' });
        this.draw();
        this.dispatchEvent('chartupdate', { type: this.props.type, count: this.rows.length });
    }

    setType(nextType) {
        this.props.type = ChartComponent.resolveType(nextType);
        this.load(this.data, { series: this.legacy ? [] : this.series, x: this.legacy ? '' : this.xKey });
        this.draw();
    }

    // ---- scales ---------------------------------------------------------------------------------------

    static niceNum(range, round) {
        const exp = Math.floor(Math.log10(range));
        const f = range / (10 ** exp);
        let nf;
        if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
        else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
        return nf * (10 ** exp);
    }

    /** A round range around min..max, with at most about `maxTicks` round ticks: `{ lo, hi, step, ticks }`. */
    static niceScale(min, max, maxTicks = 5) {
        let lo = Number.isFinite(min) ? min : 0;
        let hi = Number.isFinite(max) ? max : 1;
        if (lo === hi) {
            const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
            lo -= pad;
            hi += pad;
        }
        const step = ChartComponent.niceNum(ChartComponent.niceNum(hi - lo, false) / Math.max(1, maxTicks - 1), true);
        const first = Math.floor(lo / step) * step;
        const last = Math.ceil(hi / step) * step;
        const ticks = [];
        for (let i = 0; first + (i * step) <= last + (step / 2); i += 1) ticks.push(Number((first + (i * step)).toPrecision(12)));
        return { lo: ticks[0], hi: ticks[ticks.length - 1], step, ticks };
    }

    static formatNumber(value) {
        const a = Math.abs(value);
        if (a >= 1e9) return `${+(value / 1e9).toPrecision(3)}B`;
        if (a >= 1e6) return `${+(value / 1e6).toPrecision(3)}M`;
        if (a >= 1e4) return `${+(value / 1e3).toPrecision(3)}k`;
        if (a >= 1 || a === 0) return String(+value.toFixed(2));
        return String(+value.toPrecision(2));
    }

    static formatFull(value) {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
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

    isPie() {
        return this.props.type === 'pie' || this.props.type === 'doughnut';
    }

    draw() {
        if (!this.svgEl) return;
        this.svgEl.replaceChildren();
        this.clearHover();
        const hasData = this.rows.length > 0 && this.series.some((s) => this.values[s.key].some((v) => v != null))
            && (!this.isPie() || this.values[this.series[0].key].some((v) => v != null && v > 0));
        this.emptyEl.hidden = hasData;
        this.svgEl.hidden = !hasData;
        this.drawLegend();
        if (!hasData) {
            this.legendEl.hidden = true;
            return;
        }
        const width = Math.max(160, Math.floor(this.plotEl.clientWidth || 480));
        const height = Math.max(120, this.props.height);
        this.svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
        this.svgEl.setAttribute('width', String(width));
        this.svgEl.setAttribute('height', String(height));
        this.svgEl.setAttribute('aria-label', `Chart (${this.props.type})`);
        if (this.isPie()) this.drawPie(width, height);
        else this.drawCartesian(width, height);
    }

    svgNode(tag, attrs = {}) {
        const node = document.createElementNS(SVG_NS, tag);
        Object.entries(attrs).forEach(([name, value]) => {
            if (value != null) node.setAttribute(name, String(value));
        });
        return node;
    }

    visibleSeries() {
        return this.series.filter((s) => !this.hidden.has(s.key));
    }

    /** Stacked extents of bar and area series on one axis (positives up, negatives down), and the from/to of each value. */
    stackFor(seriesOnAxis) {
        const n = this.rows.length;
        const pos = new Array(n).fill(0);
        const neg = new Array(n).fill(0);
        const spans = {};
        seriesOnAxis.forEach((s) => {
            spans[s.key] = this.values[s.key].map((v, i) => {
                if (v == null) return null;
                const stackable = this.props.stacked && (s.type === 'bar' || s.type === 'area');
                if (!stackable) return { from: 0, to: v };
                if (v >= 0) {
                    const from = pos[i];
                    pos[i] += v;
                    return { from, to: pos[i] };
                }
                const from = neg[i];
                neg[i] += v;
                return { from, to: neg[i] };
            });
        });
        return spans;
    }

    drawCartesian(width, height) {
        const visible = this.visibleSeries();
        const hasRight = visible.some((s) => s.axis === 'right');
        const xTitle = !!this.props.xTitle;
        const plot = {
            x: MARGIN.left,
            y: MARGIN.top,
            w: width - MARGIN.left - (hasRight ? RIGHT_AXIS_MARGIN : MARGIN.right),
            h: height - MARGIN.top - MARGIN.bottom - (xTitle ? TITLE_ROOM : 0)
        };
        this.plot = plot;
        const maxTicks = Math.max(2, Math.floor(plot.h / 38));

        // value axes
        this.axes = {};
        this.spans = {};
        ['left', 'right'].forEach((name) => {
            const on = visible.filter((s) => s.axis === name);
            if (!on.length) return;
            const spans = this.stackFor(on);
            Object.assign(this.spans, spans);
            let min = Infinity;
            let max = -Infinity;
            on.forEach((s) => spans[s.key].forEach((span) => {
                if (!span) return;
                min = Math.min(min, span.from, span.to);
                max = Math.max(max, span.from, span.to);
            }));
            // Bars and areas grow from zero, so zero is on the axis; a line or scatter axis fits its data.
            if (on.some((s) => s.type === 'bar' || s.type === 'area')) {
                min = Math.min(min, 0);
                max = Math.max(max, 0);
            }
            const scale = ChartComponent.niceScale(min, max, maxTicks);
            this.axes[name] = { ...scale, yOf: (v) => plot.y + plot.h - ((v - scale.lo) / (scale.hi - scale.lo)) * plot.h };
        });

        // x axis
        if (this.linear) {
            const xs = [];
            visible.forEach((s) => this.xs.forEach((x, i) => { if (x != null && this.values[s.key][i] != null) xs.push(x); }));
            const scale = ChartComponent.niceScale(Math.min(...xs), Math.max(...xs), Math.max(2, Math.floor(plot.w / 80)));
            this.xScale = scale;
            this.xOf = (i) => plot.x + ((this.xs[i] - scale.lo) / (scale.hi - scale.lo)) * plot.w;
        } else {
            this.band = plot.w / Math.max(1, this.rows.length);
            this.xOf = (i) => plot.x + (this.band * (i + 0.5));
        }

        this.drawGrid(plot);
        this.drawXAxis(plot);
        this.drawAxisTitles(plot, height);

        const layer = this.svgNode('g', { class: 'holi-chart-series' });
        this.svgEl.appendChild(layer);
        ['area', 'bar', 'line', 'scatter'].forEach((type) => {
            const ofType = visible.filter((s) => s.type === type);
            if (type === 'bar') this.drawBars(layer, ofType);
            else ofType.forEach((s) => this.drawSeries(layer, s));
        });

        this.hoverEl = this.svgNode('rect', { class: 'holi-chart-hover', x: 0, y: plot.y, width: 0, height: plot.h, visibility: 'hidden' });
        this.ringEl = this.svgNode('circle', { class: 'holi-chart-ring', r: 6, visibility: 'hidden' });
        this.svgEl.append(this.hoverEl, this.ringEl);
    }

    drawGrid(plot) {
        const grid = this.svgNode('g', { class: 'holi-chart-grid' });
        const primary = this.axes.left || this.axes.right;
        primary.ticks.forEach((v) => {
            const y = primary.yOf(v);
            grid.appendChild(this.svgNode('line', { x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, class: v === 0 ? 'holi-chart-zero' : null }));
        });
        this.svgEl.appendChild(grid);
        const labels = this.svgNode('g', { class: 'holi-chart-axis-y' });
        if (this.axes.left) {
            this.axes.left.ticks.forEach((v) => {
                const t = this.svgNode('text', { x: plot.x - 6, y: this.axes.left.yOf(v) + 4, 'text-anchor': 'end' });
                t.textContent = ChartComponent.formatNumber(v);
                labels.appendChild(t);
            });
        }
        if (this.axes.right) {
            this.axes.right.ticks.forEach((v) => {
                const t = this.svgNode('text', { x: plot.x + plot.w + 6, y: this.axes.right.yOf(v) + 4, 'text-anchor': 'start' });
                t.textContent = ChartComponent.formatNumber(v);
                labels.appendChild(t);
            });
        }
        this.svgEl.appendChild(labels);
    }

    drawXAxis(plot) {
        const axis = this.svgNode('g', { class: 'holi-chart-axis-x' });
        const base = plot.y + plot.h;
        axis.appendChild(this.svgNode('line', { x1: plot.x, y1: base, x2: plot.x + plot.w, y2: base }));
        const label = (x, text) => {
            axis.appendChild(this.svgNode('line', { x1: x, y1: base, x2: x, y2: base + 4 }));
            const t = this.svgNode('text', { x, y: base + 17, 'text-anchor': 'middle' });
            t.textContent = text;
            axis.appendChild(t);
        };
        if (this.linear) {
            this.xScale.ticks.forEach((v) => label(plot.x + ((v - this.xScale.lo) / (this.xScale.hi - this.xScale.lo)) * plot.w, ChartComponent.formatNumber(v)));
        } else {
            const fit = Math.max(1, Math.floor(plot.w / 64));
            const stride = Math.ceil(this.rows.length / fit);
            this.categories.forEach((c, i) => {
                if (i % stride !== 0) return;
                label(this.xOf(i), c.length > 14 ? `${c.slice(0, 13)}…` : c);
            });
        }
        this.svgEl.appendChild(axis);
    }

    drawAxisTitles(plot, height) {
        const titles = this.svgNode('g', { class: 'holi-chart-axis-title' });
        const add = (text, attrs) => {
            if (!text) return;
            const t = this.svgNode('text', attrs);
            t.textContent = text;
            titles.appendChild(t);
        };
        add(this.props.xTitle, { x: plot.x + (plot.w / 2), y: height - 3, 'text-anchor': 'middle' });
        const mid = plot.y + (plot.h / 2);
        add(this.props.yTitle, { x: 0, y: 0, 'text-anchor': 'middle', transform: `translate(11 ${mid}) rotate(-90)` });
        if (this.axes.right) {
            add(this.props.y2Title, { x: 0, y: 0, 'text-anchor': 'middle', transform: `translate(${plot.x + plot.w + RIGHT_AXIS_MARGIN - 6} ${mid}) rotate(90)` });
        }
        this.svgEl.appendChild(titles);
    }

    /** Runs of consecutive rows that have a value, so a gap in the data is a gap in the line. */
    runs(s) {
        const runs = [];
        let run = [];
        this.values[s.key].forEach((v, i) => {
            if (v == null || (this.linear && this.xs[i] == null)) {
                if (run.length) runs.push(run);
                run = [];
            } else {
                run.push(i);
            }
        });
        if (run.length) runs.push(run);
        return runs;
    }

    drawSeries(layer, s) {
        const axis = this.axes[s.axis];
        const spans = this.spans[s.key];
        if (s.type === 'scatter') {
            this.values[s.key].forEach((v, i) => {
                if (v == null || this.xs[i] == null) return;
                layer.appendChild(this.svgNode('circle', {
                    cx: this.xOf(i), cy: axis.yOf(v), r: 3.6, fill: s.color, class: 'holi-chart-point',
                    'data-point-index': i, 'data-series': s.key
                }));
            });
            return;
        }
        this.runs(s).forEach((run) => {
            const top = run.map((i) => `${this.xOf(i)} ${axis.yOf(spans[i].to)}`);
            if (s.type === 'area') {
                const back = run.slice().reverse().map((i) => `${this.xOf(i)} ${axis.yOf(spans[i].from)}`);
                const area = this.svgNode('path', { d: `M ${top.join(' L ')} L ${back.join(' L ')} Z`, class: 'holi-chart-area' });
                area.style.fill = s.color;   // a style property, not an attribute: the stylesheet's own fill would win over an attribute
                layer.appendChild(area);
            }
            const line = this.svgNode('path', { d: `M ${top.join(' L ')}`, class: 'holi-chart-line' });
            line.style.stroke = s.color;
            layer.appendChild(line);
            if (run.length <= 80) {
                run.forEach((i) => layer.appendChild(this.svgNode('circle', {
                    cx: this.xOf(i), cy: axis.yOf(spans[i].to), r: 2.6, fill: s.color, class: 'holi-chart-dot',
                    'data-point-index': i, 'data-series': s.key
                })));
            }
        });
    }

    drawBars(layer, bars) {
        if (!bars.length) return;
        const stacked = this.props.stacked;
        const group = this.band * 0.8;
        const each = stacked ? group : group / bars.length;
        bars.forEach((s, k) => {
            const axis = this.axes[s.axis];
            this.spans[s.key].forEach((span, i) => {
                if (!span) return;
                const y1 = axis.yOf(span.from);
                const y2 = axis.yOf(span.to);
                layer.appendChild(this.svgNode('rect', {
                    x: this.plot.x + (this.band * i) + ((this.band - group) / 2) + (stacked ? 0 : each * k),
                    y: Math.min(y1, y2),
                    width: Math.max(1, each - (each > 6 && !stacked ? 1 : 0)),
                    height: Math.max(1, Math.abs(y2 - y1)),
                    rx: 1.5,
                    fill: s.color,
                    class: 'holi-chart-bar',
                    'data-point-index': i,
                    'data-series': s.key
                }));
            });
        });
    }

    pieSlices() {
        const series = this.series[0];
        const colors = this.palette();
        return this.rows.map((row, i) => ({
            index: i,
            key: `c${i}`,
            label: this.categories[i],
            value: this.values[series.key][i],
            color: colors[i % colors.length]
        })).filter((slice) => slice.value != null && slice.value > 0);
    }

    drawPie(width, height) {
        const slices = this.pieSlices().filter((s) => !this.hidden.has(s.key));
        const total = slices.reduce((sum, s) => sum + s.value, 0);
        if (total <= 0) return;
        const cx = width / 2;
        const cy = height / 2;
        const r = Math.max(20, Math.min(width, height) / 2 - 8);
        this.pie = { cx, cy, r, total, slices };
        let start = -Math.PI / 2;
        slices.forEach((slice) => {
            const angle = (slice.value / total) * Math.PI * 2;
            const attrs = { fill: slice.color, class: 'holi-chart-slice', 'data-point-index': slice.index };
            if (slices.length === 1) {
                this.svgEl.appendChild(this.svgNode('circle', { cx, cy, r, ...attrs }));
            } else {
                this.svgEl.appendChild(this.svgNode('path', { d: ChartComponent.arc(cx, cy, r, start, start + angle), ...attrs }));
            }
            start += angle;
        });
        if (this.props.type === 'doughnut') {
            this.svgEl.appendChild(this.svgNode('circle', { cx, cy, r: r * 0.52, class: 'holi-chart-hole' }));
        }
    }

    static arc(cx, cy, r, a0, a1) {
        const large = a1 - a0 > Math.PI ? 1 : 0;
        return `M ${cx} ${cy} L ${cx + (r * Math.cos(a0))} ${cy + (r * Math.sin(a0))} A ${r} ${r} 0 ${large} 1 ${cx + (r * Math.cos(a1))} ${cy + (r * Math.sin(a1))} Z`;
    }

    drawLegend() {
        const pie = this.isPie();
        const items = pie
            ? this.pieSlices().map((s) => ({ key: s.key, label: `${s.label} (${ChartComponent.formatFull(s.value)})`, color: s.color }))
            : this.series.map((s) => ({ key: s.key, label: s.axis === 'right' ? `${s.label} (right axis)` : s.label, color: s.color }));
        // One entry is not a legend; the title or the axis already says what it is. (A pie lists its slices, one series or not.)
        this.legendEl.hidden = !this.props.showLegend || (!pie && items.length < 2) || !items.length;
        if (this.legendEl.hidden) return;
        this.renderList(this.legendEl, 'chart-legend-item-template', items);
        this.legendEl.querySelectorAll('[data-action="toggle-series"]').forEach((button, index) => {
            const item = items[index];
            button.querySelector('[data-role="swatch"]').style.backgroundColor = item.color;
            button.setAttribute('aria-pressed', String(!this.hidden.has(item.key)));
            button.classList.toggle('is-hidden', this.hidden.has(item.key));
        });
    }

    toggleSeries(_event, trigger) {
        const key = trigger.getAttribute('data-series');
        const total = this.isPie() ? this.pieSlices().length : this.series.length;
        if (this.hidden.has(key)) this.hidden.delete(key);
        else if (this.hidden.size < total - 1) this.hidden.add(key);   // one always stays visible
        this.draw();
    }

    // ---- interaction ----------------------------------------------------------------------------------

    localPoint(event) {
        const box = this.svgEl.getBoundingClientRect();
        return { x: event.clientX - box.left, y: event.clientY - box.top };
    }

    pointerMove(event) {
        if (this.svgEl.hidden || (!this.plot && !this.pie)) return;
        const p = this.localPoint(event);
        if (this.isPie()) {
            const target = event.target?.closest?.('[data-point-index]');
            if (!target || !this.pie) {
                this.clearHover();
                return;
            }
            const slice = this.pie.slices.find((s) => s.index === Number(target.getAttribute('data-point-index')));
            if (!slice) {
                this.clearHover();
                return;
            }
            this.hover = { index: slice.index };
            const share = Math.round((slice.value / this.pie.total) * 1000) / 10;
            this.showTooltip(slice.label, [{ label: this.series[0].label, value: `${ChartComponent.formatFull(slice.value)} (${share}%)`, color: slice.color }], p.x);
            return;
        }
        const plot = this.plot;
        if (p.x < plot.x || p.x > plot.x + plot.w || p.y < plot.y || p.y > plot.y + plot.h) {
            this.clearHover();
            return;
        }
        if (this.linear) this.hoverPoint(p);
        else this.hoverBand(p);
    }

    hoverBand(p) {
        const i = Math.min(this.rows.length - 1, Math.max(0, Math.floor((p.x - this.plot.x) / this.band)));
        this.hover = { index: i };
        this.hoverEl.setAttribute('x', String(this.plot.x + (this.band * i)));
        this.hoverEl.setAttribute('width', String(this.band));
        this.hoverEl.setAttribute('visibility', 'visible');
        const rows = this.visibleSeries().filter((s) => this.values[s.key][i] != null)
            .map((s) => ({ label: s.label, value: ChartComponent.formatFull(this.values[s.key][i]), color: s.color }));
        this.showTooltip(this.categories[i], rows, p.x);
    }

    hoverPoint(p) {
        let best = null;
        this.visibleSeries().forEach((s) => this.values[s.key].forEach((v, i) => {
            if (v == null || this.xs[i] == null) return;
            const d = Math.hypot(this.xOf(i) - p.x, this.axes[s.axis].yOf(v) - p.y);
            if (d <= HIT_RADIUS && (!best || d < best.d)) best = { d, s, i, v };
        }));
        if (!best) {
            this.clearHover();
            return;
        }
        this.hover = { index: best.i, key: best.s.key };
        this.ringEl.setAttribute('cx', String(this.xOf(best.i)));
        this.ringEl.setAttribute('cy', String(this.axes[best.s.axis].yOf(best.v)));
        this.ringEl.setAttribute('visibility', 'visible');
        this.showTooltip(`${this.xKey}: ${ChartComponent.formatFull(this.xs[best.i])}`,
            [{ label: best.s.label, value: ChartComponent.formatFull(best.v), color: best.s.color }], p.x);
    }

    clearHover() {
        this.hover = null;
        if (this.tooltipEl) this.tooltipEl.hidden = true;
        this.hoverEl?.setAttribute('visibility', 'hidden');
        this.ringEl?.setAttribute('visibility', 'hidden');
    }

    showTooltip(head, rows, x) {
        this.tooltipHeadEl.textContent = head;
        this.renderList(this.tooltipRowsEl, 'chart-tooltip-row-template', rows.map((r) => ({ label: r.label, value: r.value })));
        this.tooltipRowsEl.querySelectorAll('[data-role="swatch"]').forEach((swatch, i) => { swatch.style.backgroundColor = rows[i].color; });
        this.tooltipEl.hidden = false;
        const room = this.plotEl.clientWidth - this.tooltipEl.offsetWidth - 4;
        this.tooltipEl.style.left = `${Math.max(0, Math.min(room, x + 12))}px`;
    }

    pointClicked(event) {
        const target = event.target?.closest?.('[data-point-index]');
        const index = target ? Number(target.getAttribute('data-point-index')) : this.hover?.index;
        if (index == null || !Number.isFinite(index) || index < 0 || index >= this.rows.length) return;
        const key = target?.getAttribute('data-series') ?? this.hover?.key ?? null;
        this.dispatchEvent('chartpointselect', { index, item: this.data[index], type: this.props.type, series: key });
    }

    destroy() {
        this.resizeObserver?.disconnect();
        this.plotEl?.removeEventListener('pointermove', this.onPointerMove);
        this.plotEl?.removeEventListener('pointerleave', this.onPointerLeave);
        this.svgEl?.removeEventListener('click', this.onClick);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.ChartComponent = ChartComponent;
}

export { ChartComponent };
