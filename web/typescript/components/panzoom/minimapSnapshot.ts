// Minimap content preview: a throttled, inert DOM clone of the embedded view.
// DOM-facing and deliberately thin (untested by design, like the gesture
// controllers): the clone is static — no React, no bindings, no scripts — so the
// embedded view is never mounted twice. Throttled because tag-driven views
// mutate constantly and a preview a second stale is invisible at minimap scale.

/** Elements that would re-run or re-load something if duplicated: replaced by
 *  an empty box of the same size. */
const LIVE_TAGS = new Set(['IFRAME', 'VIDEO', 'AUDIO', 'OBJECT', 'EMBED', 'SCRIPT']);
/** Form controls: their name/form would join the live elements' groups. */
const FORM_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);

export class MinimapSnapshot {
    private observer: MutationObserver | null = null;
    private timer = 0;
    private lastAt = 0;
    private snapshot: HTMLElement | null = null;
    private host: HTMLElement | null = null;
    private dirty = true;

    constructor(private readonly source: () => HTMLElement | null, private readonly intervalMs: number = 1000) {}

    /** Start watching the source for changes (idempotent). */
    watch(): void {
        const src = this.source();
        if (this.observer || !src || typeof MutationObserver === 'undefined') {
            return;
        }
        this.observer = new MutationObserver((records) => {
            // the source's own style (the transform, every pan/zoom frame) is not a
            // content change; a child swapped directly under it is
            if (records.some((r) => !(r.type === 'attributes' && r.target === src))) {
                this.schedule();
            }
        });
        this.observer.observe(src, { subtree: true, childList: true, attributes: true, characterData: true });
        this.schedule();
    }

    /** Show the snapshot inside `host` (the minimap's preview layer). The minimap
     *  unmounts while the content fits, so a new host can appear at any time. */
    attach(host: HTMLElement | null): void {
        if (host === this.host) {
            return;
        }
        this.host = host;
        if (!host) {
            return;
        }
        if (this.dirty || !this.snapshot) {
            this.capture();   // changes seen while hidden were never cloned
        } else {
            host.replaceChildren(this.snapshot);
        }
    }

    dispose(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.timer) {
            window.clearTimeout(this.timer);
            this.timer = 0;
        }
        this.snapshot = null;
        this.host = null;
        this.dirty = true;
    }

    /** Leading + trailing throttle: at most one clone per interval. */
    private schedule(): void {
        if (this.timer) {
            return;
        }
        const wait = Math.max(0, this.lastAt + this.intervalMs - Date.now());
        this.timer = window.setTimeout(() => {
            this.timer = 0;
            this.lastAt = Date.now();
            this.capture();
        }, wait);
    }

    private capture(): void {
        const src = this.source();
        if (!src) {
            return;
        }
        if (!this.host) {
            // the minimap is hidden (content fits): clone when it shows again
            this.dirty = true;
            return;
        }
        this.dirty = false;
        const clone = src.cloneNode(true) as HTMLElement;
        clone.removeAttribute('style');   // drop the live pan/zoom transform
        clone.className = 'mustry-pz-mini-snapshot';
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('inert', '');
        // the host carries the content size, which can change without a capture
        clone.style.width = '100%';
        clone.style.height = '100%';
        // canvas pixels are not part of the DOM: copy them over
        const srcCanvases = src.querySelectorAll('canvas');
        clone.querySelectorAll('canvas').forEach((c, i) => {
            const from = srcCanvases[i];
            const ctx = c.getContext('2d');
            if (from && ctx && from.width > 0 && from.height > 0) {
                try {
                    ctx.drawImage(from, 0, 0);
                } catch (ignored) { /* ignore */ }
            }
        });
        clone.querySelectorAll('*').forEach((el) => {
            if (LIVE_TAGS.has(el.tagName)) {
                const box = document.createElement('div');
                box.style.cssText = (el as HTMLElement).style.cssText;
                box.className = 'mustry-pz-mini-placeholder';
                el.replaceWith(box);
                return;
            }
            if (el.id && !(el instanceof SVGElement)) {
                el.removeAttribute('id');   // SVG ids stay: url(#gradient) refs need them
            }
            if (FORM_TAGS.has(el.tagName)) {
                // a connected checked radio unchecks the live ones sharing its name
                el.removeAttribute('name');
                el.removeAttribute('form');
            }
        });
        this.snapshot = clone;
        this.host.replaceChildren(clone);
    }
}
