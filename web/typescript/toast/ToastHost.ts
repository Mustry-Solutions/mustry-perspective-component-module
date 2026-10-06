// DOM side of the toasts: one fixed top-right region per page, appended to
// <body> on first use, so a toast needs no component in the view. Keep it thin;
// the decisions (types, durations, stack limit) live in toastLogic.ts.
import {
    MAX_VISIBLE_TOASTS, Toast, ToastType, ariaRoleFor, pushToast, remainingAfterPause, removeToast
} from './toastLogic';

const REGION_CLASS = 'mustry-toasts';
const EXIT_MS = 180;

// Simple stroked glyphs, inherited colour via currentColor.
const ICONS: Record<ToastType, string> = {
    info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.6"/>',
    success: '<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9.5"/>',
    warning: '<path d="M12 3.5 21 19.5H3z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="17" r="0.6"/>',
    error: '<circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>'
};

interface Live {
    el: HTMLElement;
    remainingMs: number;
    startedAt: number;
    timer: number | null;
}

export class ToastHost {
    private region: HTMLElement | null = null;
    private stack: string[] = [];
    private live = new Map<string, Live>();

    constructor(private doc: Document = document) {}

    show(toast: Toast): void {
        this.dismiss(toast.id, true);
        const region = this.ensureRegion();
        const el = this.render(toast);
        region.appendChild(el);

        const entry: Live = { el, remainingMs: toast.durationMs, startedAt: Date.now(), timer: null };
        this.live.set(toast.id, entry);
        const { stack, evicted } = pushToast(this.stack, toast.id, MAX_VISIBLE_TOASTS);
        this.stack = stack;
        evicted.forEach((id) => this.dismiss(id));
        this.startTimer(toast.id);
    }

    dismiss(id: string, immediate = false): void {
        const entry = this.live.get(id);
        if (!entry) {
            return;
        }
        this.clearTimer(entry);
        this.live.delete(id);
        this.stack = removeToast(this.stack, id);
        if (immediate) {
            entry.el.remove();
            return;
        }
        entry.el.classList.add('mustry-toast--leaving');
        window.setTimeout(() => entry.el.remove(), EXIT_MS);
    }

    private ensureRegion(): HTMLElement {
        if (this.region && this.region.isConnected) {
            return this.region;
        }
        const region = this.doc.createElement('section');
        region.className = REGION_CLASS;
        region.setAttribute('aria-label', 'Notifications');
        this.doc.body.appendChild(region);
        this.region = region;
        return region;
    }

    private render(toast: Toast): HTMLElement {
        const d = this.doc;
        const el = d.createElement('div');
        el.className = `mustry-toast mustry-toast--${toast.type}${toast.className ? ` ${toast.className}` : ''}`;
        el.setAttribute('role', ariaRoleFor(toast.type));
        el.setAttribute('aria-atomic', 'true');
        el.dataset.toastId = toast.id;

        const icon = d.createElement('span');
        icon.className = 'mustry-toast__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" `
            + `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[toast.type]}</svg>`;
        el.appendChild(icon);

        // textContent only: titles and messages come from scripts and may carry
        // user data, so they are never parsed as HTML.
        const body = d.createElement('div');
        body.className = 'mustry-toast__body';
        if (toast.title) {
            const title = d.createElement('div');
            title.className = 'mustry-toast__title';
            title.textContent = toast.title;
            body.appendChild(title);
        }
        if (toast.message) {
            const message = d.createElement('div');
            message.className = 'mustry-toast__message';
            message.textContent = toast.message;
            body.appendChild(message);
        }
        el.appendChild(body);

        const close = d.createElement('button');
        close.type = 'button';
        close.className = 'mustry-toast__close';
        close.setAttribute('aria-label', 'Close notification');
        close.textContent = '×';
        close.addEventListener('click', () => this.dismiss(toast.id));
        el.appendChild(close);

        if (toast.durationMs > 0) {
            const progress = d.createElement('div');
            progress.className = 'mustry-toast__progress';
            progress.style.animationDuration = `${toast.durationMs}ms`;
            el.appendChild(progress);
        }

        // Pause while the pointer or keyboard focus is on the toast, so it can be read.
        el.addEventListener('mouseenter', () => this.pause(toast.id));
        el.addEventListener('mouseleave', () => this.resume(toast.id));
        el.addEventListener('focusin', () => this.pause(toast.id));
        el.addEventListener('focusout', () => this.resume(toast.id));
        el.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.dismiss(toast.id);
            }
        });
        return el;
    }

    private startTimer(id: string): void {
        const entry = this.live.get(id);
        if (!entry || entry.remainingMs <= 0 || entry.timer !== null) {
            return;
        }
        entry.startedAt = Date.now();
        entry.timer = window.setTimeout(() => this.dismiss(id), entry.remainingMs);
        entry.el.classList.remove('mustry-toast--paused');
    }

    private pause(id: string): void {
        const entry = this.live.get(id);
        if (!entry || entry.timer === null) {
            return;
        }
        this.clearTimer(entry);
        entry.remainingMs = remainingAfterPause(entry.remainingMs, entry.startedAt, Date.now());
        entry.el.classList.add('mustry-toast--paused');
    }

    private resume(id: string): void {
        const entry = this.live.get(id);
        // Stay paused while the other trigger (pointer or focus) still holds it.
        if (entry && (entry.el.matches(':hover') || entry.el.contains(this.doc.activeElement))) {
            return;
        }
        this.startTimer(id);
    }

    private clearTimer(entry: Live): void {
        if (entry.timer !== null) {
            window.clearTimeout(entry.timer);
            entry.timer = null;
        }
    }
}
