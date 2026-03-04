import { Component } from './component.js';
import { attachLoaderState } from '../utils/loader_state.js';
import { attachComponentStateBinding } from '../utils/component_state_binding.js';

class WizardComponent extends Component {
    static get selector() { return 'wizard'; }
    static get library() { return 'holi'; }
    static get componentName() { return 'wizard'; }

    constructor(container, options = {}) {
        super(container, options);
        this.templateId = 'wizard';
        this.currentStep = 0;
        this.steps = [];
        this.stepData = new Map();
        this.isComplete = false;
        this.autoSync = container.hasAttribute('autosync');
        this.lazyLoad = container.hasAttribute('lazy');
        this.stepNavigationMode = this.resolveStepNavigationMode(container);
        this.providerName = container.getAttribute('provider') || 'default';
        this.contentProviderInstance = null;
        this.loadedStepContent = new Set();
        this.init();
    }

    resolveStepNavigationMode(container) {
        const mode = String(container.getAttribute('data-step-navigation') || 'inline').trim().toLowerCase();
        return mode === 'page' ? 'page' : 'inline';
    }

    async init() {
        super.init();
        await this.render();
        this.bindEvents();
        const initialIndex = this.resolveInitialStepIndex();
        await this.loadStep(initialIndex, 0, { allowPageNavigation: false });
    }

    resolveInitialStepIndex() {
        if (!this.steps.length) return 0;

        const idHint = String(
            this.container.getAttribute('data-initial-step-id')
            || this.container.getAttribute('initial-step-id')
            || ''
        ).trim();

        if (idHint) {
            const byId = this.steps.findIndex((step) => String(step.id) === idHint);
            if (byId >= 0) return byId;
        }

        const indexHintRaw = this.container.getAttribute('data-initial-step') || this.container.getAttribute('initial-step');
        const indexHint = Number(indexHintRaw);
        if (Number.isInteger(indexHint) && indexHint >= 0 && indexHint < this.steps.length) {
            return indexHint;
        }

        return 0;
    }

    async render() {
        await super.render();
        this.element = this.container.querySelector('.wizard');
        this.nav = this.element.querySelector('.wizard-nav');
        this.content = this.element.querySelector('.wizard-content');
        this.progress = this.element.querySelector('.wizard-progress');
        this.footer = this.element.querySelector('.wizard-footer');
        this.loaderState = attachLoaderState(this, {
            host: this.content || this.element,
            busyTarget: this.content || this.element,
            scope: 'block',
            defaultMessage: 'Loading step...'
        });
        this.stateBinding = attachComponentStateBinding(this, {
            defaultPath: 'wizard',
            eventName: 'stepchange',
            getSnapshot: (component) => component.getBindableState(),
            applySnapshot: (component, snapshot) => component.applyBindableState(snapshot)
        });

        await this.processDataRepeats();
        this.updateProgress();
        this.updateFooterState();
    }

    async processDataRepeats() {
        const dataSource = this.container.dataset.source;
        if (!dataSource) return;

        this.data = await this.resolveDataSource();
        const sourceSteps = Array.isArray(this.data)
            ? this.data
            : Array.isArray(this.data?.steps)
                ? this.data.steps
                : [];

        this.steps = sourceSteps.map((step, index) => ({
            id: step.id || index,
            name: step.name || `Step ${index + 1}`,
            valid: false,
            dirty: false,
            data: {},
            canSkip: step.canSkip || false,
            loadContent: step.contentUrl,
            contentType: step.contentType || '',
            pageUrl: step.pageUrl || step.href || step.route || '',
            content: step.content || null
        }));

        if (!this.lazyLoad) {
            await this.preloadStepContent();
        }

        this.renderStepNav();
        this.updateFooterState();
    }

    renderStepNav() {
        this.nav.replaceChildren();
        this.steps.forEach((step, index) => {
            const navItem = document.createElement('button');
            navItem.className = `wizard-step ${index <= this.currentStep ? 'complete' : ''}`;
            navItem.dataset.step = String(index);
            navItem.disabled = index > this.currentStep;

            const stepNumber = document.createElement('span');
            stepNumber.className = 'step-number';
            stepNumber.textContent = String(index + 1);

            const stepName = document.createElement('span');
            stepName.className = 'step-name';
            stepName.textContent = step.name;

            navItem.append(stepNumber, stepName);
            this.nav.appendChild(navItem);
        });
    }

