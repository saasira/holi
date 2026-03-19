(function initValidatorExamples() {
    window.appState = {
        ...(window.appState || {}),
        policy: {
            minlen: 10
        }
    };

    const policyLen = document.getElementById('policy-len');
    if (policyLen) {
        policyLen.textContent = String(window.appState.policy.minlen);
    }

    if (window.Component && typeof window.Component.registerValidator === 'function') {
        window.Component.registerValidator('india-phone', (value) => {
            const normalized = String(value || '').replace(/[\s-]/g, '');
            return /^(\+91)?[6-9]\d{9}$/.test(normalized);
        });

        window.Component.registerValidator('gst', (value) => {
            const normalized = String(value || '').trim().toUpperCase();
            if (!normalized) return true;
            return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[A-Z0-9]$/.test(normalized);
        });
    }

    const logEl = document.getElementById('validation-log');
    const validateButton = document.getElementById('btn-validate-all');
    if (!logEl || !validateButton) return;

    function appendLog(valid, message) {
        const item = document.createElement('li');
        item.className = valid ? 'pass' : 'fail';
        item.textContent = `${valid ? 'PASS' : 'FAIL'}: ${message}`;
        logEl.appendChild(item);
    }

    function clearLog() {
        logEl.replaceChildren();
    }

    function validateAll() {
        clearLog();
        const inputs = document.querySelectorAll('input[data-validator], input[data-validators]');
        let allValid = true;

        inputs.forEach((input, index) => {
            const result = window.Validator.validateElement(input);
            const label = input.closest('label')?.textContent?.trim()?.split('\n')[0] || `Input ${index + 1}`;
            appendLog(result.valid, result.valid ? `${label} is valid.` : `${label} failed - ${result.message}`);
            if (!result.valid) allValid = false;
        });

        appendLog(allValid, allValid ? 'All validators passed.' : 'One or more validators failed.');
    }

    validateButton.addEventListener('click', validateAll);
})();
