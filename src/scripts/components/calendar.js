import { Component } from './component.js';

const RTL_LANGS = ['ar', 'fa', 'he', 'ur'];
const VALIDATOR_REGISTRY = new Map();

function isRTL(locale, dir) {
    if (dir === 'rtl') return true;
    if (dir === 'ltr') return false;
    return RTL_LANGS.some((lang) => String(locale || '').startsWith(lang));
}

function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

class CalendarComponent extends Component {
    static get selector() {
        return 'calendar';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'calendar';
    }

    static templateId = 'calendar-template';

    static registerValidator(validator) {
        if (!validator || !validator.name || typeof validator.validate !== 'function') {
            throw new Error('Invalid calendar validator');
        }
        VALIDATOR_REGISTRY.set(validator.name, validator);
    }

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = CalendarComponent.templateId;

        this.locale = this.readAttr('locale', navigator.language || 'en-US');
        this.dir = this.readAttr('dir', 'auto');
        this.rtl = isRTL(this.locale, this.dir);
        this.tz = this.readAttr('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);

        this.today = new Date();
        this.year = this.today.getFullYear();
        this.month = this.today.getMonth() + 1;
        this.day = null;
        this.hour = 0;
        this.minute = 0;
        this.step = Math.max(1, Number(this.readAttr('step', '5')) || 5);
        this.hour12 = this.readBoolean('hour12', false);

        this.validatorNames = this.parseList(this.readAttr('validators', ''));
        this.validators = this.validatorNames
            .map((name) => VALIDATOR_REGISTRY.get(name))
            .filter(Boolean);

        this.onPrev = () => this.changeMonth(-1);
        this.onNext = () => this.changeMonth(1);
        this.onDayClick = (event) => this.handleDayClick(event);
        this.onToggleAmPm = () => {
            this.hour = (this.hour + 12) % 24;
            this.renderTime();
        };
        this.onTouchStart = (event) => this.handleSwipe(event);

        this.init();
    }

    readAttr(name, fallback = '') {
        const direct = this.container.getAttribute(name);
        if (direct != null && String(direct).trim() !== '') return String(direct).trim();
        const fromData = this.container.getAttribute(`data-${name}`);
        if (fromData != null && String(fromData).trim() !== '') return String(fromData).trim();
        return fallback;
    }

    readBoolean(name, fallback) {
        const raw = this.readAttr(name, '');
        if (!raw) return fallback;
        const normalized = raw.toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
        return fallback;
    }

    parseList(raw) {
        if (!raw) return [];
        return String(raw)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }

    resolveInputElement() {
        const byRole = this.container.querySelector('[data-role="calendar-input"]');
        if (byRole instanceof HTMLInputElement) return byRole;
        const bySlot = this.container.querySelector('input[slot="input"]');
        if (bySlot instanceof HTMLInputElement) return bySlot;
        return null;
    }

    async init() {
        this.validateStructure();
        await this.render();
        this.bindEvents();
    }

    async render() {
        await super.render();
        this.input = this.resolveInputElement();
        this.element = this.container.querySelector('.holi-calendar');
        this.prevBtn = this.container.querySelector('[data-action="prev-month"]');
        this.nextBtn = this.container.querySelector('[data-action="next-month"]');
        this.titleEl = this.container.querySelector('[data-role="title"]');
        this.thead = this.container.querySelector('[data-role="thead"]');
        this.tbody = this.container.querySelector('[data-role="tbody"]');
        this.timeBox = this.container.querySelector('[data-role="time"]');
        this.hourInput = this.container.querySelector('[data-role="hour"]');
        this.minuteInput = this.container.querySelector('[data-role="minute"]');
        this.timeToggle = this.container.querySelector('[data-action="toggle-ampm"]');
        this.messages = this.container.querySelector('[data-role="messages"]');
        this.live = this.container.querySelector('[data-role="live"]');

        if (!this.element || !this.thead || !this.tbody || !this.prevBtn || !this.nextBtn || !this.titleEl || !this.messages || !this.live) {
            throw new Error('Calendar template is missing required nodes');
        }

        this.element.dir = this.rtl ? 'rtl' : 'ltr';
        this.renderCalendar();
    }