    async loadStep(index, direction = 1, options = {}) {
        const allowPageNavigation = options.allowPageNavigation !== false;

        if (!this.steps.length) {
            this.renderStepContent(null);
            this.updateFooterState();
            return false;
        }

        if (index > 0 && direction > 0) {
            const valid = await this.validateCurrentStep();
            if (!valid) return false;
        }

        await this.saveStepData(this.currentStep);

        this.currentStep = index;
        const step = this.steps[index];
        if (!step) return false;

        this.updateNavState();
        this.updateProgress();
        this.updateFooterState();

        if (allowPageNavigation && this.shouldNavigateToPage(step)) {
            await this.navigateToStepPage(step, index, direction);
            return true;
        }
        this.loaderState?.setLoading?.(true, `Loading ${step.name || `Step ${index + 1}`}...`);
        try {
            if (this.shouldLoadStepContent(step)) {
                await this.loadStepContent(index);
            }

            this.renderStepContent(step);
            this.focusContent();
        } finally {
            this.loaderState?.setLoading?.(false);
        }

        this.dispatchEvent('stepchange', {
            step: index,
            direction,
            stepData: step
        });

        return true;
    }

    shouldNavigateToPage(step) {
        return this.stepNavigationMode === 'page' && !!step?.pageUrl;
    }

    shouldLoadStepContent(step) {
        if (!step) return false;
        if (this.shouldNavigateToPage(step)) return false;
        if (this.lazyLoad) return true;
        if (step.loadContent) return true;
        return step.content == null;
    }

    async preloadStepContent() {
        for (let i = 0; i < this.steps.length; i += 1) {
            const step = this.steps[i];
            if (!this.shouldLoadStepContent(step)) continue;
            await this.loadStepContent(i);
        }
    }

    renderStepContent(step) {
        if (!step) {
            const empty = document.createElement('div');
            empty.className = 'wizard-empty';
            empty.textContent = 'No steps configured.';
            this.content.replaceChildren(empty);
            return;
        }

        if (step.content instanceof Node) {
            this.content.replaceChildren(step.content);
            return;
        }
        if (typeof step.content === 'string') {
            const text = step.content.trim();
            if (!text) {
                this.content.replaceChildren(this.createDefaultStepForm(step));
                return;
            }
            const template = document.createElement('template');
            template.innerHTML = text;
            this.content.replaceChildren(template.content.cloneNode(true));
            return;
        }

        if (this.isJsonStepContent(step.content)) {
            this.content.replaceChildren(this.createJsonStepForm(step, step.content));
            return;
        }

        this.content.replaceChildren(this.createDefaultStepForm(step));
    }

    isJsonStepContent(content) {
        return !!content && typeof content === 'object' && !(content instanceof Node);
    }

    createDefaultStepForm(step) {
        const form = document.createElement('form');
        form.dataset.step = String(step.id);
        const heading = document.createElement('h3');
        heading.textContent = step.name || `Step ${this.currentStep + 1}`;
        const note = document.createElement('p');
        note.textContent = 'No custom content configured for this step.';
        form.append(heading, note);
        return form;
    }

    async loadStepContent(index) {
        const step = this.steps[index];
        if (!step) return;
        if (this.loadedStepContent.has(index)) return;

        try {
            const content = await this.fetchStepContent(step);
            if (content != null) step.content = content;
            this.loadedStepContent.add(index);
        } catch (error) {
            this.showStepLoadError('Failed to load step');
        }
    }

    async navigateToStepPage(step, index, direction) {
        this.dispatchEvent('steppagenavigate', {
            step: index,
            direction,
            pageUrl: step.pageUrl,
            stepData: step
        });

        window.location.assign(step.pageUrl);
    }

    showStepLoadError(message) {
        const errorEl = document.createElement('div');
        errorEl.className = 'error';
        errorEl.textContent = message;
        this.content.replaceChildren(errorEl);
    }

    async fetchStepContent(step) {
        if (step.loadContent) {
            const res = await fetch(step.loadContent, { credentials: 'same-origin' });
            if (!res.ok) {
                throw new Error(`Failed to load step content: HTTP ${res.status}`);
            }
            return await this.parseRemoteStepPayload(res, step);
        }

        await this.ensureProviderInstance();
        return await this.contentProviderInstance?.getContent(step, this.currentStep);
    }

    async parseRemoteStepPayload(response, step) {
        const typeHeader = String(response.headers.get('content-type') || '').toLowerCase();
        const expectsJson = String(step?.contentType || '').toLowerCase() === 'json'
            || typeHeader.includes('application/json')
            || String(step?.loadContent || '').toLowerCase().endsWith('.json');

        if (!expectsJson) {
            return await response.text();
        }

        const payload = await response.json();
        if (typeof payload === 'string') return payload;
        if (payload && typeof payload.html === 'string') return payload.html;
        return payload;
    }

