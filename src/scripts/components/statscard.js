import { Component } from './component.js';
import { attachComponentStateBinding } from '../utils/component_state_binding.js';

class StatsCard extends Component {
    static get selector() { return '[data-stats], .stats-card'; }
    static get library() { return 'holi'; }
    static get componentName() { return 'statscard'; }
    static templateId = 'statscard';

    constructor(container, config = {}) {
        super(container, config);
        this.templateId = StatsCard.templateId;

        this.value = this.parseNumber(config.value, container.dataset.value, 0);
        this.label = config.label || container.dataset.label || 'Metric';
        this.trend = this.normalizeTrend(config.trend || container.dataset.trend || 'neutral');
        this.change = this.parseNumber(config.change, container.dataset.change, 0);
        this.unit = config.unit || container.dataset.unit || '';
        this.animate = this.parseBoolean(config.animate, container.dataset.animate, true);
        this.duration = this.parseNumber(config.duration, container.dataset.duration, 1200);
        this.icon = config.icon || container.dataset.icon || this.getDefaultIcon(this.label);
        this.isAnimating = false;

        this.valueEl = null;
        this.labelEl = null;
        this.changeEl = null;
        this.trendEl = null;
        this.iconEl = null;
        this.sparklineEl = null;
        this.frameId = null;

        if (typeof this.container.statsCard === 'undefined') {
            Object.defineProperty(this.container, 'statsCard', {
                value: this,
                writable: false
            });
        }

        this.onMouseEnter = () => {
            this.sparklineEl?.classList.add('spark-active');
        };
        this.onMouseLeave = () => {
            this.sparklineEl?.classList.remove('spark-active');
        };

        this.init();
    }

    parseNumber(...values) {
        const fallback = values[values.length - 1];
        for (let i = 0; i < values.length - 1; i += 1) {
            const value = values[i];
            if (value === undefined || value === null || value === '') continue;
            const parsed = Number(value);
            if (!Number.isNaN(parsed)) return parsed;
        }
        return fallback;
    }

    parseBoolean(...values) {
        const fallback = values[values.length - 1];
        for (let i = 0; i < values.length - 1; i += 1) {
            const value = values[i];
            if (value === undefined || value === null || value === '') continue;
            const normalized = String(value).toLowerCase();
            if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
            if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
        }
        return fallback;
    }

    normalizeTrend(input) {
        const value = String(input || 'neutral').toLowerCase();
        return ['up', 'down', 'neutral'].includes(value) ? value : 'neutral';
    }

    getDefaultIcon(label) {
        const map = {
            revenue: '$',
            users: 'U',
            orders: 'O',
            conversion: 'C',
            sales: 'S'
        };
        return map[String(label || '').toLowerCase()] || 'M';
    }

    validateStructure() {
        super.validateStructure();
        if (this.duration < 0) {
            throw new Error('StatsCard duration must be >= 0');
        }
    }

    async init() {
        this.validateStructure();
        await this.render();
        this.bindEvents();
        this.update({
            value: this.value,
            change: this.change,
            trend: this.trend,
            label: this.label,
            unit: this.unit,
            icon: this.icon
        }, { animate: this.animate });
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.stats-card-view');
        this.valueEl = this.element?.querySelector('.stats-value');
        this.labelEl = this.element?.querySelector('.stats-label');
        this.changeEl = this.element?.querySelector('.change-value');
        this.trendEl = this.element?.querySelector('.change-trend');
        this.iconEl = this.element?.querySelector('.stats-icon');
        this.sparklineEl = this.element?.querySelector('.stats-sparkline');

        if (!this.element || !this.valueEl || !this.labelEl || !this.changeEl || !this.trendEl || !this.iconEl) {
            throw new Error('StatsCard template is missing required nodes');
        }

        this.stateBinding = attachComponentStateBinding(this, {
            defaultPath: 'statscard',
            eventName: 'statsupdate',
            getSnapshot: (component) => component.getBindableState(),
            applySnapshot: (component, snapshot) => component.applyBindableState(snapshot)
        });
    }

    bindEvents() {
        this.container.addEventListener('mouseenter', this.onMouseEnter);
        this.container.addEventListener('mouseleave', this.onMouseLeave);
    }

    applyStaticFields() {
        this.iconEl.textContent = this.icon;
        this.labelEl.textContent = this.label;
        this.changeEl.textContent = `${this.change > 0 ? '+' : ''}${this.change.toFixed(1)}%`;
        this.trendEl.textContent = this.getTrendGlyph(this.trend);

        this.element.classList.remove('trend-up', 'trend-down', 'trend-neutral');
        this.element.classList.add(`trend-${this.trend}`);
    }

    getTrendGlyph(trend) {
        if (trend === 'up') return '^';
        if (trend === 'down') return 'v';
        return '-';
    }

    formatValue(value) {
        if (this.unit === '$') return `$${Number(value).toLocaleString()}`;
        if (this.unit === '%') return `${Number(value).toFixed(1)}%`;
        return Number(value).toLocaleString();
    }

    renderValue(value) {
        this.valueEl.textContent = this.formatValue(value);
    }

    animateValue(from, to) {
        if (!this.animate || this.duration === 0) {
            this.renderValue(to);
            this.isAnimating = false;
            return;
        }

        if (this.frameId) cancelAnimationFrame(this.frameId);
        this.isAnimating = true;
        let start = null;
        const distance = to - from;

        const step = (ts) => {
            if (start == null) start = ts;
            const progress = Math.min((ts - start) / this.duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            this.renderValue(from + (distance * eased));

            if (progress < 1) {
                this.frameId = requestAnimationFrame(step);
            } else {
                this.frameId = null;
                this.isAnimating = false;
            }
        };

        this.frameId = requestAnimationFrame(step);
    }

    update(data = {}, options = {}) {
        const prev = this.value;
        if (data.label !== undefined) this.label = data.label;
        if (data.unit !== undefined) this.unit = data.unit;
        if (data.icon !== undefined) this.icon = data.icon;
        if (data.value !== undefined) this.value = this.parseNumber(data.value, this.value);
        if (data.change !== undefined) this.change = this.parseNumber(data.change, this.change);
        if (data.trend !== undefined) this.trend = this.normalizeTrend(data.trend);

        this.applyStaticFields();
        this.animateValue(prev, this.value);
        this.dispatchEvent('statsupdate', {
            value: this.value,
            change: this.change,
            trend: this.trend,
            label: this.label
        });
    }

    getBindableState() {
        return {
            value: this.value,
            change: this.change,
            trend: this.trend,
            label: this.label,
            unit: this.unit,
            icon: this.icon
        };
    }

    applyBindableState(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return;
        this.update(snapshot, { animate: false });
    }

    destroy() {
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
        this.stateBinding?.disconnect?.();
        this.container.removeEventListener('mouseenter', this.onMouseEnter);
        this.container.removeEventListener('mouseleave', this.onMouseLeave);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.StatsCard = StatsCard;
}

export { StatsCard };
