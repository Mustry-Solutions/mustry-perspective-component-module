import { csvCell } from '../../shared/csv';

describe('csvCell', () => {
    it('leaves ordinary text alone', () => {
        expect(csvCell('hello')).toBe('hello');
        expect(csvCell('42')).toBe('42');
    });

    it('does not formula-guard plain signed / scientific numbers', () => {
        expect(csvCell('-5')).toBe('-5');
        expect(csvCell('+3.2')).toBe('+3.2');
        // comma still triggers RFC-4180 quoting, but no leading apostrophe
        expect(csvCell('-1,234.56')).toBe('"-1,234.56"');
        expect(csvCell('1e-5')).toBe('1e-5');
        expect(csvCell('-2.5E+3')).toBe('-2.5E+3');
    });

    it('still guards formula-looking cells that are not plain numbers', () => {
        expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
        expect(csvCell('@cmd')).toBe("'@cmd");
        expect(csvCell('-run')).toBe("'-run");
        expect(csvCell('+cmd')).toBe("'+cmd");
        expect(csvCell('\tTAB')).toBe("'\tTAB");
        expect(csvCell('-')).toBe("'-");
        expect(csvCell('+')).toBe("'+");
        expect(csvCell('-5abc')).toBe("'-5abc");
    });

    it('RFC-4180-quotes cells that need it, after the guard', () => {
        expect(csvCell('a,b')).toBe('"a,b"');
        expect(csvCell('say "hi"')).toBe('"say ""hi"""');
        expect(csvCell('=A1,"x"')).toBe("\"'=A1,\"\"x\"\"\"");
    });
});
