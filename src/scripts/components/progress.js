class ProgressBar extends Component {
    static get selector() {
        return 'progress';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'progress';
    }

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = 'progress';

        this.type = (options.type || container.getAttribute('type') || container.dataset.type || 'determinate').toLowerCase();
        this.size = (options.size || container.getAttribute('size') || container.dataset.size || 'md').toLowerCase();
        this.min = this.parseNumber(options.min, container.getAttribute('min'), container.dataset.min, 0);
        this.max = this.parseNumber(options.max, container.getAttribute('max'), container.dataset.max, 100);
        this._value = this.parseNumber(options.value, container.getAttribute('value'), container.dataset.value, this.min);
        this.showValue = this.parseBoolean(options.showValue, container.getAttribute('show-value'), container.dataset.showValue, true);
        this.pauseOnHover = this.parseBoolean(options.pauseOnHover, container.getAttribute('pause-on-hover'), container.dataset.pauseOnHover, true);
        this.labelText = options.label || container.getAttribute('label') || container.dataset.label || '';

        this.track = null;
        this.fill = null;
        this.buffer = null;
        this.labelEl = null;
        this.indeterminate = this.type === 'indeterminate';
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
            if (typeof value === 'boolean') return value;
            const normalized = String(value).toLowerCase();
            if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
            if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
        }
        return fallback;
    }

    validateStructure() {
        super.validateStructure();
        if (!(this.max > this.min)) {
            throw new Error('ProgressBar requires max > min');
        }
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.progress');
        this.track = this.element?.querySelector('.progress-track');
        this.fill = this.element?.querySelector('.progress-fill');
        this.buffer = this.element?.querySelector('.progress-buffer');
        this.labelEl = this.element?.querySelector('.progress-label');

        if (!this.element || !this.track || !this.fill || !this.labelEl) {
            throw new Error('ProgressBar template is missing required nodes');
        }

        this.applyBaseState();
        this.update(this._value);
    }

    async init() {
        this.validateStructure();
        await this.render();
        this.bindEvents();
    }

    applyBaseState() {
        this.element.classList.add('progress', `progress--${this.type}`, `progress--${this.size}`);
        this.element.setAttribute('role', 'progressbar');
        this.element.setAttribute('aria-valuemin', String(this.min));
        this.element.setAttribute('aria-valuemax', String(this.max));
        this.labelEl.hidden = !this.showValue;
    }

    bindEvents() {
        if (!this.pauseOnHover) return;
        this.element.addEventListener('mouseenter', () => this.pause());
        this.element.addEventListener('mouseleave', () => this.resume());
    }

    set value(newValue) {
        this.update(newValue);
    }

    get value() {
        return this.indeterminate ? null : this._value;
    }

    clamp(value) {
        return Math.max(this.min, Math.min(this.max, value));
    }

    update(newValue, label = null) {
        if (this.indeterminate) return;
        this._value = this.clamp(Number(newValue));

        const denominator = this.max - this.min;
        const percentage = denominator > 0 ? ((this._value - this.min) / denominator) * 100 : 0;
        const safePercentage = Math.max(0, Math.min(100, percentage));

        this.element.setAttribute('aria-valuenow', String(this._value));
        this.fill.style.width = `${safePercentage}%`;
        if (this.buffer) this.buffer.style.width = '100%';

        if (this.showValue) {
            this.labelEl.textContent = label || this.labelText || `${Math.round(safePercentage)}%`;
        }

        this.dispatchEvent('progressupdate', { value: this._value, percentage: safePercentage });
    }

    increment(step = 10) {
        if (this.indeterminate) return;
        this.update(this._value + step);
    }

    setIndeterminate() {
        this.type = 'indeterminate';
        this.indeterminate = true;
        this.element.classList.add('progress--indeterminate');
        this.element.removeAttribute('aria-valuenow');
        this.fill.style.width = '100%';
        if (this.buffer) this.buffer.style.width = '100%';
    }

    setDeterminate(value = this.min) {
        this.type = 'determinate';
        this.indeterminate = false;
        this.element.classList.remove('progress--indeterminate');
        this.update(value);
    }

    pause() {
        this.element.style.animationPlayState = 'paused';
        this.fill.style.animationPlayState = 'paused';
    }

    resume() {
        this.element.style.animationPlayState = 'running';
        this.fill.style.animationPlayState = 'running';
    }

    static fromEvent(event) {
        const progressEl = event.currentTarget?.closest('[data-progress], [component="progress"], [role="progress"], progress');
        if (!progressEl) return;
        const progress = progressEl.progressbar;
        if (!progress) return;

        const loaded = Number(event.loaded || 0);
        const total = Number(event.total || 0);
        const percentage = total > 0 ? (loaded / total) * 100 : 0;
        progress.update(percentage);
    }
}
