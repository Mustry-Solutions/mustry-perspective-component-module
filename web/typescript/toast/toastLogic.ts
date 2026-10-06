// Pure toast logic: payload normalization and stack bookkeeping. No DOM, so it
// is node-tested (__tests__/toastLogic.test.ts); ToastHost renders it.

/** Message protocol the gateway's system.mustry.toast() sends to a page. */
export const TOAST_PROTOCOL = 'mustry-toast';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export const TOAST_TYPES: ReadonlyArray<ToastType> = ['info', 'success', 'warning', 'error'];

/** Seconds a toast stays when the payload carries no usable duration. */
export const DEFAULT_DURATION_SECONDS = 5;

/** Toasts visible at once; a newer toast pushes the oldest out. */
export const MAX_VISIBLE_TOASTS = 5;

/** Longest title/message we render; longer text is cut with an ellipsis. */
export const MAX_TEXT_LENGTH = 2000;

export interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message: string;
    /** Milliseconds before the toast closes itself; 0 keeps it until closed. */
    durationMs: number;
    /** Extra CSS classes from the script, already sanitized. */
    className: string;
}

/** Unknown or missing types fall back to 'info'; matching is case-insensitive. */
export function normalizeToastType(value: unknown): ToastType {
    const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return (TOAST_TYPES as ReadonlyArray<string>).includes(key) ? (key as ToastType) : 'info';
}

/**
 * Seconds -> milliseconds. Zero or a negative number means "stay until closed";
 * anything that is not a finite number gets the default.
 */
export function toDurationMs(value: unknown): number {
    const seconds = typeof value === 'number' ? value
        : typeof value === 'string' && value.trim() !== '' ? Number(value)
        : NaN;
    if (!Number.isFinite(seconds)) {
        return DEFAULT_DURATION_SECONDS * 1000;
    }
    return seconds <= 0 ? 0 : Math.round(seconds * 1000);
}

/** Keep only plain class tokens, so a script cannot inject attribute syntax. */
export function sanitizeClassName(value: unknown): string {
    if (typeof value !== 'string') {
        return '';
    }
    return value.split(/\s+/).filter((t) => /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(t)).join(' ');
}

function toText(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }
    const text = String(value).trim();
    return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text;
}

/**
 * Turn a gateway payload into a renderable toast. Returns null when there is
 * nothing to show (no title and no message) or the payload is not an object.
 */
export function normalizeToast(payload: unknown, makeId: () => string): Toast | null {
    if (payload === null || typeof payload !== 'object') {
        return null;
    }
    const p = payload as Record<string, unknown>;
    const title = toText(p.title);
    const message = toText(p.message);
    if (!title && !message) {
        return null;
    }
    const id = typeof p.id === 'string' && p.id ? p.id : makeId();
    return {
        id,
        type: normalizeToastType(p.type),
        title,
        message,
        durationMs: toDurationMs(p.duration),
        className: sanitizeClassName(p.className)
    };
}

/**
 * Errors and warnings interrupt a screen reader (role=alert, assertive);
 * info and success wait for a pause (role=status, polite).
 */
export function ariaRoleFor(type: ToastType): 'alert' | 'status' {
    return type === 'error' || type === 'warning' ? 'alert' : 'status';
}

/**
 * Add a toast id to the visible stack (oldest first). A repeated id replaces
 * the earlier one. Returns the new stack and the ids pushed out by the limit.
 */
export function pushToast(stack: ReadonlyArray<string>, id: string, max: number = MAX_VISIBLE_TOASTS):
        { stack: string[]; evicted: string[] } {
    const next = stack.filter((s) => s !== id);
    next.push(id);
    const overflow = Math.max(0, next.length - Math.max(1, max));
    return { stack: next.slice(overflow), evicted: next.slice(0, overflow) };
}

/** Remove a toast id from the stack; unknown ids leave it unchanged. */
export function removeToast(stack: ReadonlyArray<string>, id: string): string[] {
    return stack.filter((s) => s !== id);
}

/**
 * Remaining auto-close time after a pause: the time left when the timer ran,
 * minus what elapsed since it (re)started, never below zero.
 */
export function remainingAfterPause(remainingMs: number, startedAt: number, pausedAt: number): number {
    return Math.max(0, remainingMs - Math.max(0, pausedAt - startedAt));
}
