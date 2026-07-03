// Pure, framework-free logic for the Resource Timeline: the epoch-linear time
// scale, tick generation and row assembly. Unit-tested without rendering.
//
// The scale is EPOCH-linear (ms -> px), not wall-clock-linear: DST days are
// 23/25 hours long and must render that way instead of tearing the axis. Tick
// LABELS are zone-aware via Intl.

export type TimelineZoom = 'hour' | 'day' | 'week';

export interface ZoomPreset {
    pxPerHour: number;    // horizontal density
    spanHours: number;    // window span; prev/next page by this
    snapMinutes: number;  // gesture snap granularity (editing milestone)
    lowerStepMin: number; // lower tick-row step, minutes
}

export const ZOOM_PRESETS: { [z in TimelineZoom]: ZoomPreset } = {
    hour: { pxPerHour: 180, spanHours: 8, snapMinutes: 5, lowerStepMin: 15 },
    day: { pxPerHour: 60, spanHours: 24, snapMinutes: 15, lowerStepMin: 60 },
    week: { pxPerHour: 12, spanHours: 168, snapMinutes: 60, lowerStepMin: 360 }
};

export const MS_PER_HOUR = 3600000;

/** The visible window and density; everything renders through this. */
export interface TimeScale {
    startMs: number;   // epoch ms of the window start (inclusive)
    endMs: number;     // epoch ms of the window end (exclusive)
    pxPerHour: number;
}

export function msToPx(scale: TimeScale, ms: number): number {
    return ((ms - scale.startMs) / MS_PER_HOUR) * scale.pxPerHour;
}

export function pxToMs(scale: TimeScale, px: number): number {
    return scale.startMs + (px / scale.pxPerHour) * MS_PER_HOUR;
}

/** Total rendered width of the window, px. */
export function scaleWidth(scale: TimeScale): number {
    return msToPx(scale, scale.endMs);
}

/** Zone-aware Intl formatter ('' locale/zone = browser defaults; invalid input
 *  falls back rather than throwing, matching shared/dateUtils.intlFormat). */
export function zonedFormat(locale: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    try {
        return new Intl.DateTimeFormat(locale || undefined, { ...options, timeZone: timeZone || undefined });
    } catch (e) {
        return new Intl.DateTimeFormat(undefined, options);
    }
}

export interface Tick {
    ms: number;
    px: number;
    label: string;
}

export interface TickRows {
    upper: Tick[];   // coarse row: days (hour/day zoom) or days incl. weekday (week zoom)
    lower: Tick[];   // fine row: times (hour/day zoom) or part-of-day steps (week zoom)
}

/**
 * Ticks for the window. Steps are fixed epoch increments from the window start;
 * with windows anchored to zone-local midnight they land on local boundaries.
 * (Within a window that crosses a DST seam the later ticks shift by the offset
 * change — accepted for now; zone-boundary-exact ticks are a later milestone.)
 */
export function buildTicks(scale: TimeScale, zoom: TimelineZoom, timezone: string, locale: string): TickRows {
    const preset = ZOOM_PRESETS[zoom];
    const upperFmt = zonedFormat(locale, timezone, { weekday: 'short', day: 'numeric', month: 'short' });
    const lowerFmt = zoom === 'week'
        ? zonedFormat(locale, timezone, { hour: '2-digit', hour12: false })
        : zonedFormat(locale, timezone, { hour: '2-digit', minute: '2-digit', hour12: false });

    const upper: Tick[] = [];
    for (let ms = scale.startMs; ms < scale.endMs; ms += 24 * MS_PER_HOUR) {
        upper.push({ ms, px: msToPx(scale, ms), label: upperFmt.format(new Date(ms)) });
    }
    const lower: Tick[] = [];
    const step = preset.lowerStepMin * 60000;
    for (let ms = scale.startMs; ms < scale.endMs; ms += step) {
        lower.push({ ms, px: msToPx(scale, ms), label: lowerFmt.format(new Date(ms)) });
    }
    return { upper, lower };
}

// --- rows --------------------------------------------------------------------

export interface TimelineResource {
    id: string;
    label: string;
    group?: string;   // optional section; consecutive equal groups share one header
    color?: string;
    icon?: string;    // Ignition icon path
}

export interface RowItem {
    type: 'group' | 'resource';
    key: string;                  // unique render key
    label: string;
    resource?: TimelineResource;  // set when type === 'resource'
}

/** Rows to render: resources in array order, with a group header row inserted
 *  whenever the (non-empty) group changes. Order is the author's — resources are
 *  NOT re-sorted, so a group listed twice gets two sections, by design. */
export function buildRows(resources: TimelineResource[]): RowItem[] {
    const out: RowItem[] = [];
    let currentGroup: string | null = null;
    for (const r of resources || []) {
        if (!r || !r.id) {
            continue;
        }
        const g = r.group || '';
        if (g && g !== currentGroup) {
            out.push({ type: 'group', key: `g:${g}:${out.length}`, label: g });
        }
        currentGroup = g || null;
        out.push({ type: 'resource', key: `r:${r.id}`, label: r.label || r.id, resource: r });
    }
    return out;
}
