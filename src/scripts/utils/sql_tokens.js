/**
 * A small SQL tokenizer for highlighting and parameter discovery: no DOM, no parsing, only the lexical classes an editor colours.
 *
 * Token types: comment, string, identifier (double-quoted), number, param (`:name`), keyword, function, word, operator, space.
 * The tokens cover the whole text, end to end, so concatenating them gives the text back.
 */

export const SQL_KEYWORDS = new Set((
    'ALL ALTER AND ANY AS ASC BETWEEN BY CASE CAST CREATE CROSS CURRENT DEFAULT DELETE DESC DISTINCT DROP ELSE END ESCAPE EXCEPT EXISTS FETCH FILTER ' +
    'FIRST FOLLOWING FOR FROM FULL GROUP HAVING ILIKE IN INNER INSERT INTERSECT INTERVAL INTO IS JOIN LAST LATERAL LEFT LIKE LIMIT NATURAL NOT NULL ' +
    'NULLS OFFSET ON OR ORDER OUTER OVER PARTITION PRECEDING RANGE RECURSIVE RIGHT ROW ROWS SELECT SET SOME TABLE THEN TO UNBOUNDED UNION UNIQUE ' +
    'UPDATE USING VALUES VIEW WHEN WHERE WINDOW WITH TRUE FALSE EXPLAIN ANALYZE'
).split(' '));

export const SQL_FUNCTIONS = [
    'AVG', 'COUNT', 'MAX', 'MIN', 'SUM', 'COALESCE', 'NULLIF', 'ABS', 'ROUND', 'FLOOR', 'CEIL', 'LOWER', 'UPPER', 'LENGTH', 'SUBSTRING', 'TRIM',
    'CONCAT', 'REPLACE', 'NOW', 'DATE_TRUNC', 'EXTRACT', 'TO_CHAR', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE',
    'PERCENTILE_CONT', 'STRING_AGG', 'ARRAY_AGG'
];

const FUNCTION_NAMES = new Set(SQL_FUNCTIONS);

const RULES = [
    ['comment', /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y],
    ['string', /'(?:[^']|'')*(?:'|$)/y],
    ['identifier', /"(?:[^"]|"")*(?:"|$)/y],
    ['operator', /::/y],
    ['param', /:[A-Za-z_][A-Za-z0-9_]*/y],
    ['number', /\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y],
    ['word', /[A-Za-z_][A-Za-z0-9_$]*/y],
    ['space', /\s+/y],
    ['operator', /[\s\S]/y]
];

/** Splits the text into tokens `{ type, text, start, end }` that together cover it. */
export function tokenize(sql) {
    const text = String(sql ?? '');
    const tokens = [];
    let pos = 0;
    while (pos < text.length) {
        for (const [type, pattern] of RULES) {
            pattern.lastIndex = pos;
            const match = pattern.exec(text);
            if (!match) continue;
            tokens.push({ type, text: match[0], start: pos, end: pos + match[0].length });
            pos += match[0].length;
            break;
        }
    }
    classifyWords(tokens);
    return tokens;
}

/** A word is a keyword, a function (a known name, or any word straight before an opening bracket), or a plain word. */
function classifyWords(tokens) {
    tokens.forEach((token, i) => {
        if (token.type !== 'word') return;
        const upper = token.text.toUpperCase();
        const next = tokens[i + 1];
        const callLike = next && next.type === 'operator' && next.text === '(';
        if (FUNCTION_NAMES.has(upper) && callLike) token.type = 'function';
        else if (SQL_KEYWORDS.has(upper)) token.type = 'keyword';
        else if (callLike) token.type = 'function';
    });
}

/** The distinct `:name` parameters in the text, in order of first use; not those inside strings or comments, not `::` casts. */
export function parameterNames(sql) {
    const seen = new Set();
    tokenize(sql).forEach((token) => {
        if (token.type === 'param') seen.add(token.text.slice(1));
    });
    return Array.from(seen);
}
