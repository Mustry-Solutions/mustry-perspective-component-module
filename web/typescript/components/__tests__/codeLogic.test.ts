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
