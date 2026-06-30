// Shared types + layout constants for the Calendar component and its sub-views.
import { CalEvent } from '../calendarLogic';

export type WeekStart = 'monday' | 'sunday';
export type CalView = 'month' | 'week' | 'day' | 'list';
export type GestureMode = 'move' | 'resize' | 'create';

// --- layout constants ---
export const SLOT_PX = 42;         // pixels per hour on the time grid
export const DEFAULT_DUR_MIN = 60; // assumed duration for a timed event with no end
export const SNAP_MIN = 15;        // drag/resize snapping granularity
export const ENTER_MS = 380;       // create/enter animation duration (keep ≥ the CSS animation)

export interface Category {
    id: string;
    label: string;
    color: string;
    icon?: string;   // Ignition icon path (library/name), e.g. 'material/build'
}

export interface CalendarProps {
    view: CalView;
    showToolbar: boolean;
    showMiniNav: boolean;
    showExport: boolean;
    categories: Category[];
    showLegend: boolean;
    emptyMessage: string;   // shown in the header (and list) when no events are configured; '' = hidden
    editable: boolean;
    selectable: boolean;
    builtInEditor: boolean;
    weekStart: WeekStart;
    locale: string;
    timezone: string;   // IANA zone for display (empty = browser/session local)
    showWeekends: boolean;
    dayStartHour: number;
    dayEndHour: number;
    scrollToHour: number;
    scrollToNow: boolean;
    refreshSeconds: number;
    events: CalEvent[];
}

/** An in-flight drag/resize/create gesture. */
export interface Gesture {
    mode: GestureMode;
    ev?: CalEvent;            // move / resize target
    startClientX: number;
    startClientY: number;
    origStartMin: number;
    origEndMin: number;
    durationMin: number;
    origDayIso: string;
    moved: boolean;
}

/** The ghost / selection rectangle shown while a gesture is active. */
export interface Preview {
    mode: GestureMode;
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