    bindEvents() {
        this.prevBtn?.addEventListener('click', this.onPrev);
        this.nextBtn?.addEventListener('click', this.onNext);
        this.tbody?.addEventListener('click', this.onDayClick);
        this.timeToggle?.addEventListener('click', this.onToggleAmPm);
        this.element?.addEventListener('touchstart', this.onTouchStart, { passive: true });

        this.hourInput?.addEventListener('input', () => {
            const parsed = Number(this.hourInput.value);
            if (!Number.isFinite(parsed)) return;
            if (this.hour12) {
                const currentPm = this.hour >= 12;
                const normalized = clamp(parsed, 1, 12);
                this.hour = (normalized % 12) + (currentPm ? 12 : 0);
            } else {
                this.hour = clamp(parsed, 0, 23);
            }
            this.renderTime();
        });

        this.minuteInput?.addEventListener('input', () => {
            const parsed = Number(this.minuteInput.value);
            if (!Number.isFinite(parsed)) return;
            const rounded = Math.round(parsed / this.step) * this.step;
            this.minute = clamp(rounded, 0, 59);
            this.renderTime();
        });
    }

    renderCalendar() {
        this.renderHeader();
        this.renderDays();
        this.renderTime();
    }

    renderHeader() {
        const fmt = new Intl.DateTimeFormat(this.locale, { month: 'long', year: 'numeric', timeZone: this.tz });
        this.titleEl.textContent = fmt.format(new Date(this.year, this.month - 1, 1));

        this.thead.replaceChildren();
        const row = document.createElement('tr');
        const weekdayFmt = new Intl.DateTimeFormat(this.locale, { weekday: 'short' });
        let weekdays = [...Array(7).keys()].map((idx) => weekdayFmt.format(new Date(2021, 7, idx + 1)));
        if (this.rtl) weekdays.reverse();

        weekdays.forEach((label) => {
            const th = document.createElement('th');
            th.textContent = label;
            row.appendChild(th);
        });
        this.thead.appendChild(row);
    }

