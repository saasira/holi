import { Component } from './component.js';

const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
const UNIT_NAMES = { s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week' };

const DEFAULT_PRESETS = [
    { label: 'Last 5 minutes', value: 'now-5m' },
    { label: 'Last 15 minutes', value: 'now-15m' },
    { label: 'Last 1 hour', value: 'now-1h' },
    { label: 'Last 4 hours', value: 'now-4h' },
    { label: 'Last 24 hours', value: 'now-24h' },
    { label: 'Last 7 days', value: 'now-7d' },
    { label: 'Last 30 days', value: 'now-30d' }
];

const DEFAULT_REFRESH = [
    { label: 'Off', value: 'off' },
    { label: '5s', value: '5s' },
    { label: '10s', value: '10s' },
    { label: '30s', value: '30s' },
    { label: '1m', value: '1m' },
    { label: '5m', value: '5m' }
];

/**
 * A time-range picker: quick relative ranges ("Last 15 minutes"), an absolute from/to, and an optional auto-refresh.
 *
 * A RELATIVE range is re-resolved whenever it is read, so "now-15m" always ends now; an ABSOLUTE one is fixed. Either
 * way the component answers instants: `getRange()` gives `{ from, to }` as Dates, and every event carries them as ISO
 * text. `timezone="utc"` shows and edits times in UTC instead of the browser's zone, as log and metrics tools usually
 * want.
 *
 * Events (bubbling, so a page may listen on the host):
 * - `timerangechange` -- the range was changed: `{ from, to, relative, label }`
 * - `timerangerefresh` -- an auto-refresh tick, with the range re-resolved
 */
class TimeRangeComponent extends Component {
    static componentName = 'timerange';
    static templateId = 'timerange-template';

    static get selector() {
        return 'timerange';
    }

    static get library() {
        return 'holi';
    }

    static props = {
        value: { attr: 'value', default: 'now-1h' },
        from: { attr: 'from', default: '' },
        to: { attr: 'to', default: '' },
        presets: { attr: 'presets', type: 'array', default: DEFAULT_PRESETS },
        refreshOptions: { attr: 'refresh-options', type: 'array', default: DEFAULT_REFRESH },
        refresh: { attr: 'refresh', default: 'off' },
        showRefresh: { attr: 'show-refresh', type: 'boolean', default: true },
        timezone: { attr: 'timezone', default: 'local' }
    };

    static events = {
        'click [data-action="toggle"]': 'toggle',
        'click [data-action="preset"]': 'choosePreset',
        'submit [data-role="absolute"]': 'applyAbsolute',
        'change [data-role="refresh"]': 'changeRefresh',
        'keydown': 'handleKeydown'
    };

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = TimeRangeComponent.templateId;
        this.relative = null;
        this.absolute = null;
        this.refreshTimer = null;
        this.boundOutside = (event) => {
            if (this.element && !this.element.contains(event.target)) this.close();
        };
        this.initComponent();
    }

    setup() {
        this.utc = String(this.props.timezone).toLowerCase() === 'utc';
        const from = TimeRangeComponent.parseInstant(this.props.from);
        const to = TimeRangeComponent.parseInstant(this.props.to);
        if (from && to && from < to) {
            this.absolute = { from, to };
        } else {
            this.relative = TimeRangeComponent.parseRelative(this.props.value) != null ? this.props.value : 'now-1h';
        }
    }

    afterRender() {
        this.element = this.container.querySelector('.holi-timerange');
        this.triggerEl = this.element.querySelector('[data-action="toggle"]');
        this.labelEl = this.element.querySelector('[data-role="label"]');
        this.panelEl = this.element.querySelector('[data-role="panel"]');
        this.fromEl = this.element.querySelector('[data-role="from"]');
        this.toEl = this.element.querySelector('[data-role="to"]');
        this.errorEl = this.element.querySelector('[data-role="error"]');
        this.refreshEl = this.element.querySelector('[data-role="refresh"]');
        this.element.querySelector('[data-role="zone"]').textContent = this.utc ? '(UTC)' : '(local time)';

        this.renderList(this.element.querySelector('[data-role="presets"]'), 'timerange-preset-template',
            this.props.presets);
        this.renderList(this.refreshEl, 'timerange-refresh-option-template', this.props.refreshOptions);
        this.element.querySelector('[data-role="refresh-wrap"]').hidden = !this.props.showRefresh;
        this.refreshEl.value = this.props.refresh;
        this.updateLabel();
        this.startRefresh(this.props.refresh);
    }

    // ---- the model ------------------------------------------------------------------------------------

    /** Milliseconds a relative expression reaches back ("now-15m" -> 900000), or null for anything else. */
    static parseRelative(expression) {
        const match = /^now-(\d+)([smhdw])$/.exec(String(expression || '').trim());
        return match ? Number(match[1]) * UNIT_MS[match[2]] : null;
    }

    /** An instant from ISO text or epoch milliseconds; null when it is neither. */
    static parseInstant(value) {
        if (value == null || value === '') return null;
        const date = value instanceof Date ? value : new Date(/^\d+$/.test(String(value)) ? Number(value) : value);
        return Number.isFinite(date.getTime()) ? date : null;
    }

    /** The range as instants: a relative one resolved against now. */
    getRange() {
        if (this.absolute) {
            return { from: this.absolute.from, to: this.absolute.to, relative: null, label: this.describe() };
        }
        const to = new Date();
        const from = new Date(to.getTime() - TimeRangeComponent.parseRelative(this.relative));
        return { from, to, relative: this.relative, label: this.describe() };
    }

    describe() {
        if (this.absolute) {
            return `${this.formatInstant(this.absolute.from)} → ${this.formatInstant(this.absolute.to)}`;
        }
        const preset = (this.props.presets || []).find((p) => p.value === this.relative);
        if (preset) return preset.label;
        const [, amount, unit] = /^now-(\d+)([smhdw])$/.exec(this.relative);
        return `Last ${amount} ${UNIT_NAMES[unit]}${amount === '1' ? '' : 's'}`;
    }

    formatInstant(date) {
        const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false };
        if (this.utc) options.timeZone = 'UTC';
        return new Intl.DateTimeFormat(undefined, options).format(date) + (this.utc ? ' UTC' : '');
    }

    /** A Date as a datetime-local input's value, in the component's zone. */
    toInputValue(date) {
        const shifted = this.utc ? date : new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return shifted.toISOString().slice(0, 19);
    }

    /** A datetime-local input's value as a Date, read in the component's zone; null when empty or invalid. */
    fromInputValue(text) {
        if (!text) return null;
        const date = new Date(this.utc ? `${text}Z` : text);
        return Number.isFinite(date.getTime()) ? date : null;
    }

    // ---- changing it ----------------------------------------------------------------------------------

    /** Sets a relative range, e.g. "now-15m". */
    setRelative(expression, notify = true) {
        if (TimeRangeComponent.parseRelative(expression) == null) {
            throw new Error(`timerange: not a relative range: ${expression}`);
        }
        this.relative = expression;
        this.absolute = null;
        this.container.setAttribute('value', expression);
        this.container.removeAttribute('from');
        this.container.removeAttribute('to');
        this.changed(notify);
    }

    /** Sets an absolute range; from and to are Dates, ISO text or epoch milliseconds. */
    setAbsolute(from, to, notify = true) {
        const start = TimeRangeComponent.parseInstant(from);
        const end = TimeRangeComponent.parseInstant(to);
        if (!start || !end || start >= end) throw new Error('timerange: from must be an instant before to');
        this.absolute = { from: start, to: end };
        this.relative = null;
        this.container.setAttribute('from', start.toISOString());
        this.container.setAttribute('to', end.toISOString());
        this.changed(notify);
    }

    changed(notify) {
        this.updateLabel();
        this.close();
        if (notify) this.emit('timerangechange');
    }

    updateLabel() {
        if (!this.labelEl) return;
        this.labelEl.textContent = this.describe();
        this.element.querySelectorAll('[data-action="preset"]').forEach((button) => {
            button.classList.toggle('is-active', !this.absolute && button.getAttribute('data-value') === this.relative);
        });
    }

    emit(name) {
        const range = this.getRange();
        this.element?.dispatchEvent(new CustomEvent(name, {
            bubbles: true,
            detail: { from: range.from.toISOString(), to: range.to.toISOString(), relative: range.relative,
                label: range.label }
        }));
    }

    // ---- the panel ------------------------------------------------------------------------------------

    toggle() {
        if (this.panelEl.hidden) this.open();
        else this.close();
    }

    open() {
        const range = this.getRange();
        this.fromEl.value = this.toInputValue(range.from);
        this.toEl.value = this.toInputValue(range.to);
        this.errorEl.hidden = true;
        this.panelEl.hidden = false;
        this.triggerEl.setAttribute('aria-expanded', 'true');
        document.addEventListener('mousedown', this.boundOutside);
    }

    close() {
        if (!this.panelEl || this.panelEl.hidden) return;
        this.panelEl.hidden = true;
        this.triggerEl.setAttribute('aria-expanded', 'false');
        document.removeEventListener('mousedown', this.boundOutside);
    }

    choosePreset(_event, trigger) {
        this.setRelative(trigger.getAttribute('data-value'));
    }

    applyAbsolute(event) {
        event.preventDefault();
        const from = this.fromInputValue(this.fromEl.value);
        const to = this.fromInputValue(this.toEl.value);
        if (!from || !to || from >= to) {
            this.errorEl.textContent = 'From must be before To.';
            this.errorEl.hidden = false;
            return;
        }
        this.setAbsolute(from, to);
    }

    handleKeydown(event) {
        if (event.key === 'Escape' && !this.panelEl.hidden) {
            this.close();
            this.triggerEl.focus();
        }
    }

    // ---- auto-refresh ---------------------------------------------------------------------------------

    changeRefresh() {
        this.setRefresh(this.refreshEl.value);
    }

    /** Sets the auto-refresh interval ("off", "10s", "1m", ...). */
    setRefresh(value) {
        this.props.refresh = value;
        if (this.refreshEl && this.refreshEl.value !== value) this.refreshEl.value = value;
        this.container.setAttribute('refresh', value);
        this.startRefresh(value);
    }

    startRefresh(value) {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = null;
        const match = /^(\d+)([smh])$/.exec(String(value || ''));
        if (!match) return;
        const every = Number(match[1]) * UNIT_MS[match[2]];
        this.refreshTimer = setInterval(() => this.emit('timerangerefresh'), every);
    }

    destroy() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        document.removeEventListener('mousedown', this.boundOutside);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.TimeRangeComponent = TimeRangeComponent;
}

export { TimeRangeComponent };
