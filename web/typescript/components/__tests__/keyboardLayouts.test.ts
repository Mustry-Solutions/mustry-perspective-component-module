import { appendChar, backspaceText, getRows, KeyDef } from '../keyboard/keyboardLayouts';

const flat = (rows: KeyDef[][]): KeyDef[] => rows.reduce((a, r) => a.concat(r), []);
const chars = (rows: KeyDef[][]): string =>
    flat(rows).filter((k) => k.action === 'char').map((k) => k.value).join('');

describe('getRows — letters layer', () => {
    it('has the full QWERTY letter set, lower-case by default', () => {
        const rows = getRows('text', 'letters', false, 'Enter');
        const letters = flat(rows).filter((k) => k.action === 'char' && /^[a-z]$/.test(k.value!));
        expect(letters.map((k) => k.value).join('')).toBe('qwertyuiopasdfghjklzxcvbnm');
    });
    it('upper-cases letters when shifted', () => {
        const rows = getRows('text', 'letters', true, 'Enter');
        const letters = flat(rows).filter((k) => k.action === 'char' && /^[A-Z]$/.test(k.value!));
        expect(letters.length).toBe(26);
        expect(chars(rows)).toContain('Q');
    });
    it('exposes shift, backspace, enter and a layer toggle', () => {
        const acts = flat(getRows('text', 'letters', false, 'Enter')).map((k) => k.action);
        expect(acts).toContain('shift');
        expect(acts).toContain('backspace');
        expect(acts).toContain('enter');
        expect(acts).toContain('space');
        expect(flat(getRows('text', 'letters', false, 'Enter')).some((k) => k.action === 'layer' && k.layer === 'symbols')).toBe(true);
    });
});

describe('getRows — symbols layer', () => {
    it('shows digits and can switch back to letters', () => {
        const rows = getRows('text', 'symbols', false, 'Enter');
        expect(chars(rows)).toContain('1234567890');
        expect(flat(rows).some((k) => k.action === 'layer' && k.layer === 'letters')).toBe(true);
    });
});

describe('getRows — layout extras', () => {
    it('email adds @ and .com', () => {
        const vals = flat(getRows('email', 'letters', false, 'Enter')).map((k) => k.value);
        expect(vals).toContain('@');
        expect(vals).toContain('.com');
    });
    it('url adds / and .com', () => {
        const vals = flat(getRows('url', 'letters', false, 'Enter')).map((k) => k.value);
        expect(vals).toContain('/');
        expect(vals).toContain('.com');
    });
    it('plain text has comma and period', () => {
        const vals = flat(getRows('text', 'letters', false, 'Enter')).map((k) => k.value);
        expect(vals).toContain(',');
        expect(vals).toContain('.');
    });
});

describe('appendChar / backspaceText', () => {
    it('appends and respects maxLength (0 = unlimited)', () => {
        expect(appendChar('ab', 'c', 0)).toBe('abc');
        expect(appendChar('abc', 'd', 3)).toBe('abc');       // at limit
        expect(appendChar('ab', '.com', 4)).toBe('ab');      // multi-char would overflow
        expect(appendChar('ab', '.com', 0)).toBe('ab.com');
    });
    it('backspaces to empty', () => {
        expect(backspaceText('abc')).toBe('ab');
        expect(backspaceText('')).toBe('');
    });
});
