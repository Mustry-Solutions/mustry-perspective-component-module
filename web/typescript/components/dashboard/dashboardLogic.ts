// Pure logic for the dashboard layout: the grid model (tiles clamped to a
// column grid), merging the two-way layout overrides onto the authored tiles,
// and CSS-grid placement. No DOM, no React — everything here runs under
// plain-node jest.

/** An authored tile: content (view) + default geometry + size constraints. */
export interface DashTile {
    id: string;
    title: string;
    viewPath: string;
    viewParams: Record<string, unknown>;
    x: number;   // grid column, 0-based
    y: number;   // grid row, 0-based
    w: number;   // width in columns
    h: number;   // height in rows
    minW: number;
    minH: number;
}

/** The geometry an operator can change (the two-way state.layout entries). */
export interface TileGeom {
    x: number;
    y: number;
    w: number;
    h: number;
}

export function clampInt(n: number, lo: number, hi: number): number {
    const v = Math.round(Number.isFinite(n) ? n : lo);
    return Math.max(lo, Math.min(hi, v));
}

/** Clamp a tile's geometry to a `columns`-wide grid, honouring its min size. */
export function clampGeom(g: TileGeom, columns: number, minW = 1, minH = 1): TileGeom {
    const w = clampInt(g.w, Math.max(1, minW), columns);
    const h = clampInt(g.h, Math.max(1, minH), 9999);
    const x = clampInt(g.x, 0, Math.max(0, columns - w));
    const y = clampInt(g.y, 0, 9999);
    return { x, y, w, h };
}

/**
 * Effective tiles: the authored tiles with any two-way layout override applied
 * by id, each clamped to the grid. `layout` is the operator's arrangement
 * (state.layout, keyed by tile id); missing ids keep their authored geometry.
 */
export function effectiveTiles(
    tiles: DashTile[],
    layout: Record<string, TileGeom>,
    columns: number
): DashTile[] {
    return tiles.map((t) => {
        const o = layout[t.id];
        const g = clampGeom(o ? { ...o } : { x: t.x, y: t.y, w: t.w, h: t.h }, columns, t.minW, t.minH);
        return { ...t, ...g };
    });
}

/** CSS grid placement for a tile (1-based line numbers, span syntax). */
export function gridStyle(g: TileGeom): { gridColumn: string; gridRow: string } {
    return {
        gridColumn: `${g.x + 1} / span ${g.w}`,
        gridRow: `${g.y + 1} / span ${g.h}`
    };
}

/** Number of grid rows the current arrangement spans (for the container height). */
export function rowsUsed(tiles: DashTile[]): number {
    return tiles.reduce((max, t) => Math.max(max, t.y + t.h), 0);
}

/** The layout map (id -> geometry) for the two-way write-back. */
export function layoutOf(tiles: DashTile[]): Record<string, TileGeom> {
    const out: Record<string, TileGeom> = {};
    tiles.forEach((t) => { out[t.id] = { x: t.x, y: t.y, w: t.w, h: t.h }; });
    return out;
}