    createJsonStepForm(step, payload) {
        const form = document.createElement('form');
        form.dataset.step = String(step.id);

        const title = document.createElement('h3');
        title.textContent = String(payload?.title || step.name || `Step ${this.currentStep + 1}`);
        form.appendChild(title);

        const description = String(payload?.description || '').trim();
        if (description) {
            const note = document.createElement('p');
            note.textContent = description;
            form.appendChild(note);
        }

        const fields = Array.isArray(payload?.fields) ? payload.fields : [];
        if (fields.length) {
            fields.forEach((field, index) => {
                const name = String(field?.name || `field_${index + 1}`);
                const labelText = String(field?.label || name);
                const type = String(field?.type || 'text').toLowerCase();
                const value = field?.value == null ? '' : String(field.value);
                const placeholder = field?.placeholder == null ? '' : String(field.placeholder);
                const required = !!field?.required;

                const label = document.createElement('label');
                label.className = 'wizard-json-field';

                const caption = document.createElement('span');
                caption.textContent = labelText;
                label.appendChild(caption);

                let control = null;
                if (type === 'textarea') {
                    control = document.createElement('textarea');
                    control.value = value;
                } else if (type === 'select') {
                    control = document.createElement('select');
                    const options = Array.isArray(field?.options) ? field.options : [];
                    options.forEach((option, optionIndex) => {
                        const normalized = typeof option === 'object' && option
                            ? {
                                value: String(option.value ?? option.label ?? optionIndex),
                                label: String(option.label ?? option.value ?? optionIndex)
                            }
                            : { value: String(option), label: String(option) };
                        const optionEl = document.createElement('option');
                        optionEl.value = normalized.value;
                        optionEl.textContent = normalized.label;
                        if (normalized.value === value) optionEl.selected = true;
                        control.appendChild(optionEl);
                    });
                } else {
                    control = document.createElement('input');
                    control.type = type || 'text';
                    control.value = value;
                }

                control.name = name;
                if (placeholder && 'placeholder' in control) control.placeholder = placeholder;
                if (required) control.required = true;
                label.appendChild(control);
                form.appendChild(label);
            });
            return form;
        }

        const values = payload && typeof payload.values === 'object'
            ? payload.values
            : payload && typeof payload.data === 'object'
                ? payload.data
                : null;
        if (values) {
            const list = document.createElement('ul');
            Object.keys(values).forEach((key) => {
                const item = document.createElement('li');
                const value = values[key] == null ? '' : String(values[key]);
                item.textContent = `${key}: ${value}`;
                list.appendChild(item);
            });
            form.appendChild(list);
            return form;
        }

        const fallback = document.createElement('p');
        fallback.textContent = 'JSON step loaded (no fields declared).';
        form.appendChild(fallback);
        return form;
    }

    async validateCurrentStep() {
        const stepData = this.extractFormData(this.content);
        const step = this.steps[this.currentStep];
        if (!step) return false;

        step.valid = await this.validateStep(stepData, step);
        step.dirty = true;
        this.stepData.set(this.currentStep, { data: stepData, valid: step.valid });

        if (!step.valid) {
            this.showValidationErrors(stepData);
            return false;
        }

        return true;
    }

    async saveStepData(stepIndex) {
        if (this.autoSync && this.stepData.has(stepIndex)) {
            const provider = await this.ensureProviderInstance();
            if (provider?.saveStep) {
                await provider.saveStep(this.steps[stepIndex], this.stepData.get(stepIndex));
            }
        }
    }

    async next() {
        const nextIndex = this.currentStep + 1;
        if (nextIndex >= this.steps.length) {
            return this.complete();
        }
        return await this.loadStep(nextIndex, 1);
    }

    async prev() {
        const prevIndex = Math.max(0, this.currentStep - 1);
        return await this.loadStep(prevIndex, -1);
    }

    async goToStep(index) {
        if (index < 0 || index >= this.steps.length || index > this.currentStep) return false;
        return await this.loadStep(index, 0);
    }

    async complete() {
        const valid = await this.validateCurrentStep();
        if (!valid) return false;

        if (this.autoSync) {
            await this.syncAllSteps();
        }

        this.isComplete = true;
        this.element.classList.add('complete');
        this.dispatchEvent('complete', {
            steps: this.steps.map((_, index) => this.stepData.get(index)?.data)
        });
        return true;
    }

    updateProgress() {
        const count = this.steps.length || 1;
        const percent = ((this.currentStep + 1) / count) * 100;
        this.progress.style.width = `${percent}%`;
        this.progress.setAttribute('aria-valuenow', String(this.currentStep + 1));
        this.progress.setAttribute('aria-valuemax', String(count));
    }

