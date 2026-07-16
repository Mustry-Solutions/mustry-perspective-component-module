// Enter-animation bookkeeping for item chips/bars: animate only when a brand-new
// id first appears (create / new data), not on initial load or navigation.
// Component-agnostic: anything with an optional string id works.

export const ENTER_MS = 380;   // create/enter animation duration (keep ≥ the CSS animation)

export class EnterTracker {
    private seen = new Set<string>();
    private pending = new Set<string>();
    private timers: Array<ReturnType<typeof setTimeout>> = [];
    private mounted = false;

    /** Seed with the initial items so they don't fire the create animation
     *  (the container fades in instead), and start honouring enterClass. */
    seed(items: Array<{ id?: string }>): void {
        items.forEach((e) => { if (e.id) { this.seen.add(e.id); } });
        this.mounted = true;
    }

    /** After a render: mark freshly-appeared ids so their chips finish the enter
     *  animation, then settle. `onSettled` re-renders to drop the enter class. */
    detect(items: Array<{ id?: string }>, onSettled: () => void): void {
        const fresh: string[] = [];
        items.forEach((e) => {
            if (e.id && !this.seen.has(e.id) && !this.pending.has(e.id)) {
                this.pending.add(e.id);
                fresh.push(e.id);
            }
        });
        if (!fresh.length) {
            return;
        }
        this.timers.push(setTimeout(() => {
            fresh.forEach((id) => { this.pending.delete(id); this.seen.add(id); });
            onSettled();
        }, ENTER_MS));
    }

    /** Enter-animation class for an item: set once for a never-seen base id
     *  (recurring occurrences "base::date" match their base). */
    enterClass(occId: string): string {
        const base = (occId || '').split('::')[0];
        return this.mounted && !!base && !this.seen.has(base) ? ' mustry-cal-anim-enter' : '';
    }

    dispose(): void {
        this.timers.forEach((t) => clearTimeout(t));
        this.timers = [];
    }
}
