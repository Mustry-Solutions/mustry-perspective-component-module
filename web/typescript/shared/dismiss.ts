// Document-level dismiss hookup for a popover: an outside pointerdown or Escape
// closes it. Clicks inside any of the `keepWithin` selectors (the popover itself,
// or a trigger that manages its own toggling) are left alone.
export class DocDismiss {
    private active = false;

    constructor(private keepWithin: string[], private onClose: () => void) {}

    open(): void {
        if (this.active) {
            return;
        }
        document.addEventListener('pointerdown', this.onDown, true);
        document.addEventListener('keydown', this.onKey, true);
        this.active = true;
    }

    close(): void {
        if (!this.active) {
            return;
        }
        document.removeEventListener('pointerdown', this.onDown, true);
        document.removeEventListener('keydown', this.onKey, true);
        this.active = false;
    }

    private onDown = (e: PointerEvent): void => {
        const t = e.target as HTMLElement | null;
        if (t && this.keepWithin.some((sel) => t.closest(sel))) {
            return;
        }
        this.onClose();
    };

    private onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            this.onClose();
        }
    };
}
