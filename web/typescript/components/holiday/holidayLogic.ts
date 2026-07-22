// Pure holiday logic for the Holiday Manager — no DOM, node-tested.
//
// Mirrors Ignition's HolidayModel bean: name, a single calendar date
// (serialized 'YYYY-MM-DD'), and repeatAnnually. Holidays pair with the
// Schedule Manager's observeHolidays flag: schedules that observe holidays
// are inactive on these dates.

export interface HolidayItem {
    name: string;
    /** 'YYYY-MM-DD' ('' when unset/unparseable — rendered as invalid). */
    date: string;
    repeatAnnually: boolean;
}

export function normalizeHoliday(raw: any): HolidayItem {
    const src = raw || {};
    return {
        name: src.name == null ? '' : String(src.name),
        date: src.date == null ? '' : String(src.date),
        repeatAnnually: !!src.repeatAnnually
    };
}

export interface IsoDate {
    year: number;
    month: number; // 1-12
    day: number;   // 1-31, calendar-checked
}

function isLeap(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
    return month === 2 && isLeap(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

/** Strict 'YYYY-MM-DD' parse with real calendar validation (no Date object —
 *  Date would happily roll 2026-02-31 into March). */
export function parseIsoDate(text: string): IsoDate | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
    if (!m) {
        return null;
    }
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
        return null;
    }
    return { year, month, day };
}

export function formatIsoDate(d: IsoDate): string {
    const mm = d.month < 10 ? `0${d.month}` : String(d.month);
    const dd = d.day < 10 ? `0${d.day}` : String(d.day);
    return `${d.year}-${mm}-${dd}`;
}

function compareIso(a: IsoDate, b: IsoDate): number {
    return (a.year - b.year) || (a.month - b.month) || (a.day - b.day);
}

/**
 * The holiday's next occurrence on or after `todayIso`, as 'YYYY-MM-DD' —
 * null when it will never occur again (a past, non-repeating holiday) or
 * when either date is unparseable. Feb-29 holidays observe on Feb 28 in
 * non-leap years.
 */
export function nextOccurrence(item: HolidayItem, todayIso: string): string | null {
    const date = parseIsoDate(item.date);
    const today = parseIsoDate(todayIso);
    if (!date || !today) {
        return null;
    }
    if (!item.repeatAnnually) {
        return compareIso(date, today) >= 0 ? formatIsoDate(date) : null;
    }
    const inYear = (year: number): IsoDate => {
        const day = Math.min(date.day, daysInMonth(year, date.month));
        return { year, month: date.month, day };
    };
    const thisYear = inYear(today.year);
    return formatIsoDate(compareIso(thisYear, today) >= 0 ? thisYear : inYear(today.year + 1));
}

/**
 * Display order for the rail: holidays with an upcoming occurrence first
 * (soonest on top), then never-again holidays by their original date; ties
 * and unparseables sort by name so the order is total and stable.
 */
export function sortHolidays(items: HolidayItem[], todayIso: string): HolidayItem[] {
    const key = (h: HolidayItem): [number, string, string] => {
        const next = nextOccurrence(h, todayIso);
        return next !== null ? [0, next, h.name] : [1, h.date || '9999-99-99', h.name];
    };
    return [...items].sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        return (ka[0] - kb[0])
            || (ka[1] < kb[1] ? -1 : ka[1] > kb[1] ? 1 : 0)
            || (ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0);
    });
}

/** The editable slice (the name is edited alongside, like the schedule). */
export interface HolidayDraft {
    date: string;
    repeatAnnually: boolean;
}

export function holidayDraftFromItem(item: HolidayItem): HolidayDraft {
    return { date: item.date, repeatAnnually: item.repeatAnnually };
}

export function emptyHolidayDraft(): HolidayDraft {
    return { date: '', repeatAnnually: true };
}

export function holidayDraftEquals(a: HolidayDraft, b: HolidayDraft): boolean {
    return a.date === b.date && a.repeatAnnually === b.repeatAnnually;
}

/** Serialize for onHolidaySave — the flat HolidayModel mirror. */
export function holidayDraftToFlat(name: string, draft: HolidayDraft): { [key: string]: any } {
    return {
        name: name.trim(),
        date: draft.date,
        repeatAnnually: draft.repeatAnnually
    };
}
