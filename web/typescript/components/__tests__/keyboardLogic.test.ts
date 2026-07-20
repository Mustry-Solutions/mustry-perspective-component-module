import {
    applyKey, clampValue, formatValue, inRange, KeypadOpts, parseDraft, valueToDraft
} from '../keyboard/keyboardLogic';

const opts = (o: Partial<KeypadOpts> = {}): KeypadOpts => ({ decimals: 2, allowNegative: true, ...o });

// Tap a sequence of keys onto a starting draft.
const type = (start: string, keys: string, o = opts()): string =>
    keys.split('').reduce((d, k) => applyKey(d, k as any, o), start);

describe('applyKey — digits & leading zeros', () => {
    it('builds a number from digits', () => {
        expect(type('', '123')).toBe('123');
    });
    it('a bare 0 is replaced by the next non-zero digit', () => {
        expect(applyKey('0', '5', opts())).toBe('5');
        expect(applyKey('0', '0', opts())).toBe('0');   // stays 0
    });
    it('keeps the sign when replacing a leading zero', () => {
        expect(applyKey('-0', '7', opts())).toBe('-7');
    });
});

describe('applyKey — decimal point', () => {
    it('adds one decimal point and prefixes 0 when empty', () => {
        expect(applyKey('', '.', opts())).toBe('0.');
        expect(applyKey('12', '.', opts())).toBe('12.');
    });
    it('ignores a second decimal point', () => {
        expect(applyKey('1.2', '.', opts())).toBe('1.2');
    });
    it('caps fractional digits at `decimals` and ignores the point when decimals=0', () => {
        expect(type('', '1.234')).toBe('1.23');          // decimals: 2
        expect(applyKey('5', '.', opts({ decimals: 0 }))).toBe('5');
        expect(type('', '12.5', opts({ decimals: 0 }))).toBe('125'); // '.' inert
    });
});

describe('applyKey — sign, backspace, clear', () => {
    it('toggles sign only when allowed', () => {
        expect(applyKey('42', 'sign', opts())).toBe('-42');
        expect(applyKey('-42', 'sign', opts())).toBe('42');
        expect(applyKey('42', 'sign', opts({ allowNegative: false }))).toBe('42');
    });
    it('sign on empty gives a lone minus, ready for digits', () => {
        expect(applyKey('', 'sign', opts())).toBe('-');
        expect(applyKey(applyKey('', 'sign', opts()), '9', opts())).toBe('-9');
    });
    it('ignores an unknown key', () => {
        expect(applyKey('12', 'x' as any, opts())).toBe('12');
    });
    it('backspace removes the last char, down to empty', () => {
        expect(applyKey('12.', 'backspace', opts())).toBe('12');
        expect(applyKey('-', 'backspace', opts())).toBe('');
    });
    it('clear empties the draft', () => {
        expect(applyKey('-12.5', 'clear', opts())).toBe('');
    });
});

describe('parseDraft', () => {
    it('parses complete numbers', () => {
        expect(parseDraft('12.5')).toBe(12.5);
        expect(parseDraft('-3')).toBe(-3);
        expect(parseDraft('0')).toBe(0);
    });
    it('returns null for incomplete drafts', () => {
        ['', '-', '.', '-.'].forEach((d) => expect(parseDraft(d)).toBeNull());
    });
});

describe('clamp / inRange', () => {
    it('clamps to bounds and treats null as unbounded', () => {
        expect(clampValue(150, 0, 100)).toBe(100);
        expect(clampValue(-5, 0, 100)).toBe(0);
        expect(clampValue(50, null, null)).toBe(50);
    });
    it('inRange reflects the bounds', () => {
        expect(inRange(50, 0, 100)).toBe(true);
        expect(inRange(150, 0, 100)).toBe(false);
        expect(inRange(-1, 0, null)).toBe(false);
    });
});

describe('formatValue / valueToDraft', () => {
    it('formats with fixed decimals + optional units', () => {
        expect(formatValue(12.5, 2, '')).toBe('12.50');
        expect(formatValue(12.5, 2, 'psi')).toBe('12.50 psi');
        expect(formatValue(12.5, 0, 'psi')).toBe('13 psi'); // rounds
    });
    it('seeds a draft that reads like typed input', () => {
        expect(valueToDraft(12.5, 2)).toBe('12.5');
        expect(valueToDraft(100, 2)).toBe('100');
        expect(valueToDraft(0, 2)).toBe('0');
        expect(valueToDraft(null, 2)).toBe('');
        expect(valueToDraft(12.9, 0)).toBe('13');
    });
});
