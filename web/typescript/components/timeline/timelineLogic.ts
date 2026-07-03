// Pure, framework-free logic for the Resource Timeline: the epoch-linear time
// scale, tick generation, row assembly and per-row bar/band layout. Unit-tested
// without rendering.
//
// The scale is EPOCH-linear (ms -> px), not wall-clock-linear: DST days are
// 23/25 hours long and must render that way instead of tearing the axis. Tick
// LABELS are zone-aware via Intl.
import { resolveZoned, toEpochMs, zoneWallClock } from '../../shared/dateUtils';
import { RRule } from '../../shared/recurrence';

/** One timeline event/bar (controlled data — the component never mutates these). */
export interface TimelineEvent {
    id: string;
    resourceId: string;
    title: string;
    start: string;   // ISO 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ss' (naive = zone-local) or offset/epoch instant
    end?: string;
    color?: string;
    category?: string;
    status?: string;       // 'tentative' | 'cancelled' | 'done'
    description?: string;
    display?: string;      // 'bar' (default) | 'state' (full-height band) | 'background'
    rrule?: RRule;         // expanded per visible window (display-only in v1)
}

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

/** Epoch ms of the zone-local midnight of the wall date containing `ms`,
 *  optionally shifted by whole wall-calendar days (DST-safe: date arithmetic
 *  happens on the wall calendar, then resolves back to an instant). */
export function zoneMidnightMs(ms: number, timeZone: string, addDaysBy = 0): number {
    const w = zoneWallClock(new Date(ms), timeZone);
    return resolveZoned(new Date(w.y, w.mo - 1, w.d + addDaysBy), timeZone).epochMs;
}

/**
 * The visible window for an anchor + zoom. Day/week windows span whole
 * wall-calendar days (a DST day really is 23/25 hours wide on the epoch-linear
 * scale); the hour window is a plain epoch span.
 */
export function windowFor(anchorMs: number, zoom: TimelineZoom, timeZone: string): TimeScale {
    const preset = ZOOM_PRESETS[zoom];
    const endMs = zoom === 'hour'
        ? anchorMs + preset.spanHours * MS_PER_HOUR
        : zoneMidnightMs(anchorMs, timeZone, Math.round(preset.spanHours / 24));
    return { startMs: anchorMs, endMs, pxPerHour: preset.pxPerHour };
}

/**
 * The anchor after paging by one window. Day/week page by wall-calendar days and
 * re-anchor on the zone-local midnight (paging across a 23/25h DST day must not
 * leave every later window anchored at 23:00/01:00); hour pages by plain epoch.
 */
