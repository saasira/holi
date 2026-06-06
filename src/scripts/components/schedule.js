import { Component } from './component.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(value) {
    return String(value).padStart(2, '0');
}

function parseTime(value, fallback = 0) {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return fallback;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
    return Math.max(0, Math.min(24 * 60, (hours * 60) + minutes));
}

function formatTime(minutes) {
    const safe = Math.max(0, Math.min(24 * 60, Number(minutes) || 0));
    return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
}

function toKebab(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function parseJsonAttribute(element, name, fallback) {
    const raw = element.getAttribute(name) || element.getAttribute(`data-${name}`);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch (_error) {
        return fallback;
    }
}

class ScheduleComponent extends Component {
    static get selector() {
        return 'schedule';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'schedule';
    }

    static templateId = 'schedule-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = ScheduleComponent.templateId;
        this.hostId = this.container.id || this.container.getAttribute('data-component-id') || `schedule-${Date.now()}`;
        this.label = this.readAttr('label', 'Schedule');
        this.providerName = this.readAttr('provider', 'default');
        this.sourceName = this.readAttr('source', this.readAttr('data-source', ''));
        this.filterOneLabel = this.readAttr('filter-one-label', 'Filter');
        this.filterTwoLabel = this.readAttr('filter-two-label', 'Filter');
        this.filterThreeLabel = this.readAttr('filter-three-label', 'Filter');
        this.filterOneName = this.readAttr('filter-one-name', 'filterOne');
        this.filterTwoName = this.readAttr('filter-two-name', 'filterTwo');
        this.filterThreeName = this.readAttr('filter-three-name', 'filterThree');
        this.dialogTitleId = `${this.hostId}-dialog-title`;
        this.selectedDayIndex = 0;
        this.contentProviderInstance = null;
        this.days = this.resolveDays();
        this.events = [];
        this.timeline = this.resolveTimeline();
        this.slotted = this.captureSlottedContent();
        this.boundResize = () => this.syncDayVisibility();
        this.boundKeydown = (event) => {
            if (event.key === 'Escape' && this.dialogEl && !this.dialogEl.hidden) {
                this.closeDialog();
            }
        };
        this.init();
    }

    readAttr(name, fallback = '') {
        const direct = this.container.getAttribute(name);
        if (direct != null && String(direct).trim() !== '') return String(direct).trim();
        const fromData = this.container.getAttribute(`data-${name}`);
        if (fromData != null && String(fromData).trim() !== '') return String(fromData).trim();
        return fallback;
    }

    captureSlottedContent() {
        const slots = new Map();
        Array.from(this.container.children).forEach((child) => {
            const name = child.getAttribute('slot');
            if (!name) return;
            if (!slots.has(name)) slots.set(name, []);
            slots.get(name).push(child);
        });
        return slots;
    }

    async init() {
        this.validateStructure();
        this.data = await this.resolveDataSource();
        this.applyData(this.data);
        await this.render();
        this.bindEvents();
        this.updateView();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.schedule');
        this.projectSlots();
        this.tabsEl = this.element?.querySelector('[data-role="day-tabs"]');
        this.daysEl = this.element?.querySelector('[data-role="days"]');
        this.timelineEl = this.element?.querySelector('[data-role="timeline"]');
        this.dialogEl = this.element?.querySelector('.schedule__dialog');
        this.formEl = this.element?.querySelector('[data-role="event-form"]');
        this.formMessagesEl = this.element?.querySelector('[data-role="form-messages"]');
        this.dialogDayEl = this.element?.querySelector('[data-role="dialog-day"]');
        this.syncDialogFilters();
        this.applyTimelineVars();
    }

    projectSlots() {
        if (!this.element) return;
        this.element.querySelectorAll('slot[name]').forEach((slot) => {
            const name = slot.getAttribute('name');
            const replacement = document.createDocumentFragment();
            const nodes = this.slotted.get(name) || [];
            if (nodes.length) {
                nodes.forEach((node) => replacement.appendChild(node));
            } else {
                replacement.append(...Array.from(slot.childNodes));
            }
            slot.replaceWith(replacement);
        });
    }

    getContentProviders() {
        return this.container.contentProviders || window.contentProviders || {};
    }

    async ensureProviderInstance() {
        if (this.contentProviderInstance) return this.contentProviderInstance;
        const providerClass = this.getContentProviders()[this.providerName];
        if (!providerClass) return null;
        const context = window.appState || window.pageContext || {};
        if (typeof providerClass === 'function') {
            this.contentProviderInstance = new providerClass(context);
            await this.contentProviderInstance.init?.();
        } else if (typeof providerClass === 'object') {
            this.contentProviderInstance = providerClass;
        }
        return this.contentProviderInstance;
    }

    async resolveDataSource() {
        const inline = parseJsonAttribute(this.container, 'items', null)
            || parseJsonAttribute(this.container, 'events', null);
        if (inline) return inline;
        if (!this.sourceName) return { events: [] };

        const provider = await this.ensureProviderInstance();
        if (!provider) return { events: [] };
        if (typeof provider.resolve === 'function') return provider.resolve(this.sourceName, this.getFilters());
        if (typeof provider.getSchedule === 'function') return provider.getSchedule(this.sourceName, this.getFilters());
        return { events: [] };
    }

    applyData(data) {
        const payload = Array.isArray(data) ? { events: data } : (data || {});
        if (Array.isArray(payload.days) && payload.days.length) {
            this.days = this.normalizeDays(payload.days);
        }
        if (Array.isArray(payload.events)) {
            this.events = this.normalizeEvents(payload.events);
        }
    }

    resolveDays() {
        const configured = parseJsonAttribute(this.container, 'days', null);
        if (Array.isArray(configured) && configured.length) return this.normalizeDays(configured);

        const start = Number(this.readAttr('week-start', '1'));
        const normalizedStart = Number.isInteger(start) && start >= 0 && start <= 6 ? start : 1;
        return Array.from({ length: 7 }, (_item, index) => {
            const day = (normalizedStart + index) % 7;
            return {
                key: DAY_NAMES[day].toLowerCase(),
                label: DAY_NAMES[day],
                shortLabel: SHORT_DAY_NAMES[day],
                dateLabel: '',
                day,
                index
            };
        });
    }

    normalizeDays(days) {
        return days.map((day, index) => {
            const raw = typeof day === 'string' ? { label: day } : (day || {});
            const label = raw.label || raw.name || DAY_NAMES[index % 7];
            return {
                key: raw.key || toKebab(label) || String(index),
                label,
                shortLabel: raw.shortLabel || raw.short || String(label).slice(0, 3),
                dateLabel: raw.dateLabel || raw.date || '',
                day: Number.isInteger(Number(raw.day)) ? Number(raw.day) : index,
                index
            };
        });
    }

    resolveTimeline() {
        const range = this.readAttr('timeline', this.container.getAttribute('data-schedule-timeline') || '06:00-22:00');
        const [rawStart, rawEnd] = String(range).split('-');
        const start = parseTime(this.readAttr('start', rawStart || '06:00'), 6 * 60);
        const end = parseTime(this.readAttr('end', rawEnd || '22:00'), 22 * 60);
        const step = Math.max(5, Number(this.readAttr('step', '30')) || 30);
        const ticks = [];
        for (let current = start; current <= end; current += step) {
            ticks.push({
                value: current,
                label: formatTime(current)
            });
        }
        return {
            start,
            end,
            step,
            ticks,
            units: Math.max(1, ticks.length - 1)
        };
    }

    normalizeEvents(events) {
        return events.map((event, index) => {
            const since = event.since || event.start || event.startTime || '00:00';
            const till = event.till || event.end || event.endTime || since;
            const start = parseTime(since, this.timeline.start);
            const end = parseTime(till, start + this.timeline.step);
            const dayIndex = this.resolveEventDayIndex(event);
            return {
                id: event.id || `${this.hostId}-event-${index}`,
                title: event.title || event.name || 'Untitled event',
                description: event.description || event.details || '',
                since: formatTime(start),
                till: formatTime(end),
                dayIndex,
                state: event.state || (event.available === false ? 'unavailable' : 'available'),
                top: Math.max(0, (start - this.timeline.start) / this.timeline.step),
                height: Math.max(1, (end - start) / this.timeline.step),
                raw: event
            };
        });
    }

    resolveEventDayIndex(event) {
        const value = event.dayIndex ?? event.day ?? event.weekday ?? event.date;
        if (Number.isInteger(Number(value))) {
            const numeric = Number(value);
            const direct = this.days.find((day) => day.index === numeric);
            if (direct) return direct.index;
            const byDay = this.days.find((day) => day.day === numeric);
            if (byDay) return byDay.index;
        }
        const key = toKebab(value);
        const found = this.days.find((day) => day.key === key || toKebab(day.label) === key || toKebab(day.shortLabel) === key);
        return found ? found.index : 0;
    }

    applyTimelineVars() {
        if (!this.element) return;
        this.element.style.setProperty('--schedule-number-units', String(this.timeline.units));
    }

    updateView() {
        if (!this.element) return;
        this.timeline = this.resolveTimeline();
        this.events = this.normalizeEvents(this.events.map((event) => event.raw || event));
        this.applyTimelineVars();
        this.renderTabs();
        this.renderDays();
        this.renderTimeline();
        this.renderDialogDays();
    }

    renderTabs() {
        if (!this.tabsEl) return;
        this.tabsEl.replaceChildren();
        const template = document.getElementById('schedule-day-tab-template');
        this.days.forEach((day) => {
            const contextDay = {
                ...day,
                selected: String(day.index === this.selectedDayIndex),
                tabIndex: day.index === this.selectedDayIndex ? '0' : '-1'
            };
            this.tabsEl.appendChild(this.renderTemplate(template, { day: contextDay }));
        });
    }

    renderDays() {
        if (!this.daysEl) return;
        this.daysEl.replaceChildren();
        const dayTemplate = document.getElementById('schedule-day-template');
        const eventTemplate = document.getElementById('schedule-event-template');
        this.days.forEach((day) => {
            const fragment = this.renderTemplate(dayTemplate, {
                day: {
                    ...day,
                    headerId: `${this.hostId}-day-${day.index}`
                }
            });
            const section = fragment.querySelector?.('.schedule__day') || fragment.firstElementChild;
            const eventsEl = section?.querySelector('[data-role="events"]');
            this.events
                .filter((event) => event.dayIndex === day.index)
                .forEach((event) => eventsEl?.appendChild(this.renderTemplate(eventTemplate, { event })));
            this.daysEl.appendChild(fragment);
        });
        this.syncDayVisibility();
    }

    renderTimeline() {
        if (!this.timelineEl) return;
        const template = document.getElementById('schedule-timeline-item-template');
        this.timelineEl.replaceChildren();
        this.timeline.ticks.forEach((tick) => {
            this.timelineEl.appendChild(this.renderTemplate(template, { tick }));
        });
    }

    renderDialogDays() {
        if (!this.dialogDayEl) return;
        this.dialogDayEl.replaceChildren();
        this.days.forEach((day) => {
            const option = document.createElement('option');
            option.value = String(day.index);
            option.textContent = day.label;
            this.dialogDayEl.appendChild(option);
        });
    }

    syncDialogFilters() {
        if (!this.element) return;
        ['one', 'two', 'three'].forEach((key) => {
            const source = this.element.querySelector(`[data-filter="${key}"]`);
            const target = this.element.querySelector(`[data-dialog-filter="${key}"]`);
            if (!(source instanceof HTMLSelectElement) || !(target instanceof HTMLSelectElement)) return;
            if (target.options.length > 0) return;
            Array.from(source.options).forEach((option) => {
                target.appendChild(option.cloneNode(true));
            });
        });
    }

    renderTemplate(template, context) {
        if (!(template instanceof HTMLTemplateElement)) return document.createDocumentFragment();
        const fragment = template.content.cloneNode(true);
        this.applyBindings(fragment, this.getBindingContext(context));
        return fragment;
    }

    bindEvents() {
        this.element?.addEventListener('click', (event) => {
            if (event.target === this.dialogEl) {
                event.preventDefault();
                this.closeDialog();
                return;
            }

            const tab = event.target?.closest?.('[data-day-index]');
            if (tab && tab.matches('.schedule__control')) {
                this.selectDay(Number(tab.getAttribute('data-day-index')));
                return;
            }

            const action = event.target?.closest?.('[data-action]')?.getAttribute('data-action');
            if (action === 'load') {
                event.preventDefault();
                void this.load();
            } else if (action === 'open-dialog') {
                event.preventDefault();
                this.openDialog();
            } else if (action === 'close-dialog') {
                event.preventDefault();
                this.closeDialog();
            }
        });

        this.element?.addEventListener('change', (event) => {
            if (!event.target?.matches?.('[data-filter], [data-dialog-filter]')) return;
            if (event.target?.matches?.('[data-dialog-filter]')) {
                this.dispatchEvent('scheduledialogfilterchange', { filters: this.getDialogFilters() });
                return;
            }
            this.dispatchEvent('schedulefilterchange', { filters: this.getFilters() });
        });

        this.formEl?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.addFromForm();
        });

        window.addEventListener('resize', this.boundResize);
        document.addEventListener('keydown', this.boundKeydown);
    }

    selectDay(index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.days.length) return;
        this.selectedDayIndex = index;
        this.renderTabs();
        this.syncDayVisibility();
        this.dispatchEvent('scheduledaychange', {
            index,
            day: this.days[index]
        });
    }

    syncDayVisibility() {
        const compact = window.matchMedia?.('(max-width: 63.99rem)').matches;
        this.daysEl?.querySelectorAll('.schedule__day').forEach((dayEl) => {
            const index = Number(dayEl.getAttribute('data-day-index'));
            dayEl.hidden = compact && index !== this.selectedDayIndex;
        });
    }

    async load() {
        const data = await this.resolveDataSource();
        this.applyData(data);
        this.updateView();
        this.dispatchEvent('scheduleload', {
            filters: this.getFilters(),
            events: this.events
        });
    }

    getFilters() {
        const filters = {};
        this.element?.querySelectorAll('[data-filter][name]').forEach((field) => {
            filters[field.name] = field.type === 'checkbox' ? field.checked : field.value;
        });
        return filters;
    }

    getDialogFilters() {
        const filters = {};
        this.element?.querySelectorAll('[data-dialog-filter][name]').forEach((field) => {
            filters[field.name] = field.type === 'checkbox' ? field.checked : field.value;
        });
        return filters;
    }

    openDialog() {
        if (!this.dialogEl) return;
        this.dialogEl.hidden = false;
        this.dialogEl.querySelector('input, select, textarea, button')?.focus?.();
    }

    closeDialog() {
        if (!this.dialogEl) return;
        this.dialogEl.hidden = true;
        this.formMessagesEl?.replaceChildren();
    }

    addFromForm() {
        if (!this.formEl) return;
        const formData = new FormData(this.formEl);
        const event = {
            title: formData.get('title') || '',
            description: formData.get('description') || '',
            dayIndex: Number(formData.get('day') || this.selectedDayIndex),
            since: formData.get('since') || '',
            till: formData.get('till') || '',
            slotSize: formData.get('slotSize') || '',
            available: formData.get('available') === 'on',
            periodicity: formData.get('periodicity') || ''
        };

        if (!event.title || !event.since || !event.till) {
            this.showFormMessage('Title, From, and To are required.');
            return;
        }

        const [normalized] = this.normalizeEvents([event]);
        this.events.push(normalized);
        this.updateView();
        this.formEl.reset();
        this.closeDialog();
        this.dispatchEvent('scheduleadd', {
            event: normalized,
            raw: event
        });
    }

    showFormMessage(message) {
        if (!this.formMessagesEl) return;
        this.formMessagesEl.textContent = message;
    }

    destroy() {
        window.removeEventListener('resize', this.boundResize);
        document.removeEventListener('keydown', this.boundKeydown);
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.ScheduleComponent = ScheduleComponent;
}

export { ScheduleComponent };