    updateNavState() {
        this.nav.querySelectorAll('.wizard-step').forEach((item, index) => {
            item.classList.toggle('current', index === this.currentStep);
            item.classList.toggle('complete', index <= this.currentStep);
            item.disabled = index > this.currentStep;
        });
    }

    updateFooterState() {
        if (!this.footer) return;
        const prevBtn = this.footer.querySelector('[data-action="prev"]');
        const nextBtn = this.footer.querySelector('[data-action="next"]');
        const completeBtn = this.footer.querySelector('[data-action="complete"]');

        const hasSteps = this.steps.length > 0;
        const isFirst = this.currentStep <= 0;
        const isLast = hasSteps && this.currentStep >= this.steps.length - 1;

        if (prevBtn) prevBtn.disabled = !hasSteps || isFirst;

        if (nextBtn) {
            nextBtn.disabled = !hasSteps || isLast;
            nextBtn.hidden = !hasSteps || isLast;
        }

        if (completeBtn) {
            completeBtn.hidden = !hasSteps || !isLast;
            completeBtn.disabled = !hasSteps || !isLast;
            completeBtn.classList.toggle('hidden', !hasSteps || !isLast);
        }
    }

    bindEvents() {
        this.nav.addEventListener('click', async (e) => {
            const stepBtn = e.target.closest('.wizard-step');
            if (stepBtn) {
                const index = parseInt(stepBtn.dataset.step, 10);
                await this.goToStep(index);
            }
        });

        this.footer.addEventListener('click', async (e) => {
            if (e.target.matches('[data-action="next"]')) {
                await this.next();
            } else if (e.target.matches('[data-action="prev"]')) {
                await this.prev();
            } else if (e.target.matches('[data-action="complete"]')) {
                await this.complete();
            }
        });

        this.content.addEventListener('change', () => {
            if (this.steps[this.currentStep]) {
                this.steps[this.currentStep].dirty = true;
            }
        });
    }

    getContentProviders() {
        return this.container.contentProviders || window.contentProviders || {};
    }

    async resolveDataSource() {
        const dataSource = this.container.dataset.source;
        if (!dataSource) return [];
        await this.ensureProviderInstance();
        if (this.contentProviderInstance?.resolve) {
            return this.contentProviderInstance.resolve(dataSource) || [];
        }

        const source = String(dataSource).trim();
        if (source.startsWith('[') || source.startsWith('{')) {
            try {
                return JSON.parse(source);
            } catch (_error) {
                return [];
            }
        }

        if (source.startsWith('/') || /^https?:\/\//i.test(source)) {
            try {
                const response = await fetch(source, { credentials: 'same-origin' });
                if (!response.ok) return [];
                return await response.json();
            } catch (_error) {
                return [];
            }
        }

        return [];
    }

    async ensureProviderInstance() {
        if (this.contentProviderInstance) return this.contentProviderInstance;

        const providers = this.getContentProviders();
        const providerClass = providers[this.providerName];
        if (!providerClass) return null;

        const context = window.appState || window.pageContext || {};
        this.contentProviderInstance = new providerClass(context);
        await this.contentProviderInstance.init?.();
        return this.contentProviderInstance;
    }

    extractFormData(container) {
        const form = container.querySelector('form');
        if (!form) return {};
        const formData = new FormData(form);
        return Object.fromEntries(formData);
    }

    focusContent() {
        this.content.focus?.();
    }

    async validateStep(stepData, step) {
        return true;
    }

    showValidationErrors(stepData) {}

    async syncAllSteps() {
        const provider = await this.ensureProviderInstance();
        if (provider?.syncAllSteps) {
            await provider.syncAllSteps(this.steps, this.stepData);
        }
    }

    serializeStepData() {
        const output = {};
        this.stepData.forEach((value, key) => {
            output[String(key)] = value;
        });
        return output;
    }

    getBindableState() {
        return {
            currentStep: this.currentStep,
            isComplete: this.isComplete,
            stepData: this.serializeStepData()
        };
    }

    applyBindableState(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return;
        const step = Number(snapshot.currentStep);
        if (!Number.isInteger(step)) return;
        if (step < 0 || step >= this.steps.length) return;
        if (step === this.currentStep) return;
        void this.goToStep(step);
    }

    destroy() {
        this.loaderState?.destroy?.();
        this.stateBinding?.disconnect?.();
        super.destroy();
    }
}

if (typeof window !== 'undefined') {
    window.WizardComponent = WizardComponent;
}

export { WizardComponent };
