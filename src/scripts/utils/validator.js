class Validator {
    static customValidators = new Map();
    static nativeValidationBound = false;
    static boundElements = new WeakSet();

    static builtInValidators = new Map([
        ['required', (value) => {
            const text = value == null ? '' : String(value);
            const valid = text.trim().length > 0;
            return { valid, message: valid ? '' : 'This field is required.' };
        }],
        ['email', (value) => {
            const text = value == null ? '' : String(value).trim();
            const valid = !text || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
            return { valid, message: valid ? '' : 'Enter a valid email address.' };
        }],
        ['eq', (value, resolvedParam) => {
            const left = value == null ? '' : String(value);
            const right = resolvedParam == null ? '' : String(resolvedParam);
            const valid = left === right;
            return { valid, message: valid ? '' : 'Values do not match.' };
        }],
        ['minlength', (value, param) => {
            const text = value == null ? '' : String(value);
            const min = Number(param);
            if (!Number.isFinite(min)) return { valid: true, message: '' };
            const valid = text.length >= min;
            return { valid, message: valid ? '' : `Minimum length is ${min}.` };
        }],
        ['maxlength', (value, param) => {
            const text = value == null ? '' : String(value);
            const max = Number(param);
            if (!Number.isFinite(max)) return { valid: true, message: '' };
            const valid = text.length <= max;
            return { valid, message: valid ? '' : `Maximum length is ${max}.` };
        }],
        ['pattern', (value, param) => {
            const text = value == null ? '' : String(value);
            const source = String(param || '').trim();
            if (!source) return { valid: true, message: '' };
            try {
                const regex = new RegExp(source);
                const valid = regex.test(text);
                return { valid, message: valid ? '' : 'Value does not match expected pattern.' };
            } catch (_error) {
                return { valid: true, message: '' };
            }
        }]
    ]);

    static aliases = new Map([
        ['required', 'required'],
        ['email', 'email'],
        ['eq', 'eq'],
        ['equals', 'eq'],
        ['pattern', 'pattern'],
        ['minlength', 'minlength'],
        ['min-length', 'minlength'],
        ['min_length', 'minlength'],
        ['maxlength', 'maxlength'],
        ['max-length', 'maxlength'],
        ['max_length', 'maxlength']
    ]);

    static normalizeName(name) {
        const normalized = String(name || '').trim().toLowerCase();
        if (!normalized) return '';
        return this.aliases.get(normalized) || normalized;
    }

    static parseToken(token) {
        const raw = String(token || '').trim();
        if (!raw) return { name: '', param: '' };
        const firstColon = raw.indexOf(':');
        if (firstColon === -1) {
            return {
                name: this.normalizeName(raw),
                param: ''
            };
        }
        return {
            name: this.normalizeName(raw.slice(0, firstColon)),
            param: raw.slice(firstColon + 1).trim()
        };
    }

    static parseList(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) {
            return raw.map((token) => String(token || '').trim()).filter(Boolean);
        }
        return String(raw)
            .split(/[,\s]+/g)
            .map((token) => token.trim())
            .filter(Boolean);
    }

    static resolveListFromElement(element) {
        if (!element || !element.getAttribute) return [];
        const singular = element.getAttribute('data-validator');
        const plural = element.getAttribute('data-validators');
        return this.parseList(singular || plural || '');
    }

    static register(name, fn) {
        const normalizedName = this.normalizeName(name);
        if (!normalizedName) throw new Error('Validator name is required');
        if (typeof fn !== 'function') throw new Error('Validator must be a function');

        try {
            const sample = fn('test', undefined, {});
            const ok = typeof sample === 'boolean'
                || (sample && typeof sample === 'object' && typeof sample.valid === 'boolean');
            if (!ok) {
                throw new Error('Validator must return boolean or { valid, message }');
            }
        } catch (error) {
            throw new Error(`Invalid validator "${normalizedName}": ${error.message || error}`);
        }

        this.customValidators.set(normalizedName, fn);
    }

    static unregister(name) {
        const normalizedName = this.normalizeName(name);
        if (!normalizedName) return false;
        return this.customValidators.delete(normalizedName);
    }

    static validateToken(token, value, context = {}) {
        const { name, param } = this.parseToken(token);
        if (!name) return { valid: true, message: '', token: '' };

        const validator = this.customValidators.get(name) || this.builtInValidators.get(name);
        if (!validator) return { valid: true, message: '', token: name };

        const fullContext = this.buildValidationContext(context);
        const resolvedParam = this.resolveParam(param, fullContext);

        try {
            const next = validator(value, resolvedParam, fullContext);
            if (typeof next === 'boolean') {
                return {
                    valid: next,
                    message: next ? '' : 'Invalid value.',
                    token: name
                };
            }
            if (next && typeof next === 'object' && typeof next.valid === 'boolean') {
                return {
                    valid: next.valid,
                    message: next.valid ? '' : String(next.message || 'Invalid value.'),
                    token: name
                };
            }
            return {
                valid: false,
                message: `Validator "${name}" returned invalid result.`,
                token: name
            };
        } catch (_error) {
            return {
                valid: false,
                message: `Validator "${name}" failed.`,
                token: name
            };
        }
    }

    static validateValue(value, validators = [], context = {}) {
        const list = this.parseList(validators);
        for (let i = 0; i < list.length; i += 1) {
            const result = this.validateToken(list[i], value, context);
            if (!result.valid) return result;
        }
        return { valid: true, message: '', token: '' };
    }

    static validateElement(element, context = {}) {
        if (!element || typeof element.value === 'undefined') {
            return { valid: true, message: '', token: '' };
        }
        const validators = this.resolveListFromElement(element);
        const result = this.validateValue(element.value, validators, {
            element,
            ...context
        });

        if (typeof element.setCustomValidity === 'function') {
            element.setCustomValidity(result.valid ? '' : result.message);
        }
        element.setAttribute('aria-invalid', result.valid ? 'false' : 'true');
        if (result.valid) {
            element.removeAttribute('data-validation-error');
        } else {
            element.setAttribute('data-validation-error', result.message || 'Invalid value.');
        }
        return result;
    }

    static bindNative(root = document) {
        if (!root || !root.querySelectorAll) return;
        const elements = root.querySelectorAll('[data-validator], [data-validators]');
        elements.forEach((element) => {
            if (!(element instanceof HTMLElement) || this.boundElements.has(element)) return;
            const run = () => this.validateElement(element);
            element.addEventListener('input', run);
            element.addEventListener('change', run);
            element.addEventListener('blur', run);
            this.boundElements.add(element);
            run();
        });
    }

    static enableAutoBind() {
        if (this.nativeValidationBound || typeof document === 'undefined') return;
        this.nativeValidationBound = true;
        const bind = () => this.bindNative(document);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bind, { once: true });
        } else {
            bind();
        }
    }

    static buildValidationContext(context = {}) {
        const base = {
            ...(typeof window !== 'undefined' ? (window.appState || {}) : {}),
            ...(typeof window !== 'undefined' ? (window.pageContext || {}) : {})
        };

        const element = context.element;
        const doc = typeof document !== 'undefined' ? document : null;
        const scopeRoot = element?.closest?.('form') || doc;
        const model = this.readModelState(scopeRoot);

        return {
            ...base,
            ...model,
            model,
            ...context
        };
    }

    static readModelState(root) {
        const model = {};
        if (!root || !root.querySelectorAll) return model;
        const nodes = root.querySelectorAll('[data-model]');
        nodes.forEach((node) => {
            const path = String(node.getAttribute('data-model') || '').trim();
            if (!path) return;
            this.setPathValue(model, path, node.value);
        });
        return model;
    }

    static setPathValue(target, pathExpr, value) {
        const path = String(pathExpr || '').replace(/\[(\w+)\]/g, '.$1').split('.').filter(Boolean);
        if (!path.length) return;
        let cursor = target;
        for (let i = 0; i < path.length - 1; i += 1) {
            const key = path[i];
            if (cursor[key] == null || typeof cursor[key] !== 'object') cursor[key] = {};
            cursor = cursor[key];
        }
        cursor[path[path.length - 1]] = value;
    }

    static getPathValue(source, pathExpr) {
        if (!source || !pathExpr) return undefined;
        const path = String(pathExpr).replace(/\[(\w+)\]/g, '.$1');
        if (!/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*|\.\d+)*$/.test(path)) return undefined;
        return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), source);
    }

    static resolveParam(param, context = {}) {
        const raw = String(param || '').trim();
        if (!raw) return raw;

        const exprMatch = raw.match(/^@\{(.+)\}$/);
        if (exprMatch) {
            const expression = exprMatch[1].trim();
            try {
                const EngineClass = (typeof window !== 'undefined' && window.ELEngine)
                    || (typeof ELEngine !== 'undefined' ? ELEngine : null);
                if (EngineClass) {
                    const engine = new EngineClass(context);
                    return engine.evaluate(expression);
                }
            } catch (_error) {}
            return this.getPathValue(context, expression);
        }

        if (/^(true|false)$/i.test(raw)) return raw.toLowerCase() === 'true';
        if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
        if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
            return raw.slice(1, -1);
        }

        if (/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*|\[\w+\])*$/.test(raw)) {
            const resolved = this.getPathValue(context, raw);
            if (typeof resolved !== 'undefined') return resolved;
        }

        return raw;
    }
}

if (typeof window !== 'undefined') {
    window.Validator = Validator;
}

export { Validator };