    renderDays() {
        this.tbody.replaceChildren();

        const firstDay = new Date(this.year, this.month - 1, 1).getDay();
        const totalDays = daysInMonth(this.year, this.month);
        const todayYear = this.today.getFullYear();
        const todayMonth = this.today.getMonth() + 1;
        const todayDay = this.today.getDate();
        let dayValue = 1 - firstDay;

        for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
            const tr = document.createElement('tr');
            const rowCells = [];

            for (let colIndex = 0; colIndex < 7; colIndex += 1, dayValue += 1) {
                const td = document.createElement('td');
                td.className = 'holi-calendar-day';

                if (dayValue < 1 || dayValue > totalDays) {
                    td.classList.add('is-outside');
                } else {
                    td.textContent = String(dayValue);
                    td.tabIndex = 0;
                    td.setAttribute('data-day', String(dayValue));
                    if (this.year === todayYear && this.month === todayMonth && dayValue === todayDay) {
                        td.classList.add('is-today');
                    }
                    if (this.day === dayValue) td.classList.add('is-selected');
                    this.applyDateValidation(td, new Date(this.year, this.month - 1, dayValue));
                }
                rowCells.push(td);
            }

            if (this.rtl) rowCells.reverse();
            rowCells.forEach((cell) => tr.appendChild(cell));
            this.tbody.appendChild(tr);
        }
    }

    renderTime() {
        if (!this.timeBox || !this.hourInput || !this.minuteInput || !this.timeToggle) return;
        this.hourInput.step = '1';
        this.minuteInput.step = String(this.step);

        this.hourInput.value = String(this.hour12 ? clamp((this.hour % 12) || 12, 1, 12) : clamp(this.hour, 0, 23));
        this.minuteInput.value = String(clamp(this.minute, 0, 59));

        this.timeToggle.hidden = !this.hour12;
        this.timeToggle.textContent = this.hour >= 12 ? 'PM' : 'AM';
    }

    async runValidators(type, payload) {
        const issues = [];
        for (let i = 0; i < this.validators.length; i += 1) {
            const validator = this.validators[i];
            if (!validator || validator.type !== type) continue;
            const result = await validator.validate(payload, this);
            if (result !== true) {
                issues.push({
                    severity: validator.severity || 'error',
                    message: typeof result === 'string' ? result : validator.name
                });
            }
        }
        return issues;
    }

    applyDateValidation(cell, date) {
        this.runValidators('date', date).then((issues) => {
            const hasError = issues.some((item) => item.severity === 'error');
            const warning = issues.find((item) => item.severity === 'warning');
            if (hasError) {
                const firstError = issues.find((item) => item.severity === 'error');
                cell.classList.add('is-invalid');
                cell.setAttribute('aria-disabled', 'true');
                cell.title = firstError?.message || 'Unavailable';
                return;
            }
            if (warning) {
                cell.classList.add('is-warning');
                cell.title = warning.message;
            }
        });
    }

    showIssues(issues = []) {
        if (!this.messages) return;
        this.messages.replaceChildren();
        issues.forEach((issue) => {
            const line = document.createElement('div');
            line.className = `holi-calendar-message is-${issue.severity || 'info'}`;
            line.textContent = issue.message || '';
            this.messages.appendChild(line);
        });
        if (issues.length) {
            this.announce(issues.map((item) => item.message).join('. '));
        }
    }

    async handleDayClick(event) {
        const cell = event.target?.closest?.('[data-day]');
        if (!cell) return;
        if (cell.classList.contains('is-invalid') || cell.classList.contains('is-outside')) return;

        const nextDay = Number(cell.getAttribute('data-day'));
        if (!Number.isFinite(nextDay) || nextDay <= 0) return;
        this.day = nextDay;
        this.renderDays();

        const issues = await this.runValidators('selection', this.getDate());
        this.showIssues(issues);
        if (issues.some((item) => item.severity === 'error')) return;
        this.commit();
    }

    handleSwipe(event) {
        const startX = event.touches?.[0]?.clientX;
        if (!Number.isFinite(startX)) return;
        const moveHandler = (moveEvent) => {
            const currentX = moveEvent.touches?.[0]?.clientX;
            if (!Number.isFinite(currentX)) return;
            const dx = currentX - startX;
            const direction = this.rtl ? -1 : 1;
            if (dx > 60 * direction) this.changeMonth(-1);
            if (dx < -60 * direction) this.changeMonth(1);
        };
        this.element?.addEventListener('touchmove', moveHandler, { once: true });
    }

    changeMonth(delta) {
        this.month += delta;
        if (this.month < 1) {
            this.month = 12;
            this.year -= 1;
        }
        if (this.month > 12) {
            this.month = 1;
            this.year += 1;
        }
        this.renderCalendar();
    }

    getDate() {
        const hour = this.hour12
            ? (this.hour % 12) + (this.timeToggle?.textContent === 'PM' ? 12 : 0)
            : this.hour;
        const day = this.day || 1;
        return new Date(this.year, this.month - 1, day, hour, this.minute);
    }

    commit() {
        const date = this.getDate();
        if (this.input) {
            this.input.value = date.toISOString();
            this.input.dispatchEvent(new Event('input', { bubbles: true }));
            this.input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.element?.dispatchEvent(new CustomEvent('calendarchange', {
            bubbles: true,
            detail: {
                value: date.toISOString(),
                date
            }
        }));
        this.announce(`Selected ${date.toLocaleString(this.locale, { timeZone: this.tz })}`);
    }

    announce(message) {
        if (!this.live) return;
        this.live.textContent = '';
        requestAnimationFrame(() => {
            this.live.textContent = message || '';
        });
    }

    destroy() {
        this.prevBtn?.removeEventListener('click', this.onPrev);
        this.nextBtn?.removeEventListener('click', this.onNext);
        this.tbody?.removeEventListener('click', this.onDayClick);
        this.timeToggle?.removeEventListener('click', this.onToggleAmPm);
        this.element?.removeEventListener('touchstart', this.onTouchStart);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.CalendarComponent = CalendarComponent;
    window.Calendar = CalendarComponent;
    window.Calendar.registerValidator = CalendarComponent.registerValidator.bind(CalendarComponent);
}

export { CalendarComponent };
