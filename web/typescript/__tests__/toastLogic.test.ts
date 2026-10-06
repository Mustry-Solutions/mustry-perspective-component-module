import {
    DEFAULT_DURATION_SECONDS, MAX_TEXT_LENGTH, ariaRoleFor, normalizeToast, normalizeToastType,
    pushToast, remainingAfterPause, removeToast, sanitizeClassName, toDurationMs
} from '../toast/toastLogic';

const fixedId = (): string => 'generated';

describe('normalizeToastType', () => {
    it('accepts the four types case-insensitively', () => {
        expect(normalizeToastType('success')).toBe('success');
        expect(normalizeToastType('Error')).toBe('error');
        expect(normalizeToastType(' WARNING ')).toBe('warning');
        expect(normalizeToastType('info')).toBe('info');
    });
    it('falls back to info for anything else', () => {
        expect(normalizeToastType('infoSecondary')).toBe('info');
        expect(normalizeToastType(undefined)).toBe('info');
        expect(normalizeToastType(3)).toBe('info');
    });
});

describe('toDurationMs', () => {
    it('converts seconds, including fractions and numeric strings', () => {
        expect(toDurationMs(8)).toBe(8000);
        expect(toDurationMs(1.5)).toBe(1500);
        expect(toDurationMs('10')).toBe(10000);
    });
    it('keeps the toast open for zero or a negative duration', () => {
        expect(toDurationMs(0)).toBe(0);
        expect(toDurationMs(-1)).toBe(0);
    });
    it('uses the default for missing or invalid values', () => {
        const fallback = DEFAULT_DURATION_SECONDS * 1000;
        expect(toDurationMs(undefined)).toBe(fallback);
        expect(toDurationMs(null)).toBe(fallback);
        expect(toDurationMs('soon')).toBe(fallback);
        expect(toDurationMs('')).toBe(fallback);
        expect(toDurationMs(Infinity)).toBe(fallback);
    });
});

describe('sanitizeClassName', () => {
    it('keeps plain class tokens', () => {
        expect(sanitizeClassName('wilms-toast  wilms-toast--error')).toBe('wilms-toast wilms-toast--error');
    });
    it('drops tokens that are not class names', () => {
        expect(sanitizeClassName('ok "><img src=x onerror=alert(1)> 1bad _fine')).toBe('ok _fine');
        expect(sanitizeClassName(undefined)).toBe('');
        expect(sanitizeClassName(42)).toBe('');
    });
});

describe('normalizeToast', () => {
    it('builds a toast from a full payload', () => {
        expect(normalizeToast({
            id: 'a', type: 'warning', title: ' Opgelet ', message: 'Line 1\nLine 2', duration: 3, className: 'x'
        }, fixedId)).toEqual({
            id: 'a', type: 'warning', title: 'Opgelet', message: 'Line 1\nLine 2', durationMs: 3000, className: 'x'
        });
    });
    it('generates an id and applies defaults', () => {
        expect(normalizeToast({ message: 'Saved' }, fixedId)).toEqual({
            id: 'generated', type: 'info', title: '', message: 'Saved',
            durationMs: DEFAULT_DURATION_SECONDS * 1000, className: ''
        });
    });
    it('accepts a title without a message', () => {
        expect(normalizeToast({ title: 'Only a title', message: null }, fixedId)?.title).toBe('Only a title');
    });
    it('returns null when there is nothing to show', () => {
        expect(normalizeToast({ title: '  ', message: '' }, fixedId)).toBeNull();
        expect(normalizeToast(null, fixedId)).toBeNull();
        expect(normalizeToast('text', fixedId)).toBeNull();
    });
    it('cuts very long text', () => {
        const toast = normalizeToast({ message: 'x'.repeat(MAX_TEXT_LENGTH + 50) }, fixedId);
        expect(toast?.message.length).toBe(MAX_TEXT_LENGTH);
        expect(toast?.message.endsWith('…')).toBe(true);
    });
});

describe('ariaRoleFor', () => {
    it('announces errors and warnings assertively, the rest politely', () => {
        expect(ariaRoleFor('error')).toBe('alert');
        expect(ariaRoleFor('warning')).toBe('alert');
        expect(ariaRoleFor('success')).toBe('status');
        expect(ariaRoleFor('info')).toBe('status');
    });
});

describe('toast stack', () => {
    it('appends new toasts after the existing ones', () => {
        expect(pushToast(['a'], 'b', 5)).toEqual({ stack: ['a', 'b'], evicted: [] });
    });
    it('pushes the oldest out past the limit', () => {
        expect(pushToast(['a', 'b', 'c'], 'd', 3)).toEqual({ stack: ['b', 'c', 'd'], evicted: ['a'] });
    });
    it('moves a repeated id to the end instead of duplicating it', () => {
        expect(pushToast(['a', 'b'], 'a', 5)).toEqual({ stack: ['b', 'a'], evicted: [] });
    });
    it('removes an id and ignores unknown ids', () => {
        expect(removeToast(['a', 'b'], 'a')).toEqual(['b']);
        expect(removeToast(['a'], 'z')).toEqual(['a']);
    });
});

describe('remainingAfterPause', () => {
    it('subtracts the time that ran before the pause', () => {
        expect(remainingAfterPause(5000, 1000, 3000)).toBe(3000);
    });
    it('never goes below zero or adds time for a clock going backwards', () => {
        expect(remainingAfterPause(1000, 0, 5000)).toBe(0);
        expect(remainingAfterPause(1000, 5000, 4000)).toBe(1000);
    });
});
