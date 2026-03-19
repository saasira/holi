(function () {
    const STORAGE_PREFIX = 'holi:wizard:workflow:';
    const DEFAULT_WORKFLOW_ID = 'demo-checkout';
    const PROVIDER_NAME = 'workflowPages';
    const SOURCE_EXPR = '@{wizard.checkout}';

    const STEP_DEFS = [
        { id: 'patient', name: 'Patient', slug: 'patient' },
        { id: 'address', name: 'Address', slug: 'address' },
        { id: 'payment', name: 'Payment', slug: 'payment' },
        { id: 'review', name: 'Review', slug: 'review' }
    ];

    const clone = (value) => JSON.parse(JSON.stringify(value || {}));

    const getStepById = (stepId) => STEP_DEFS.find((step) => step.id === stepId) || STEP_DEFS[0];

    const getWorkflowId = (fallback = DEFAULT_WORKFLOW_ID) => {
        const params = new URLSearchParams(window.location.search);
        const urlValue = params.get('wf');
        return (urlValue && urlValue.trim()) || fallback;
    };

    const ensureWorkflowQuery = (workflowId) => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('wf')) return;
        params.set('wf', workflowId);
        const next = `${window.location.pathname}?${params.toString()}${window.location.hash || ''}`;
        window.history.replaceState(window.history.state, '', next);
    };

    const storageKey = (workflowId) => `${STORAGE_PREFIX}${workflowId}`;

    const readState = (workflowId) => {
        const raw = window.localStorage.getItem(storageKey(workflowId));
        if (!raw) return { currentStepId: 'patient', stepData: {} };
        try {
            const parsed = JSON.parse(raw);
            return {
                currentStepId: String(parsed.currentStepId || 'patient'),
                stepData: parsed.stepData && typeof parsed.stepData === 'object' ? parsed.stepData : {}
            };
        } catch (_error) {
            return { currentStepId: 'patient', stepData: {} };
        }
    };

    const writeState = (workflowId, state) => {
        window.localStorage.setItem(storageKey(workflowId), JSON.stringify(state));
    };

    const saveStepData = (workflowId, stepId, data) => {
        const state = readState(workflowId);
        state.currentStepId = stepId;
        state.stepData[stepId] = clone(data);
        writeState(workflowId, state);
    };

    const markCurrentStep = (workflowId, stepId) => {
        const state = readState(workflowId);
        state.currentStepId = stepId;
        writeState(workflowId, state);
    };

    const buildSteps = (workflowId) => {
        return STEP_DEFS.map((step) => ({
            id: step.id,
            name: step.name,
            pageUrl: `/examples/pages/wizard/${step.slug}.html?wf=${encodeURIComponent(workflowId)}`
        }));
    };

    const createField = (labelText, name, value, placeholder) => {
        const wrap = document.createElement('label');
        wrap.className = 'wizard-field';
        const title = document.createElement('span');
        title.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'text';
        input.name = name;
        input.value = value || '';
        input.placeholder = placeholder || '';
        wrap.append(title, input);
        return wrap;
    };

    const createReviewSummary = (workflowId) => {
        const state = readState(workflowId);
        const root = document.createElement('div');
        root.className = 'wizard-summary';

        STEP_DEFS.forEach((step) => {
            const block = document.createElement('section');
            const heading = document.createElement('h4');
            heading.textContent = step.name;
            block.appendChild(heading);

            const values = state.stepData[step.id] || {};
            const keys = Object.keys(values);
            if (!keys.length) {
                const empty = document.createElement('p');
                empty.textContent = 'No data captured yet.';
                block.appendChild(empty);
            } else {
                const list = document.createElement('ul');
                keys.forEach((key) => {
                    const item = document.createElement('li');
                    item.textContent = `${key}: ${values[key]}`;
                    list.appendChild(item);
                });
                block.appendChild(list);
            }

            root.appendChild(block);
        });

        return root;
    };

    const createStepForm = (step, workflowId) => {
        const state = readState(workflowId);
        const values = state.stepData[step.id] || {};
        const form = document.createElement('form');
        form.setAttribute('data-step-id', step.id);
        form.className = 'wizard-form';

        const title = document.createElement('h3');
        title.textContent = step.name;
        form.appendChild(title);

        if (step.id === 'patient') {
            form.append(
                createField('First Name', 'firstName', values.firstName, 'Taylor'),
                createField('Last Name', 'lastName', values.lastName, 'Mason'),
                createField('Email', 'email', values.email, 'taylor@example.com')
            );
        } else if (step.id === 'address') {
            form.append(
                createField('Street', 'street', values.street, '123 Main St'),
                createField('City', 'city', values.city, 'Springfield'),
                createField('Zip', 'zip', values.zip, '90210')
            );
        } else if (step.id === 'payment') {
            form.append(
                createField('Card Name', 'cardName', values.cardName, 'Taylor Mason'),
                createField('Card Last 4', 'cardLast4', values.cardLast4, '4242'),
                createField('Billing Zip', 'billingZip', values.billingZip, '90210')
            );
        } else {
            const summaryNote = document.createElement('p');
            summaryNote.textContent = 'Review all previously captured values before completing.';
            form.appendChild(summaryNote);
            form.appendChild(createReviewSummary(workflowId));
        }

        return form;
    };

    class WorkflowPagesProvider {
        async resolve(expression) {
            if (expression !== SOURCE_EXPR) return [];
            const workflowId = getWorkflowId();
            return buildSteps(workflowId);
        }

        async getContent(step) {
            const workflowId = getWorkflowId();
            return createStepForm(step, workflowId);
        }

        async saveStep(step, payload) {
            const workflowId = getWorkflowId();
            const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
            saveStepData(workflowId, step.id, data);
        }

        async syncAllSteps(_steps, _stepData) {
            const workflowId = getWorkflowId();
            const state = readState(workflowId);
            state.completedAt = new Date().toISOString();
            writeState(workflowId, state);
        }
    }

    window.contentProviders = window.contentProviders || {};
    window.contentProviders[PROVIDER_NAME] = WorkflowPagesProvider;

    const attachLog = (logEl, text) => {
        if (!logEl) return;
        logEl.textContent = `${text}\n${logEl.textContent || ''}`;
    };

    const init = ({ wizardId, stepId, workflowIdElId, logId } = {}) => {
        const wizardEl = document.getElementById(wizardId || 'checkout-wizard');
        if (!wizardEl) return;

        const step = getStepById(stepId || 'patient');
        const workflowId = getWorkflowId();
        ensureWorkflowQuery(workflowId);
        markCurrentStep(workflowId, step.id);

        wizardEl.setAttribute('data-workflow-id', workflowId);

        const workflowIdEl = document.getElementById(workflowIdElId || 'workflow-id');
        if (workflowIdEl) workflowIdEl.textContent = workflowId;

        const logEl = document.getElementById(logId || 'workflow-log');
        attachLog(logEl, `loaded step "${step.id}"`);

        wizardEl.addEventListener('steppagenavigate', (event) => {
            const url = event?.detail?.pageUrl || '';
            attachLog(logEl, `navigate -> ${url}`);
        });

        wizardEl.addEventListener('stepchange', (event) => {
            const detail = event.detail || {};
            const nextStep = STEP_DEFS[detail.step]?.id || detail.step;
            markCurrentStep(workflowId, String(nextStep));
            attachLog(logEl, `stepchange -> ${nextStep}`);
        });

        wizardEl.addEventListener('complete', () => {
            attachLog(logEl, 'workflow complete');
        });
    };

    window.WizardWorkflowExample = {
        init,
        getWorkflowId,
        readState
    };
})();
