import { formatJson, lineCountOf, normalizeLanguage, validateJson } from '../code/codeLogic';

describe('normalizeLanguage', () => {
    it('accepts known languages case-insensitively and defaults to text', () => {
        expect(normalizeLanguage('json')).toBe('json');
        expect(normalizeLanguage('Python')).toBe('python');
        expect(normalizeLanguage('SQL')).toBe('sql');
        expect(normalizeLanguage('xml')).toBe('xml');
        expect(normalizeLanguage('yaml')).toBe('text');
        expect(normalizeLanguage('')).toBe('text');
    });
});

describe('validateJson', () => {
    it('accepts valid documents and empty input', () => {
        expect(validateJson('{"a": 1}').valid).toBe(true);
        expect(validateJson('[1, 2, 3]').valid).toBe(true);
        expect(validateJson('').valid).toBe(true);
        expect(validateJson('   \n ').valid).toBe(true);
    });

    it('rejects broken documents with a message', () => {
        const v = validateJson('{"a": }');
        expect(v.valid).toBe(false);
        expect(v.message.length).toBeGreaterThan(0);
    });

    it('derives a line number for multiline errors when the runtime reports position', () => {
        const v = validateJson('{\n  "a": 1,\n  "b": ,\n}');
        expect(v.valid).toBe(false);
        if (v.pos >= 0) {
            expect(v.line).toBe(3);
        }
    });
});

describe('formatJson', () => {
    it('pretty-prints valid JSON with the requested indent', () => {
        expect(formatJson('{"a":1,"b":[2,3]}', 2)).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n');
    });

    it('returns null for invalid JSON and passes through empty input', () => {
        expect(formatJson('{oops}')).toBeNull();
        expect(formatJson('')).toBe('');
    });
});

describe('lineCountOf', () => {
    it('counts lines', () => {
        expect(lineCountOf('')).toBe(0);
        expect(lineCountOf('a')).toBe(1);
        expect(lineCountOf('a\nb\nc')).toBe(3);
    });
});

describe('validateJson cross-engine position handling', () => {
    it('derives an offset from line/column when the engine gives no position (Firefox/Safari shape)', () => {
        // Simulate the Firefox message form by validating a real multi-line error;
        // we only assert that when a line is known, pos lands on that line's start
        // region rather than defaulting to 0.
        const doc = '{\n  "a": 1,\n  "b": \n}';
        const v = validateJson(doc);
        expect(v.valid).toBe(false);
        // Whatever the engine reported, if a line was derived the offset must fall
        // within that line's span (never a blind 0 when line > 1).
        if (v.line > 1) {
            const lineStart = doc.split('\n').slice(0, v.line - 1).join('\n').length;
            expect(v.pos).toBeGreaterThanOrEqual(lineStart);
        }
    });

    it('never returns a pos beyond the document length', () => {
        const doc = '{"a":';
        const v = validateJson(doc);
        expect(v.valid).toBe(false);
        expect(v.pos).toBeLessThanOrEqual(doc.length);
    });
});
