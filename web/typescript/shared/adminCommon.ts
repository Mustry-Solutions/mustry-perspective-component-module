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

/**
 * A unique name for a duplicate: "Name (copy)", then "Name (copy 2)", … —
 * or dash style ("name-copy", "name-copy-2") for identifier-ish names like
 * usernames where parentheses/spaces may be rejected by the backing source.
 */
export function uniqueCopyName(base: string, existing: string[], style: 'paren' | 'dash' = 'paren'): string {
    const taken = new Set(existing);
    const make = (n: number): string => {
        if (style === 'dash') {
            return n === 1 ? `${base}-copy` : `${base}-copy-${n}`;
        }
        return n === 1 ? `${base} (copy)` : `${base} (copy ${n})`;
    };
    for (let n = 1; ; n++) {
        const candidate = make(n);
        if (!taken.has(candidate)) {
            return candidate;
        }
    }
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
