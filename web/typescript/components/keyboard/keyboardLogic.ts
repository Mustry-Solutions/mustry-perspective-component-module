// Pure keypad/keyboard editing logic — no DOM, no React (node-tested). The
// component keeps a DRAFT string as the user taps keys; these functions turn a
// key press into the next draft, parse/format/clamp the numeric value, and
// report range validity. Keeping every rule here (leading zeros, single decimal
// point, decimal-place cap, sign toggle) is what makes the keypad testable.

/** A key the numeric keypad can emit. 'enter' is handled by the component (commit),
 *  not by draft editing, so it isn't accepted here. */
export type KeypadKey =
    | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
    | '.' | 'backspace' | 'clear' | 'sign';

export interface KeypadOpts {
    /** Max decimal places (0 = integer only; the '.' key is then inert). */
    decimals: number;
    /** Whether the sign key / a leading '-' is allowed. */
    allowNegative: boolean;
}

function isDigit(k: string): boolean {
    return k >= '0' && k <= '9';
}

/** The fractional part of a draft (after the '.'), or null if there is none. */
function fractionLen(draft: string): number | null {
    const dot = draft.indexOf('.');
    return dot < 0 ? null : draft.length - dot - 1;
}

/**
 * Apply one key press to the draft string and return the next draft. Pure:
 * given the same (draft, key, opts) it always returns the same result. An empty
 * string (or a lone '-') is a valid "no number yet" draft.
 */
export function applyKey(draft: string, key: KeypadKey, opts: KeypadOpts): string {
    const neg = draft.startsWith('-');
    const body = neg ? draft.slice(1) : draft;
    const sign = neg ? '-' : '';

    if (key === 'clear') {
        return '';
    }
    if (key === 'backspace') {
        const next = draft.slice(0, -1);
        return next; // may leave '' or '-'
    }
    if (key === 'sign') {
        if (!opts.allowNegative) {
            return draft;
        }
        return neg ? body : '-' + body;
    }
    if (key === '.') {
        if (opts.decimals <= 0 || body.indexOf('.') >= 0) {
            return draft; // no decimals allowed, or one already present
        }
        return sign + (body === '' ? '0.' : body + '.');
    }
    if (isDigit(key)) {
        // Cap fractional digits.
        const frac = fractionLen(body);
        if (frac !== null && frac >= opts.decimals) {
            return draft;
        }
        // Avoid leading zeros: a bare '0' (no decimal) is replaced by the digit,
        // except another '0' which is ignored.
        if (body === '0') {
            return key === '0' ? draft : sign + key;
        }
        return sign + body + key;
    }
    return draft;
}

/** Parse a draft to a number, or null when it isn't yet a complete number. */
export function parseDraft(draft: string): number | null {
    if (draft === '' || draft === '-' || draft === '.' || draft === '-.') {
        return null;
    }
    const n = Number(draft);
    return isFinite(n) ? n : null;
}

export function clampValue(value: number, min: number | null, max: number | null): number {
    let v = value;
    if (min !== null && v < min) {
        v = min;
    }
    if (max !== null && v > max) {
        v = max;
    }
    return v;
}

export function inRange(value: number, min: number | null, max: number | null): boolean {
    if (min !== null && value < min) {
        return false;
    }
    if (max !== null && value > max) {
        return false;
    }
    return true;
}

export interface RangeOpts {
    enforceRange: boolean;
    min: number | null;
    max: number | null;
}

/**
 * config.liveUpdate: the number a key press should write to value.value, or
 * null to write nothing. With enforceRange an out-of-range draft is NOT written
 * (and never clamped): a partial entry like '1' on the way to '15' with min=10
 * must not push 10 into the bound value. Enter still clamps.
 */
export function liveValue(draft: string, range: RangeOpts): number | null {
    const parsed = parseDraft(draft);
    if (parsed === null || (range.enforceRange && !inRange(parsed, range.min, range.max))) {
        return null;
    }
    return parsed;
}

/**
 * Enter on the numpad: the value to write (clamped with enforceRange) and
 * whether the typed number was in range BEFORE clamping, for onCommit.isValid.
 */
export function commitNumber(parsed: number, range: RangeOpts): { value: number; isValid: boolean } {
    if (!range.enforceRange) {
        return { value: parsed, isValid: true };
    }
    return { value: clampValue(parsed, range.min, range.max), isValid: inRange(parsed, range.min, range.max) };
}

/**
 * Whether a bound value change is just this keyboard's own live write coming
 * back. The draft must survive it, or every key would start a fresh entry.
 */
export function isLiveEcho(incoming: number, lastLiveWrite: number | null): boolean {
    return lastLiveWrite !== null && incoming === lastLiveWrite;
}

/** Format a number for the committed display: fixed decimals + optional unit suffix. */
export function formatValue(value: number, decimals: number, units: string): string {
    const base = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
    return units ? `${base} ${units}` : base;
}

/** Seed a draft string from a bound numeric value (for when editing begins). */
export function valueToDraft(value: number | null, decimals: number): string {
    if (value === null || !isFinite(value)) {
        return '';
    }
    // Use the natural representation, trimmed to the decimal cap.
    if (decimals <= 0) {
        return String(Math.round(value));
    }
    const fixed = value.toFixed(decimals);
    // Trim trailing zeros / dangling dot so the draft reads like the user typed it.
    return fixed.replace(/\.?0+$/, '') || '0';
}
