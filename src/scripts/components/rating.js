import { Component } from './component.js';
class RatingComponent extends Component {
    static get selector() {
        return 'rating';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'rating';
    }

    static templateId = 'rating-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = RatingComponent.templateId;
        this.type = this.resolveType(options.type ?? this.readAttr('type', 'star'));
        this.grade = this.resolveGrade(options.grade ?? this.readAttr('grade', '5'));
        this.rating = this.resolveRating(options.value ?? this.readAttr('value', this.readAttr('rating', '0')));
        this.init();
    }

    readAttr(name, fallback = '') {
        const direct = this.container.getAttribute(name);
        if (direct != null) return String(direct);
        const dataValue = this.container.getAttribute(`data-${name}`);
        return dataValue != null ? String(dataValue) : fallback;
    }

    resolveType(value) {
        const normalized = String(value || 'star').trim().toLowerCase();
        if (normalized === 'star' || normalized === 'start') return 'star';
        return 'star';
    }

    resolveGrade(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return 5;
        return Math.max(1, Math.min(10, Math.round(parsed)));
    }

    resolveRating(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return 0;
        return Math.max(0, Math.min(this.grade, parsed));
    }

    async init() {
        this.validateStructure();
        await this.render();
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.rating');
        this.iconTemplate = this.container.querySelector('.rating [data-value]');
        if (!this.element || !this.iconTemplate) {
            throw new Error('Rating template is missing required nodes');
        }
        this.buildIcons();
        this.updateView();
    }

    setRating(value) {
        this.rating = this.resolveRating(value);
        this.updateView();
    }

    setGrade(value) {
        this.grade = this.resolveGrade(value);
        this.rating = this.resolveRating(this.rating);
        this.buildIcons();
        this.updateView();
    }

    buildIcons() {
        if (!this.element || !this.iconTemplate) return;
        this.element.replaceChildren();

        const fragment = document.createDocumentFragment();
        for (let index = 0; index < this.grade; index += 1) {
            const icon = this.iconTemplate.cloneNode(true);
            icon.setAttribute('data-value', String(index + 1));
            fragment.appendChild(icon);
        }

        this.element.appendChild(fragment);
        this.icons = Array.from(this.element.querySelectorAll('[data-value]'));
    }

    updateView() {
        if (!this.element || !Array.isArray(this.icons)) return;

        this.element.setAttribute('data-type', this.type);
        this.element.setAttribute('data-grade', String(this.grade));
        this.element.setAttribute('data-rating', String(this.rating));
        this.element.setAttribute('aria-label', `${this.rating} out of ${this.grade} stars`);

        this.icons.forEach((icon, index) => {
            const value = index + 1;
            const fill = this.resolveFill(value);
            icon.className = `fa ${this.resolveIconClass(fill)}`;
            icon.setAttribute('data-value', String(value));
            icon.setAttribute('aria-hidden', 'true');
        });
    }

    resolveFill(value) {
        if (this.rating >= value) return 'full';
        if (this.rating >= value - 0.5) return 'half';
        return 'empty';
    }

    resolveIconClass(fill) {
        if (fill === 'full') return 'fa-star';
        if (fill === 'half') return 'fa-star-half-full';
        return 'fa-star-o';
    }
}

if (typeof window !== 'undefined') {
    window.RatingComponent = RatingComponent;
}

export { RatingComponent };
