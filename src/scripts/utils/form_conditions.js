const CONDITION_PATTERN = /^@\{([\s\S]*)\}$/;

const normalizeConditionExpression = (expression = '') => {
    return String(expression || '')
        .trim()
        .replace(CONDITION_PATTERN, (_match, inner) => String(inner || '').trim())
        .replace(/\s*===\s*/g, ' eq ')
        .replace(/\s*!==\s*/g, ' ne ')
        .replace(/\s*>=\s*/g, ' gteq ')
        .replace(/\s*<=\s*/g, ' lteq ')
        .replace(/\s*>\s*/g, ' gt ')
        .replace(/\s*<\s*/g, ' lt ')
        .replace(/\s*&&\s*/g, ' and ')
        .replace(/\s*\|\|\s*/g, ' or ');
};

const tokenizeCondition = (expression = '') => {
    const tokens = [];
    const pattern = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|[()]|\S+/g;
    let match = pattern.exec(expression);
    while (match) {
        tokens.push(match[0]);
        match = pattern.exec(expression);
    }
    return tokens;
};

const isPath = (token = '') => {
    return /^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*|\.\d+)*$/.test(token);
};

const readPath = (source, path = '') => {
    if (!isPath(path)) return undefined;
    return String(path).split('.').reduce((value, key) => {
        if (value == null) return undefined;
        return value[key];
    }, source);
};

const parseLiteral = (token, context = {}) => {
    const raw = String(token || '').trim();
    if (!raw) return '';
    if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
        return raw.slice(1, -1).replace(/\\(['"])/g, '$1');
    }
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    const value = readPath(context, raw);
    return value === undefined ? raw : value;
};

const compareValues = (left, operator, right) => {
    const numericLeft = Number(left);
    const numericRight = Number(right);
    const bothNumeric = left !== '' && right !== '' && !Number.isNaN(numericLeft) && !Number.isNaN(numericRight);
    const a = bothNumeric ? numericLeft : String(left ?? '').toLowerCase();
    const b = bothNumeric ? numericRight : String(right ?? '').toLowerCase();

    if (operator === 'eq') return a === b;
    if (operator === 'ne') return a !== b;
    if (operator === 'gt') return a > b;
    if (operator === 'lt') return a < b;
    if (operator === 'gteq') return a >= b;
    if (operator === 'lteq') return a <= b;
    if (operator === 'contains') return String(left ?? '').includes(String(right ?? ''));
    return false;
};

const evaluateComparison = (tokens, context = {}) => {
    if (!tokens.length) return true;
    if (tokens.length === 1) return !!parseLiteral(tokens[0], context);
    if (tokens.length < 3) return false;
    return compareValues(
        parseLiteral(tokens[0], context),
        String(tokens[1] || '').toLowerCase(),
        parseLiteral(tokens.slice(2).join(' '), context)
    );
};

const evaluateFlatCondition = (tokens, context = {}) => {
    const groups = [];
    const connectors = [];
    let current = [];

    tokens.forEach((token) => {
        const normalized = String(token || '').toLowerCase();
        if (normalized === 'and' || normalized === 'or') {
            groups.push(current);
            connectors.push(normalized);
            current = [];
            return;
        }
        current.push(token);
    });
    groups.push(current);

    let result = evaluateComparison(groups[0] || [], context);
    connectors.forEach((connector, index) => {
        const next = evaluateComparison(groups[index + 1] || [], context);
        result = connector === 'and' ? result && next : result || next;
    });
    return result;
};

const evaluateHoliCondition = (condition = '', context = {}) => {
    const normalized = normalizeConditionExpression(condition);
    if (!normalized) return true;

    const EngineClass = typeof window !== 'undefined'
        ? window.ELEngine
        : null;
    if (EngineClass) {
        try {
            return !!new EngineClass(context).evaluate(normalized);
        } catch (_error) {}
    }

    return evaluateFlatCondition(tokenizeCondition(normalized), context);
};

const getConditionFields = (condition = '') => {
    const normalized = normalizeConditionExpression(condition);
    if (!normalized) return [];
    const reserved = new Set(['and', 'or', 'eq', 'ne', 'gt', 'lt', 'gteq', 'lteq', 'contains', 'true', 'false', 'null']);
    const fields = new Set();
    tokenizeCondition(normalized).forEach((token) => {
        const value = String(token || '').trim();
        if (!isPath(value)) return;
        if (reserved.has(value.toLowerCase())) return;
        fields.add(value.split('.')[0]);
    });
    return Array.from(fields);
};

export {
    evaluateHoliCondition,
    getConditionFields,
    normalizeConditionExpression
};
