// Shared pure helpers for the admin component family (Schedule / Roster /
// User Managers) — no DOM, node-tested via the components' suites.

/**
 * Validate a resource name for create/rename flows. `currentName` is the
 * resource being renamed ('' when creating) — its own name never clashes.
 */
export function validateName(name: string, existingNames: string[], currentName: string): 'empty' | 'duplicate' | null {
    const trimmed = name.trim();
    if (trimmed === '') {
        return 'empty';
    }
    if (existingNames.some((n) => n === trimmed && n !== currentName)) {
        return 'duplicate';
    }
    return null;
}

/** Move one element of a list (drag-to-reorder commit). Returns a new array. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
    if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) {
        return list;
    }
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
}

/** Reorder-gesture geometry: where a row dragged by `deltaY` should land. */
export function reorderTarget(fromIndex: number, deltaY: number, rowHeight: number, count: number): number {
    if (rowHeight <= 0 || count <= 0) {
        return fromIndex;
    }
    const raw = fromIndex + Math.round(deltaY / rowHeight);
    return Math.max(0, Math.min(count - 1, raw));
}
