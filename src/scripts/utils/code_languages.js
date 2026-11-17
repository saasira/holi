/**
 * The languages a code editor can colour and complete, registered by name: the editor knows no language of its own.
 *
 * A language is an object:
 * - `tokenize(text)` (required) returns the text split into tokens `{ type, text, start, end }` that together cover it, in order. A token's `type` becomes the
 *   class `holi-code-<type>` on its text. The types the stylesheet colours are comment, string, identifier, number, keyword, function, type, literal, variable,
 *   property and param; any other type (say space, word, operator) is left plain, and a language may use its own types and style them itself.
 * - `comment` (optional) is the prefix of a line comment, which Ctrl+/ puts on and takes off lines.
 * - `suggest(context)` (optional) returns completions `[{ label, kind }]`. The context is `{ text, caret, prefix, qualifier, force, tokens, data }`: the word before
 *   the caret, the name before a dot in front of it, whether Ctrl+Space asked, the tokens of the text, and `data`, whatever the page gave the editor with
 *   `setData()` (a database schema, say). The editor never asks inside a string or comment.
 * - `minPrefix` (optional, default 2) is how many letters of a word are typed before suggestions appear unasked.
 *
 * ```js
 * Holi.CodeLanguages.register('lua', { comment: '--', tokenize(text) { ... }, suggest(context) { ... } });
 * ```
 *
 * A language registered after an editor of that language is drawn colours it at once: the editors listen.
 */

const languages = new Map();
const listeners = new Set();

const keyOf = (name) => String(name || '').trim().toLowerCase();

export const CodeLanguages = {
    register(name, language) {
        const key = keyOf(name);
        if (!key) throw new Error('A code language needs a name');
        if (!language || typeof language.tokenize !== 'function') throw new Error(`The code language "${name}" needs a tokenize(text) function`);
        languages.set(key, language);
        listeners.forEach((listener) => listener(key));
    },

    get(name) {
        return languages.get(keyOf(name)) || null;
    },

    has(name) {
        return languages.has(keyOf(name));
    },

    names() {
        return Array.from(languages.keys());
    },

    /** Calls {@code listener(name)} whenever a language is registered; returns the function that stops it. */
    onRegister(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }
};