export function pageAnchorMs(anchorMs: number, dir: number, zoom: TimelineZoom, timeZone: string): number {
    const preset = ZOOM_PRESETS[zoom];
    if (zoom === 'hour') {
        return anchorMs + dir * preset.spanHours * MS_PER_HOUR;
    }
    return zoneMidnightMs(anchorMs, timeZone, dir * Math.round(preset.spanHours / 24));
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
 * Ticks for the window, ZONE-aware: upper ticks sit on real zone-local midnights
 * (plus the window start when it isn't one), and lower ticks step from each
 * day's own midnight — so across a 23/25h DST day every tick still lands on the
 * wall-clock boundary its label names.
 */
export function buildTicks(scale: TimeScale, zoom: TimelineZoom, timezone: string, locale: string): TickRows {
    const preset = ZOOM_PRESETS[zoom];
    const upperFmt = zonedFormat(locale, timezone, { weekday: 'short', day: 'numeric', month: 'short' });
    const lowerFmt = zoom === 'week'
        ? zonedFormat(locale, timezone, { hour: '2-digit', hour12: false })
        : zonedFormat(locale, timezone, { hour: '2-digit', minute: '2-digit', hour12: false });

    // Zone-local midnights covering the window (starting at the day containing start).
    const dayStarts: number[] = [];
    for (let d = zoneMidnightMs(scale.startMs, timezone), i = 0; d < scale.endMs && i < 40; i++) {
        dayStarts.push(d);
        d = zoneMidnightMs(d, timezone, 1);
    }

    const upper: Tick[] = [];
    if (dayStarts.length && dayStarts[0] < scale.startMs) {
        // Window starts mid-day (hour zoom): label the partial day at the window edge.
        upper.push({ ms: scale.startMs, px: 0, label: upperFmt.format(new Date(scale.startMs)) });
    }
    for (const d of dayStarts) {
        if (d >= scale.startMs) {
            upper.push({ ms: d, px: msToPx(scale, d), label: upperFmt.format(new Date(d)) });
        }
    }

    const lower: Tick[] = [];
    const step = preset.lowerStepMin * 60000;
    for (let i = 0; i < dayStarts.length; i++) {
        const dayEnd = Math.min(i + 1 < dayStarts.length ? dayStarts[i + 1] : zoneMidnightMs(dayStarts[i], timezone, 1), scale.endMs);
        for (let ms = dayStarts[i]; ms < dayEnd; ms += step) {
            if (ms >= scale.startMs) {
                lower.push({ ms, px: msToPx(scale, ms), label: lowerFmt.format(new Date(ms)) });
            }
        }
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
    group?: string;               // the group NAME (group rows) — collapse is keyed on it
    collapsed?: boolean;          // group rows: whether this section is collapsed
    hiddenCount?: number;         // group rows, collapsed: how many resource rows are hidden
}

// --- CSV export -----------------------------------------------------------------

/** Quote a CSV cell only when it contains a comma, quote, or newline (RFC 4180). */
function csvCell(v: string): string {
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Serialise timeline events to CSV text (one row per event, CRLF line endings). */
export function timelineEventsToCsv(events: TimelineEvent[]): string {
    const cols = ['id', 'resourceId', 'title', 'start', 'end', 'category', 'status', 'display', 'color', 'description', 'rrule'];
    const rows = [cols.join(',')];
    for (const ev of events || []) {
        if (!ev) {
            continue;
        }
        rows.push([
            ev.id || '',
            ev.resourceId || '',
            ev.title || '',
            ev.start || '',
            ev.end || '',
            ev.category || '',
            ev.status || '',
            ev.display || '',
            ev.color || '',
            ev.description || '',
            ev.rrule ? JSON.stringify(ev.rrule) : ''
        ].map((c) => csvCell(String(c))).join(','));
    }
    return rows.join('\r\n');
}

// --- per-row bar/band layout --------------------------------------------------

export const DEFAULT_BAR_MIN = 60;   // assumed duration (minutes) for a bar with no end

/** A window-clamped item ready to render on one row. */
export interface BarLayout {
    event: TimelineEvent;
    startMs: number;           // clamped to the visible window
    endMs: number;
    lane: number;              // 0-based lane within the row (bars only)
    lanes: number;             // total lanes in the bar's overlap cluster
    continuesLeft: boolean;    // starts before the window / clamp edge
    continuesRight: boolean;   // ends after it
}

/** Parse + clamp one event to the window; null = not on this row / not visible.
 *  A missing end means: bars run DEFAULT_BAR_MIN; states/backgrounds run until
 *  the window end (an ongoing state). */
function clampToWindow(ev: TimelineEvent, resourceId: string, scale: TimeScale, timezone: string): BarLayout | null {
    if (!ev || ev.resourceId !== resourceId || !ev.start) {
        return null;
    }
    const startMs = toEpochMs(ev.start, timezone);
    if (startMs === null) {
        return null;
    }
    let endMs = ev.end ? toEpochMs(ev.end, timezone) : null;
    if (endMs === null || endMs <= startMs) {
        endMs = ev.display === 'state' || ev.display === 'background'
            ? scale.endMs                          // ongoing band -> to the window edge
            : startMs + DEFAULT_BAR_MIN * 60000;   // bar -> default duration
    }
    if (endMs <= scale.startMs || startMs >= scale.endMs) {
        return null;   // entirely outside the window
    }
    const s = Math.max(startMs, scale.startMs);
    const e = Math.min(endMs, scale.endMs);
    return {
        event: ev, startMs: s, endMs: e, lane: 0, lanes: 1,
        continuesLeft: startMs < scale.startMs,
        continuesRight: endMs > scale.endMs
    };
}

/**
 * Lay out one row's BARS (display 'bar'/unset): window-clamp, then pack
 * transitively-overlapping bars into stacked lanes (the calendar's cluster
 * algorithm in epoch space). The renderer derives top/height from lane/lanes.
 */
export function layoutRowBars(events: TimelineEvent[], resourceId: string, scale: TimeScale, timezone: string): BarLayout[] {
    const items: BarLayout[] = [];
    for (const ev of events) {
        if (ev && (ev.display === 'state' || ev.display === 'background')) {
            continue;
        }
        const it = clampToWindow(ev, resourceId, scale, timezone);
        if (it) {
            items.push(it);
        }
    }
    items.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

    let i = 0;
    while (i < items.length) {
        // Grow a cluster of transitively-overlapping bars.
        let j = i;
        let clusterEnd = items[i].endMs;
        while (j + 1 < items.length && items[j + 1].startMs < clusterEnd) {
            j++;
            clusterEnd = Math.max(clusterEnd, items[j].endMs);
        }
        // Greedy lane assignment within the cluster.
        const laneEnds: number[] = [];
        for (let k = i; k <= j; k++) {
            let placed = false;
            for (let l = 0; l < laneEnds.length; l++) {
                if (laneEnds[l] <= items[k].startMs) {
                    items[k].lane = l;
                    laneEnds[l] = items[k].endMs;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                items[k].lane = laneEnds.length;
                laneEnds.push(items[k].endMs);
            }
        }
        for (let k = i; k <= j; k++) {
            items[k].lanes = laneEnds.length;
        }
        i = j + 1;
    }
    return items;
}

/** One row's full-height bands for a display kind ('state' or 'background'):
 *  window-clamped, in start order, no packing (contiguous by nature). */
export function layoutRowBands(
    events: TimelineEvent[], resourceId: string, kind: 'state' | 'background', scale: TimeScale, timezone: string
): BarLayout[] {
    const out: BarLayout[] = [];
    for (const ev of events) {
        if (!ev || ev.display !== kind) {
            continue;
        }
        const it = clampToWindow(ev, resourceId, scale, timezone);
        if (it) {
            out.push(it);
        }
    }
    out.sort((a, b) => a.startMs - b.startMs);
    return out;
}

/** Rows to render: resources in array order, with a group header row inserted
 *  whenever the (non-empty) group changes. Order is the author's — resources are
 *  NOT re-sorted, so a group listed twice gets two sections, by design (collapse
 *  is keyed on the group NAME, so it affects every section of that group).
 *  Collapsed groups keep their header row but drop their resource rows. */
export function buildRows(resources: TimelineResource[], collapsedGroups?: Set<string>): RowItem[] {
    const collapsed = collapsedGroups || new Set<string>();
    const out: RowItem[] = [];
    let currentGroup: string | null = null;
    let openHeader: RowItem | null = null;   // the current group's header (to count hidden rows)
    for (const r of resources || []) {
        if (!r || !r.id) {
            continue;
        }
        const g = r.group || '';
        if (g && g !== currentGroup) {
            openHeader = {
                type: 'group', key: `g:${g}:${out.length}`, label: g, group: g,
                collapsed: collapsed.has(g), hiddenCount: 0
            };
            out.push(openHeader);
        }
        if (!g) {
            openHeader = null;
        }
        currentGroup = g || null;
        if (g && collapsed.has(g)) {
            if (openHeader) {
                openHeader.hiddenCount = (openHeader.hiddenCount || 0) + 1;
            }
            continue;   // section collapsed: skip the resource row
        }
        out.push({ type: 'resource', key: `r:${r.id}`, label: r.label || r.id, resource: r });
    }
    return out;
}
