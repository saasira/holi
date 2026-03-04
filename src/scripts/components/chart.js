import { Component } from './component.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

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

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = ChartComponent.templateId;

        this.type = this.resolveType(options.type || this.readAttr('type', 'line'));
        this.height = this.parseNumber(options.height, this.readAttr('height', '220'), 220);
        this.showLegend = this.parseBoolean(options.showLegend, this.readAttr('show-legend', 'true'), true);
        this.title = String(options.title || this.readAttr('title', '')).trim();
        this.colors = this.resolveColors(options.colors || this.readAttr('colors', ''));
        this.data = this.resolveData(options.data);

        this.element = null;
        this.svgEl = null;
        this.legendEl = null;
        this.emptyEl = null;
        this.boundClick = (event) => this.handlePointClick(event);

        this.init();
    }

    readAttr(name, fallback = '') {
        const direct = this.container.getAttribute(name);
        if (direct != null) return direct;
        return this.container.getAttribute(`data-${name}`) ?? fallback;
    }

    parseNumber(...values) {
        const fallback = values[values.length - 1];
        for (let i = 0; i < values.length - 1; i += 1) {
            const value = values[i];
            if (value == null || value === '') continue;
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return fallback;
    }

    parseBoolean(...values) {
        const fallback = values[values.length - 1];
        for (let i = 0; i < values.length - 1; i += 1) {
            const value = values[i];
            if (value == null || value === '') continue;
            if (typeof value === 'boolean') return value;
            const normalized = String(value).trim().toLowerCase();
            if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
            if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
        }
        return fallback;
    }

    resolveType(type) {
        const next = String(type || 'line').trim().toLowerCase();
        const allowed = new Set(['line', 'bar', 'area', 'pie', 'doughnut']);
        return allowed.has(next) ? next : 'line';
    }

    resolveColors(colors) {
        if (Array.isArray(colors)) {
            return colors.map((color) => String(color).trim()).filter(Boolean);
        }
        const value = String(colors || '').trim();
        if (!value) {
            return ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#7c3aed', '#14b8a6', '#f97316'];
        }
        if (value.startsWith('[')) {
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) {
                    return parsed.map((color) => String(color).trim()).filter(Boolean);
                }
            } catch (_error) {}
        }
        return value.split(',').map((color) => color.trim()).filter(Boolean);
    }

    resolveData(inputData) {
        if (Array.isArray(inputData)) return this.normalizeData(inputData);

        const dataAttr = this.readAttr('data', this.readAttr('series', ''));
        if (dataAttr) {
            try {
                const parsed = JSON.parse(dataAttr);
                if (Array.isArray(parsed)) return this.normalizeData(parsed);
            } catch (_error) {}
        }

        const children = Array.from(this.container.querySelectorAll('[data-point], [data-value], li'));
        if (children.length) {
            const series = children.map((node, index) => ({
                label: node.getAttribute('data-label') || node.getAttribute('label') || node.textContent?.trim() || `Item ${index + 1}`,
                value: this.parseNumber(node.getAttribute('data-point'), node.getAttribute('data-value'), node.getAttribute('value'), 0)
            }));
            return this.normalizeData(series);
        }

        return [];
    }

    normalizeData(series) {
        return (Array.isArray(series) ? series : []).map((item, index) => {
            const label = item?.label ?? item?.name ?? item?.x ?? `Item ${index + 1}`;
            const value = this.parseNumber(item?.value, item?.y, item?.amount, 0);
            return {
                label: String(label),
                value: Math.max(0, Number(value) || 0)
            };
        });
    }

    async init() {
        this.validateStructure();
        await this.render();
        this.bindEvents();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-chart');
        this.svgEl = this.container.querySelector('[data-role="svg"]');
        this.legendEl = this.container.querySelector('[data-role="legend"]');
        this.emptyEl = this.container.querySelector('[data-role="empty"]');
        this.titleEl = this.container.querySelector('[data-role="title"]');

        if (!this.element || !this.svgEl || !this.legendEl || !this.emptyEl || !this.titleEl) {
            throw new Error('Chart template is missing required nodes');
        }

        this.element.style.setProperty('--chart-height', `${Math.max(120, this.height)}px`);
        this.titleEl.textContent = this.title;
        this.titleEl.hidden = !this.title;

        this.draw();
    }

    bindEvents() {
        this.svgEl?.addEventListener('click', this.boundClick);
    }

    handlePointClick(event) {
        const target = event.target?.closest?.('[data-point-index]');
        if (!target) return;
        const index = Number(target.getAttribute('data-point-index'));
        if (!Number.isFinite(index) || index < 0 || index >= this.data.length) return;
        this.dispatchEvent('chartpointselect', { index, item: this.data[index], type: this.type });
    }

    draw() {
        if (!this.svgEl || !this.legendEl || !this.emptyEl) return;
        this.svgEl.replaceChildren();
        this.legendEl.replaceChildren();

        const series = this.normalizeData(this.data);
        this.data = series;
        const hasData = series.length > 0 && series.some((item) => item.value > 0);

        this.emptyEl.hidden = hasData;
        this.svgEl.hidden = !hasData;
        this.legendEl.hidden = !hasData || !this.showLegend;
        if (!hasData) return;

        this.svgEl.setAttribute('viewBox', '0 0 100 100');
        this.svgEl.setAttribute('aria-label', `Chart (${this.type})`);
        this.svgEl.setAttribute('preserveAspectRatio', this.type === 'pie' || this.type === 'doughnut'
            ? 'xMidYMid meet'
            : 'none');

        if (this.type === 'bar') {
            this.drawBars(series);
        } else if (this.type === 'pie' || this.type === 'doughnut') {
            this.drawPie(series, this.type === 'doughnut');
        } else {
            this.drawLine(series, this.type === 'area');
        }

        if (this.showLegend) this.drawLegend(series);
    }

    drawLine(series, fillArea = false) {
        const points = this.calculateCartesianPoints(series);
        const gridGroup = this.createSvgNode('g', { class: 'holi-chart-grid' });

        for (let i = 0; i <= 4; i += 1) {
            const y = 10 + (i * 20);
            gridGroup.appendChild(this.createSvgNode('line', {
                x1: 8,
                y1: y,
                x2: 96,
                y2: y
            }));
        }
        this.svgEl.appendChild(gridGroup);

        if (fillArea) {
            const first = points[0];
            const last = points[points.length - 1];
            const areaPath = [
                `M ${first.x} 90`,
                ...points.map((point, index) => `${index === 0 ? 'L' : 'L'} ${point.x} ${point.y}`),
                `L ${last.x} 90 Z`
            ].join(' ');
            this.svgEl.appendChild(this.createSvgNode('path', {
                d: areaPath,
                class: 'holi-chart-area'
            }));
        }

        const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
        this.svgEl.appendChild(this.createSvgNode('path', {
            d,
            class: 'holi-chart-line',
            stroke: this.resolveColor(0)
        }));

        points.forEach((point) => {
            const marker = this.createSvgNode('circle', {
                cx: point.x,
                cy: point.y,
                r: 2.2,
                class: 'holi-chart-dot',
                fill: this.resolveColor(point.index),
                'data-point-index': point.index
            });
            this.svgEl.appendChild(marker);
        });
    }

    drawBars(series) {
        const maxValue = Math.max(...series.map((item) => item.value), 1);
        const usableWidth = 88;
        const startX = 8;
        const gap = 2;
        const barWidth = Math.max(4, (usableWidth - (gap * (series.length - 1))) / series.length);

        series.forEach((item, index) => {
            const height = (item.value / maxValue) * 72;
            const x = startX + (index * (barWidth + gap));
            const y = 90 - height;
            this.svgEl.appendChild(this.createSvgNode('rect', {
                x,
                y,
                width: barWidth,
                height,
                rx: 1.5,
                fill: this.resolveColor(index),
                class: 'holi-chart-bar',
                'data-point-index': index
            }));
        });
    }

    drawPie(series, isDoughnut) {
        const total = series.reduce((sum, item) => sum + item.value, 0);
        if (total <= 0) return;

        let startAngle = -Math.PI / 2;
        series.forEach((item, index) => {
            const angle = (item.value / total) * Math.PI * 2;
            const endAngle = startAngle + angle;

            const path = this.describeArc(50, 50, 36, startAngle, endAngle);
            this.svgEl.appendChild(this.createSvgNode('path', {
                d: path,
                fill: this.resolveColor(index),
                class: 'holi-chart-slice',
                'data-point-index': index
            }));
            startAngle = endAngle;
        });

        if (isDoughnut) {
            this.svgEl.appendChild(this.createSvgNode('circle', {
                cx: 50,
                cy: 50,
                r: 19,
                class: 'holi-chart-hole'
            }));
        }
    }

    calculateCartesianPoints(series) {
        const maxValue = Math.max(...series.map((item) => item.value), 1);
        const minX = 10;
        const maxX = 94;
        const minY = 14;
        const maxY = 90;
        const step = series.length > 1 ? (maxX - minX) / (series.length - 1) : 0;

        return series.map((item, index) => {
            const x = minX + (index * step);
            const ratio = item.value / maxValue;
            const y = maxY - ((maxY - minY) * ratio);
            return { x, y, index };
        });
    }

    describeArc(cx, cy, r, startAngle, endAngle) {
        const sx = cx + (r * Math.cos(startAngle));
        const sy = cy + (r * Math.sin(startAngle));
        const ex = cx + (r * Math.cos(endAngle));
        const ey = cy + (r * Math.sin(endAngle));
        const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
        return `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${largeArcFlag} 1 ${ex} ${ey} Z`;
    }

    drawLegend(series) {
        series.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'holi-chart-legend-item';
            li.setAttribute('data-point-index', String(index));

            const swatch = document.createElement('span');
            swatch.className = 'holi-chart-legend-swatch';
            swatch.style.backgroundColor = this.resolveColor(index);

            const label = document.createElement('span');
            label.className = 'holi-chart-legend-label';
            label.textContent = `${item.label} (${item.value})`;

            li.append(swatch, label);
            this.legendEl.appendChild(li);
        });
    }

    createSvgNode(tag, attrs = {}) {
        const node = document.createElementNS(SVG_NS, tag);
        Object.entries(attrs).forEach(([name, value]) => {
            if (value == null) return;
            node.setAttribute(name, String(value));
        });
        return node;
    }

    resolveColor(index) {
        if (!this.colors.length) return '#2563eb';
        return this.colors[index % this.colors.length];
    }

    setType(nextType) {
        this.type = this.resolveType(nextType);
        this.draw();
    }

    update(data = [], options = {}) {
        if (options.type) this.type = this.resolveType(options.type);
        if (options.height != null) {
            this.height = this.parseNumber(options.height, this.height);
            this.element?.style.setProperty('--chart-height', `${Math.max(120, this.height)}px`);
        }
        if (options.colors) this.colors = this.resolveColors(options.colors);
        if (options.title != null) {
            this.title = String(options.title || '').trim();
            if (this.titleEl) {
                this.titleEl.textContent = this.title;
                this.titleEl.hidden = !this.title;
            }
        }
        if (options.showLegend != null) {
            this.showLegend = this.parseBoolean(options.showLegend, this.showLegend);
        }
        this.data = this.normalizeData(data);
        this.draw();
        this.dispatchEvent('chartupdate', {
            type: this.type,
            count: this.data.length
        });
    }

    destroy() {
        this.svgEl?.removeEventListener('click', this.boundClick);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.ChartComponent = ChartComponent;
}

export { ChartComponent };
