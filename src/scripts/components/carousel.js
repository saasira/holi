import { Component } from './component.js';

class CarouselComponent extends Component {
    static get selector() {
        return 'carousel';
    }

    static get library() {
        return 'holi';
    }

    static get componentName() {
        return 'carousel';
    }

    static templateId = 'carousel-template';

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = CarouselComponent.templateId;
        this.mode = this.resolveMode(container.getAttribute('mode') || 'fade');
        this.baseActiveSlides = this.parseNumber(container.getAttribute('active-slides'), 1);
        this.baseSlidesToMove = this.parseNumber(container.getAttribute('move-slides'), 1);
        this.activeSlides = this.baseActiveSlides;
        this.slidesToMove = this.baseSlidesToMove;
        this.loop = !container.hasAttribute('no-loop');
        this.autoStart = !container.hasAttribute('no-autoplay');
        this.pauseOnHover = !container.hasAttribute('no-pause-on-hover');
        this.intervalMs = this.parseNumber(container.getAttribute('interval'), 5000);
        this.skipTarget = container.getAttribute('skip-target') || '#main-content';
        this.responsive = this.parseResponsiveConfig(container.getAttribute('responsive'));
        this.currentIndex = 0;
        this.isPlaying = this.autoStart;
        this.animationFrame = null;
        this.progressStartedAt = 0;
        this.boundResize = null;
        this.slotted = null;
        this.track = null;
        this.slideList = [];
        this.prevButton = null;
        this.nextButton = null;
        this.playPauseButton = null;
        this.loopButton = null;
        this.dotsContainer = null;
        this.progressBar = null;
        this.liveRegion = null;
        this.init();
    }

    parseNumber(value, fallback) {
        const next = Number(value);
        return Number.isFinite(next) && next > 0 ? next : fallback;
    }

    resolveMode(value) {
        const next = String(value || 'fade').trim().toLowerCase();
        return next === 'slide' ? 'slide' : 'fade';
    }

    parseResponsiveConfig(raw) {
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return {};
            return parsed;
        } catch (_error) {
            return {};
        }
    }

    captureSlots() {
        const directChildren = Array.from(this.container.children).filter((node) => !node.classList.contains('holi-carousel'));
        const bySlot = (name) => directChildren.find((node) => node.getAttribute('slot') === name) || null;
        const slidesHost = bySlot('slides') || this.container.querySelector('.slides');
        this.slotted = {
            skipLink: bySlot('skip-link'),
            slides: slidesHost,
            anchors: bySlot('anchors'),
            dots: bySlot('dots'),
            controls: bySlot('controls'),
            progress: bySlot('progress'),
            liveRegion: bySlot('live-region')
        };
    }

    async init() {
        this.captureSlots();
        this.validateStructure();
        await this.render();
        this.bindEvents();
        this.applyResponsiveSettings();
        this.goToSlide(0, false);
        if (this.autoStart) this.startAutoSlide();
    }

    validateStructure() {
        super.validateStructure();
        const hasSlides = !!(this.slotted?.slides || this.container.querySelector('.slides, .slide, [slot="slides"]'));
        if (!hasSlides) {
            throw new Error('Carousel requires slides markup. Provide [slot="slides"] with .slide items.');
        }
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.holi-carousel');
        if (!this.element) return;

        this.element.classList.toggle('fade', this.mode === 'fade');
        this.element.classList.toggle('slide-mode', this.mode === 'slide');

        this.applySlotContent();
        this.track = this.container.querySelector('[data-role="track"]');
        this.prevButton = this.container.querySelector('[data-action="previous"]');
        this.nextButton = this.container.querySelector('[data-action="next"]');
        this.playPauseButton = this.container.querySelector('[data-action="play-pause"]');
        this.loopButton = this.container.querySelector('[data-action="toggle-loop"]');
        this.dotsContainer = this.container.querySelector('[data-role="dots"]');
        this.progressBar = this.container.querySelector('[data-role="progress-bar"]');
        this.liveRegion = this.container.querySelector('[data-role="live-region"]');
        this.refreshSlides();
        this.updateControlLabels();
        this.updateTrackSizing();
        this.renderDots();
    }

    applySlotContent() {
        const slotMap = [
            ['skip-link', this.slotted?.skipLink],
            ['slides', this.slotted?.slides],
            ['anchors', this.slotted?.anchors],
            ['dots', this.slotted?.dots],
            ['controls', this.slotted?.controls],
            ['progress', this.slotted?.progress],
            ['live-region', this.slotted?.liveRegion]
        ];

        slotMap.forEach(([slotName, source]) => {
            if (!source) return;
            const targetSlot = this.container.querySelector(`slot[name="${slotName}"]`);
            if (!targetSlot) return;
            targetSlot.replaceWith(source);
        });

        if (this.track && this.slotted?.slides) {
            const slidesWrapper = this.slotted.slides.matches('.slides')
                ? this.slotted.slides
                : this.slotted.slides.querySelector('.slides');
            if (slidesWrapper) {
                this.track.replaceChildren(...Array.from(slidesWrapper.children));
            } else {
                const directSlides = Array.from(this.slotted.slides.children).filter((node) => node.classList?.contains('slide'));
                if (directSlides.length) this.track.replaceChildren(...directSlides);
            }
        }

        const fallbackSlidesSlot = this.container.querySelector('slot[name="slides"]');
        if (fallbackSlidesSlot && fallbackSlidesSlot.parentElement === this.track) {
            fallbackSlidesSlot.replaceWith(...Array.from(fallbackSlidesSlot.childNodes));
        }

        const skipLink = this.container.querySelector('.skip-link');
        if (skipLink) skipLink.setAttribute('href', this.skipTarget);
    }

    refreshSlides() {
        if (!this.track) return;
        this.slideList = Array.from(this.track.querySelectorAll('.slide'));
        this.slideList.forEach((slide, index) => {
            slide.setAttribute('data-index', String(index));
            slide.setAttribute('aria-hidden', 'true');
            slide.classList.remove('active');
        });
    }

    bindEvents() {
        if (!this.element) return;
        this.element.addEventListener('click', (event) => {
            const actionTarget = event.target.closest('[data-action]');
            if (!actionTarget) return;
            const action = actionTarget.getAttribute('data-action');
            if (action === 'next') {
                event.preventDefault();
                this.next();
                return;
            }
            if (action === 'previous') {
                event.preventDefault();
                this.previous();
                return;
            }
            if (action === 'play-pause') {
                event.preventDefault();
                this.togglePlayPause();
                return;
            }
            if (action === 'toggle-loop') {
                event.preventDefault();
                this.toggleLoop();
            }
        });

        this.dotsContainer?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-dot-index]');
            if (!button) return;
            const index = Number(button.getAttribute('data-dot-index'));
            if (!Number.isFinite(index)) return;
            this.goToSlide(index, true);
        });

        this.element.addEventListener('keydown', (event) => this.handleKeydown(event));
        this.track?.addEventListener('touchstart', (event) => this.onTouchStart(event), { passive: true });
        this.track?.addEventListener('touchend', (event) => this.onTouchEnd(event), { passive: true });

        if (this.pauseOnHover) {
            this.element.addEventListener('mouseenter', () => this.pauseAutoSlide(false));
            this.element.addEventListener('mouseleave', () => this.resumeAutoSlide());
        }

        if (typeof window !== 'undefined') {
            this.boundResize = () => this.applyResponsiveSettings();
            window.addEventListener('resize', this.boundResize);
        }
    }

    applyResponsiveSettings() {
        const width = window.innerWidth || document.documentElement.clientWidth;
        let matched = null;
        Object.keys(this.responsive)
            .map((key) => Number(key))
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => a - b)
            .forEach((breakpoint) => {
                if (width <= breakpoint && matched == null) matched = this.responsive[String(breakpoint)] || this.responsive[breakpoint];
            });

        this.activeSlides = this.baseActiveSlides;
        this.slidesToMove = this.baseSlidesToMove;
        if (matched && typeof matched === 'object') {
            this.activeSlides = this.parseNumber(matched.active, this.baseActiveSlides);
            this.slidesToMove = this.parseNumber(matched.move, this.baseSlidesToMove);
        }
        this.activeSlides = Math.max(1, Math.min(this.activeSlides, this.slideList.length || 1));
        this.slidesToMove = Math.max(1, this.slidesToMove);
        this.updateTrackSizing();
        this.renderDots();
        this.goToSlide(Math.min(this.currentIndex, Math.max(this.getDotCount() - 1, 0)), false);
    }

    getDotCount() {
        return Math.max(1, Math.ceil((this.slideList.length || 1) / this.slidesToMove));
    }

    renderDots() {
        if (!this.dotsContainer) return;
        this.dotsContainer.replaceChildren();
        const count = this.getDotCount();
        for (let i = 0; i < count; i += 1) {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'dot';
            dot.setAttribute('data-dot-index', String(i));
            dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
            dot.setAttribute('aria-pressed', i === this.currentIndex ? 'true' : 'false');
            if (i === this.currentIndex) dot.classList.add('selected');
            this.dotsContainer.appendChild(dot);
        }
    }

    updateDots() {
        if (!this.dotsContainer) return;
        const dots = this.dotsContainer.querySelectorAll('[data-dot-index]');
        dots.forEach((dot, index) => {
            const selected = index === this.currentIndex;
            dot.classList.toggle('selected', selected);
            dot.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
    }

    updateTrackSizing() {
        if (!this.track || !this.slideList.length) return;
        const widthPercent = 100 / this.activeSlides;
        this.slideList.forEach((slide) => {
            slide.style.flex = `0 0 ${widthPercent}%`;
        });
    }

    goToSlide(index, restartAutoPlay = true) {
        if (!this.slideList.length) return;
        const maxIndex = this.getDotCount() - 1;
        this.currentIndex = Math.max(0, Math.min(index, maxIndex));
        const start = this.currentIndex * this.slidesToMove;

        if (this.mode === 'slide') {
            const offsetPercent = start * (100 / this.activeSlides);
            if (this.track) this.track.style.transform = `translateX(-${offsetPercent}%)`;
            this.slideList.forEach((slide, idx) => {
                const active = idx >= start && idx < start + this.activeSlides;
                slide.classList.toggle('active', active);
                slide.setAttribute('aria-hidden', active ? 'false' : 'true');
            });
        } else {
            this.slideList.forEach((slide, idx) => {
                const active = idx >= start && idx < start + this.activeSlides;
                slide.classList.toggle('active', active);
                slide.setAttribute('aria-hidden', active ? 'false' : 'true');
            });
        }

        this.updateDots();
        this.announce(`Slide ${this.currentIndex + 1} of ${this.getDotCount()} is now visible`);

        if (restartAutoPlay && this.isPlaying) {
            this.startAutoSlide();
        }
    }

    next() {
        const max = this.getDotCount() - 1;
        if (this.currentIndex >= max) {
            if (!this.loop) return;
            this.goToSlide(0);
            return;
        }
        this.goToSlide(this.currentIndex + 1);
    }

    previous() {
        if (this.currentIndex <= 0) {
            if (!this.loop) return;
            this.goToSlide(this.getDotCount() - 1);
            return;
        }
        this.goToSlide(this.currentIndex - 1);
    }

    togglePlayPause() {
        if (this.isPlaying) {
            this.pauseAutoSlide(true);
        } else {
            this.isPlaying = true;
            this.updateControlLabels();
            this.announce('Carousel playing');
            this.startAutoSlide();
        }
    }

    pauseAutoSlide(announce) {
        this.isPlaying = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        this.updateControlLabels();
        if (announce) this.announce('Carousel paused');
    }

    resumeAutoSlide() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.updateControlLabels();
        this.startAutoSlide();
    }

    toggleLoop() {
        this.loop = !this.loop;
        this.updateControlLabels();
        this.announce(`Loop mode ${this.loop ? 'enabled' : 'disabled'}`);
    }

    updateControlLabels() {
        if (this.playPauseButton) {
            this.playPauseButton.textContent = this.isPlaying ? 'Pause' : 'Play';
            this.playPauseButton.setAttribute('aria-label', this.isPlaying ? 'Pause auto sliding' : 'Resume auto sliding');
        }
        if (this.loopButton) {
            this.loopButton.textContent = this.loop ? 'Disable Loop' : 'Enable Loop';
            this.loopButton.setAttribute('aria-pressed', this.loop ? 'true' : 'false');
        }
    }

    startAutoSlide() {
        if (!this.progressBar) return;
        if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
        this.progressBar.style.width = '0%';
        this.progressStartedAt = Date.now();

        const tick = () => {
            if (!this.isPlaying) return;
            const elapsed = Date.now() - this.progressStartedAt;
            const percent = Math.min((elapsed / this.intervalMs) * 100, 100);
            this.progressBar.style.width = `${percent}%`;
            if (elapsed >= this.intervalMs) {
                this.next();
                this.progressStartedAt = Date.now();
                this.progressBar.style.width = '0%';
            }
            this.animationFrame = requestAnimationFrame(tick);
        };

        this.animationFrame = requestAnimationFrame(tick);
    }

    onTouchStart(event) {
        this.touchStartX = event.changedTouches?.[0]?.clientX ?? 0;
    }

    onTouchEnd(event) {
        const endX = event.changedTouches?.[0]?.clientX ?? 0;
        const delta = endX - (this.touchStartX || 0);
        if (Math.abs(delta) < 24) return;
        if (delta < 0) {
            this.next();
        } else {
            this.previous();
        }
    }

    handleKeydown(event) {
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            this.next();
            return;
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            this.previous();
            return;
        }
        if (event.key === ' ') {
            event.preventDefault();
            this.togglePlayPause();
        }
    }

    announce(message) {
        if (this.liveRegion) this.liveRegion.textContent = message;
    }

    destroy() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        if (this.boundResize) {
            window.removeEventListener('resize', this.boundResize);
            this.boundResize = null;
        }
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.CarouselComponent = CarouselComponent;
}

export { CarouselComponent };
