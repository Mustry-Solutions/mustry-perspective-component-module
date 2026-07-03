// Shared types + layout constants for the Calendar component and its sub-views.
// Category / CalLabels / ENTER_MS moved to the shared layer; re-exported here so
// the calendar's files keep one type hub.
import { CalEvent } from '../calendarLogic';
import { Category } from '../../shared/types';
import { CalLabels } from '../../shared/labelPacks';

export { ENTER_MS } from '../../shared/enterAnimation';
export type { Category, CalLabels };

export type WeekStart = 'monday' | 'sunday';
export type CalView = 'month' | 'week' | 'day' | 'list';
export type GestureMode = 'move' | 'resize' | 'create';

// --- layout constants ---
export const SLOT_PX = 42;         // base pixels per hour (slotMinutes = 60)
export const MIN_SLOT_PX = 14;     // keep each sub-slot tall enough to see/grab
export const DEFAULT_DUR_MIN = 60; // assumed duration for a timed event with no end
export const SNAP_MIN = 15;        // default drag/resize snapping granularity (fallback)

/** Pixels per hour for a given slot resolution. Coarse grids keep the base height;
 *  finer grids grow (taller, scrollable) so each sub-slot stays grabbable. */
export function hourHeightPx(slotMinutes: number): number {
    return Math.max(SLOT_PX, (MIN_SLOT_PX * 60) / Math.max(1, slotMinutes));
}


export interface CalendarProps {
    view: CalView;
    showToolbar: boolean;
    showMiniNav: boolean;
    showExport: boolean;
    categories: Category[];
    showLegend: boolean;
    emptyMessage: string;   // shown in the header (and list) when no events are configured; '' = hidden
    loading: boolean;       // author binds this to their query state -> thin bar + stale-while-revalidate
    refetchDebounceMs: number;   // coalesce rapid navigation into one visibleStart/End write (0 = immediate)
    editable: boolean;
    selectable: boolean;
    builtInEditor: boolean;
    weekStart: WeekStart;
    locale: string;
    timezone: string;   // IANA zone for display (empty = browser/session local)
    showWeekends: boolean;
    dayStartHour: number;
    dayEndHour: number;
    slotMinutes: number;   // week/day grid resolution + snapping (a divisor of 60: 60/30/15/10/5)
    scrollToHour: number;
    scrollToNow: boolean;
    refreshSeconds: number;
    labels: CalLabels;
    events: CalEvent[];
    // Recurring event definitions, kept separate so they can be bound to a small,
    // ALWAYS-loaded query (WHERE rrule IS NOT NULL) while `events` is windowed — the
    // component merges + expands both, so a windowed query never silently drops a series.
    recurringEvents: CalEvent[];
}

/** An in-flight drag/resize/create gesture. */
export interface Gesture {
    mode: GestureMode;
    surface?: 'month';        // set for a month-view day-to-day move (default: the time grid)
    ev?: CalEvent;            // move / resize target
    startClientX: number;
    startClientY: number;
    origStartMin: number;
    origEndMin: number;
    durationMin: number;
    origDayIso: string;       // time grid: the event's day; month: the cell under the initial pointer
    moved: boolean;
}

/** The ghost / selection rectangle shown while a gesture is active. */
export interface Preview {
    mode: GestureMode;
    surface?: 'month';   // month move: dayIso = the drop-target cell; no minute geometry
    eventId?: string;
    title?: string;
    color?: string;
    dayIso: string;
    startMin: number;
    endMin: number;
}

export interface HoverInfo {
    event: CalEvent;
    rect: { top: number; bottom: number; left: number; right: number };
}

export interface Editor {
    id: string | null;   // null = creating a new event; set = editing an existing one
    title: string;
    start: string;   // 'YYYY-MM-DDTHH:mm' (timed) or 'YYYY-MM-DD' (all-day)
    end: string;
    allDay: boolean;
    category: string;   // category id ('' = none); the category supplies the colour
    description: string;

    // --- recurrence (built-in editor) ---
    repeatFreq: '' | 'daily' | 'weekly' | 'monthly' | 'yearly';   // '' = does not repeat
    repeatInterval: number;        // every N units (>=1)
    repeatByweekday: number[];     // weekly only: 0=Sun..6=Sat
    repeatEndMode: 'never' | 'until' | 'count';
    repeatUntil: string;           // 'YYYY-MM-DD' (when repeatEndMode='until')
    repeatCount: number;           // (when repeatEndMode='count')

    // --- edit context for an occurrence of an existing series ---
    seriesId: string | null;       // base event id when editing a recurring occurrence (else null)
    occurrenceDate: string | null; // 'YYYY-MM-DD' of the opened occurrence
    scope: 'series' | 'occurrence';// apply-to choice (only meaningful when seriesId != null)
}

export interface MiniNav {
    rect: { top: number; bottom: number; left: number; right: number };  // anchor (title) rect
    month: Date;   // the month shown in the mini grid (independent of the main cursor)
}

export interface DayPop {
    iso: string;   // the day whose events are listed
    rect: { top: number; bottom: number; left: number; right: number };  // anchor (cell) rect
}

export interface CalendarState {
    cursor: Date;   // anchor day (drives the displayed month / week / day)
    preview: Preview | null;
    hover: HoverInfo | null;   // event under the cursor -> detail popover
    editor: Editor | null;     // built-in new-event editor popover
    mini: MiniNav | null;      // mini-month navigator popover (null = closed)
    dayPop: DayPop | null;     // month-view "all events for a day" popover
    hiddenCats: Set<string>;   // category ids hidden via the legend filter
    monthCap: number;          // how many chips fit a month cell (auto-fit; measured at runtime)
}
