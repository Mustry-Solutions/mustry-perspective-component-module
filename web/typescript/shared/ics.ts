// iCalendar (RFC 5545) serialisation shared by the components' .ics export buttons.
//
// Plain timed events are written in UTC, so any client places them correctly.
// Recurring series keep their local time zone instead (TZID + a generated
// VTIMEZONE): a weekly 08:00 written in UTC would move by an hour across a DST
// change. Series stay series (RRULE + EXDATE), matching what expandEvents shows.
import { RRule, occurrenceStartDates } from './recurrence';
import { addDays, daysBetween, fmtDate, instantToZonedIso, MS_PER_DAY, pad2, parseDate, toEpochMs, zoneWallClock } from './dateUtils';

/** One event to export, already mapped from the component's own shape. */
export interface IcsItem {
    id?: string;
    title?: string;
    start: string;
    end?: string;
    allDay?: boolean;
    status?: string;        // 'tentative' | 'cancelled' are exported; anything else is left out
    description?: string;
    category?: string;      // display label, not the category id
    location?: string;
    transparent?: boolean;  // doesn't block time (TRANSP:TRANSPARENT), e.g. background bands
    rrule?: RRule;
}

export interface IcsOptions {
    timezone: string;            // '' = the browser's zone, as everywhere else in the module
    now: Date;                   // DTSTAMP
    defaultDurationMin?: number; // length of a timed event with no usable end; unset = zero length
}

const PRODID = '-//Mustry Solutions//Perspective Components//EN';
const UID_DOMAIN = 'mustry-perspective';
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const FREQS = ['daily', 'weekly', 'monthly', 'yearly'];

// The range Date.toISOString renders as a four-digit year; RFC 5545 has no other form.
const MIN_MS = -62167219200000; // 0000-01-01T00:00:00Z
const MAX_MS = Date.UTC(9999, 11, 31, 23, 59, 59);

// VTIMEZONE scan: observances are listed explicitly over this range. A client keeps
// using the last one beyond it, so a never-ending series stays right for a decade.
const TZ_YEARS_AHEAD = 10;
const TZ_MIN_MS = Date.UTC(1970, 0, 1);
const TZ_MAX_MS = Date.UTC(2100, 0, 1);
const TZ_SCAN_MS = 7 * MS_PER_DAY;

/** RFC 5545 TEXT: backslash, semicolon, comma and line breaks escaped; other control characters dropped. */
export function icsText(v: string): string {
    return String(v)
        .replace(/\r\n?/g, '\n')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

function utf8Length(codePoint: number): number {
    return codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
}

/** Fold a content line at 75 octets (RFC 5545 3.1), never inside a UTF-8 sequence. */
export function icsFold(line: string): string {
    const parts: string[] = [];
    let current = '';
    let used = 0;
    let limit = 75;
    for (const ch of Array.from(line)) {
        const size = utf8Length(ch.codePointAt(0) as number);
        if (used + size > limit) {
            parts.push(current);
            current = '';
            used = 0;
            limit = 74; // the continuation line's leading space counts
        }
        current += ch;
        used += size;
    }
    parts.push(current);
    return parts.join('\r\n ');
}

/** 'YYYYMMDDTHHMMSSZ', or null for an instant RFC 5545 can't express. */
function utcStamp(ms: number): string | null {
    if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS) {
        return null;
    }
    return `${new Date(ms).toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}

function icsDate(d: Date): string {
    return `${String(d.getFullYear()).padStart(4, '0')}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/** 'YYYYMMDDTHHMMSS' from a calendar day and a "THH:mm(:ss)" suffix ('' = midnight). */
function icsLocal(day: Date, time: string): string {
    return `${icsDate(day)}T${(`${time.slice(1).replace(/:/g, '')}000000`).slice(0, 6)}`;
}

/** A usable IANA zone name; the browser's own for '' or an unknown zone. */
function namedZone(timezone: string): string {
    if (timezone) {
        try {
            new Intl.DateTimeFormat('en-US', { timeZone: timezone });
            return timezone;
        } catch (e) {
            // fall through to the browser's zone, as resolveZoned does
        }
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function durationLines(minutes: number | undefined): string[] {
    return minutes && minutes > 0 ? [`DURATION:PT${Math.round(minutes)}M`] : [];
}

/** DTSTART/DTEND for a one-off event, or null when its start can't be read. */
function singleTimeLines(item: IcsItem, zone: string, opts: IcsOptions): string[] | null {
    if (item.allDay) {
        const start = parseDate(item.start);
        if (!start) {
            return null;
        }
        const end = item.end ? parseDate(item.end) : null;
        const last = end && end.getTime() > start.getTime() ? end : addDays(start, 1); // exclusive end
        return [`DTSTART;VALUE=DATE:${icsDate(start)}`, `DTEND;VALUE=DATE:${icsDate(last)}`];
    }
    const startMs = toEpochMs(item.start, zone);
    const start = startMs === null ? null : utcStamp(startMs);
    if (startMs === null || start === null) {
        return null;
    }
    const endMs = item.end ? toEpochMs(item.end, zone) : null;
    const end = endMs !== null && endMs > startMs ? utcStamp(endMs) : null;
    return [`DTSTART:${start}`, ...(end ? [`DTEND:${end}`] : durationLines(opts.defaultDurationMin))];
}

/** The RRULE value, picking COUNT or UNTIL when the data has both (RFC 5545 allows only one). */
function rruleValue(r: RRule, base: Date, allDay: boolean, zone: string): string {
    const parts = [`FREQ=${r.freq.toUpperCase()}`];
    const interval = Math.max(1, Math.floor(r.interval || 1));
    if (interval > 1) {
        parts.push(`INTERVAL=${interval}`);
    }
    if (r.freq === 'weekly' && r.byweekday && r.byweekday.length) {
        const days = Array.from(new Set(r.byweekday.map((wd) => ((wd % 7) + 7) % 7))).sort((a, b) => a - b);
        parts.push(`BYDAY=${days.map((d) => BYDAY[d]).join(',')}`);
        if (typeof r.wkst === 'number' && Number.isInteger(r.wkst) && r.wkst >= 0 && r.wkst <= 6 && r.wkst !== 1) {
            parts.push(`WKST=${BYDAY[r.wkst]}`);
        }
    }
    const count = r.count && r.count > 0 ? Math.floor(r.count) : 0;
    const until = r.until ? parseDate(r.until) : null;
    const reachesCount = count > 0 && until !== null
        && occurrenceStartDates(base, r, base, addDays(until, 1)).length >= count;
    if (count > 0 && (until === null || reachesCount)) {
        parts.push(`COUNT=${count}`);
    } else if (until !== null) {
        if (allDay) {
            parts.push(`UNTIL=${icsDate(until)}`);
        } else {
            // The rule's date is inclusive, in the event's zone; a TZID start needs a UTC UNTIL.
            const lastMs = toEpochMs(`${fmtDate(until)}T23:59:59`, zone);
            const stamp = lastMs === null ? null : utcStamp(lastMs);
            if (stamp) {
                parts.push(`UNTIL=${stamp}`);
            }
        }
    }
    return parts.join(';');
}

interface SeriesLines {
    lines: string[];
    firstMs: number | null; // set for a timed series, which needs the VTIMEZONE
}

/** DTSTART/DTEND/RRULE/EXDATE for a series, or null when it has no occurrence at all. */
function seriesTimeLines(item: IcsItem, zone: string, opts: IcsOptions): SeriesLines | null {
    const r = item.rrule as RRule;
    const startWall = instantToZonedIso(item.start, zone).slice(0, 19);
    const base = parseDate(startWall);
    if (!base) {
        return null;
    }
    // DTSTART must be the first real occurrence: a weekly rule whose start isn't one
    // of its weekdays would otherwise gain an extra occurrence in most clients.
    const interval = Math.max(1, Math.floor(r.interval || 1));
    const first = occurrenceStartDates(base, r, base, addDays(base, 7 * interval + 7))[0];
    if (!first) {
        return null;
    }
    const endWall = item.end ? instantToZonedIso(item.end, zone).slice(0, 19) : '';
    const baseEnd = endWall ? parseDate(endWall) : null;
    const endDays = baseEnd ? daysBetween(base, baseEnd) : 0;
    const rule = `RRULE:${rruleValue(r, base, !!item.allDay, zone)}`;
    const excluded = (r.exdate || []).map((d) => parseDate(d)).filter((d): d is Date => d !== null);

    if (item.allDay) {
        return {
            firstMs: null,
            lines: [
                `DTSTART;VALUE=DATE:${icsDate(first)}`,
                `DTEND;VALUE=DATE:${icsDate(addDays(first, Math.max(1, endDays)))}`,
                rule,
                ...(excluded.length ? [`EXDATE;VALUE=DATE:${excluded.map(icsDate).join(',')}`] : [])
            ]
        };
    }

    const startTime = startWall.slice(10);
    const endTime = endWall.slice(10);
    const dtStart = icsLocal(first, startTime);
    const dtEnd = baseEnd ? icsLocal(addDays(first, endDays), endTime) : '';
    return {
        firstMs: first.getTime(),
        lines: [
            `DTSTART;TZID=${zone}:${dtStart}`,
            ...(dtEnd > dtStart ? [`DTEND;TZID=${zone}:${dtEnd}`] : durationLines(opts.defaultDurationMin)),
            rule,
            ...(excluded.length
                ? [`EXDATE;TZID=${zone}:${excluded.map((d) => icsLocal(d, startTime)).join(',')}`]
                : [])
        ]
    };
}

function offsetSeconds(ms: number, zone: string): number {
    const whole = Math.floor(ms / 1000) * 1000;
    const w = zoneWallClock(new Date(whole), zone);
    return (Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - whole) / 1000;
}

function offsetText(seconds: number): string {
    const abs = Math.abs(seconds);
    const hhmm = `${seconds < 0 ? '-' : '+'}${pad2(Math.floor(abs / 3600))}${pad2(Math.floor((abs % 3600) / 60))}`;
    return abs % 60 ? `${hhmm}${pad2(abs % 60)}` : hhmm;
}

/** A zone's observances over [fromMs, toMs]: one per offset change, plus the opening one. */
function vtimezoneLines(zone: string, fromMs: number, toMs: number): string[] {
    const changes: Array<{ atMs: number; from: number; to: number }> = [];
    let previous = offsetSeconds(fromMs, zone);
    changes.push({ atMs: fromMs, from: previous, to: previous });
    for (let t = fromMs; t < toMs; t += TZ_SCAN_MS) {
        const next = offsetSeconds(t + TZ_SCAN_MS, zone);
        if (next === previous) {
            continue;
        }
        let lo = t;
        let hi = t + TZ_SCAN_MS;
        while (hi - lo > 1000) { // narrow down to the second the offset changes
            const mid = lo + Math.floor((hi - lo) / 2000) * 1000;
            if (offsetSeconds(mid, zone) === previous) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        changes.push({ atMs: hi, from: previous, to: next });
        previous = next;
    }
    const standard = Math.min(...changes.map((c) => c.to));
    const lines = ['BEGIN:VTIMEZONE', `TZID:${zone}`];
    for (const c of changes) {
        const kind = c.to > standard ? 'DAYLIGHT' : 'STANDARD';
        const onset = (utcStamp(c.atMs + c.from * 1000) as string).slice(0, 15); // local time, old offset
        lines.push(`BEGIN:${kind}`, `DTSTART:${onset}`,
            `TZOFFSETFROM:${offsetText(c.from)}`, `TZOFFSETTO:${offsetText(c.to)}`, `END:${kind}`);
    }
    lines.push('END:VTIMEZONE');
    return lines;
}

function statusLine(status: string | undefined): string[] {
    return status === 'tentative' ? ['STATUS:TENTATIVE'] : status === 'cancelled' ? ['STATUS:CANCELLED'] : [];
}

/** Serialise events to .ics text. An item with an unreadable start is skipped; an id seen twice exports once. */
export function buildIcs(items: IcsItem[], opts: IcsOptions): string {
    const zone = namedZone(opts.timezone);
    const stamp = utcStamp(opts.now.getTime()) as string;
    const events: string[] = [];
    const seen = new Set<string>();
    let firstSeriesMs: number | null = null;
    let lastSeriesMs: number | null = null;

    (items || []).forEach((item, index) => {
        if (!item || !item.start) {
            return;
        }
        const id = item.id ? String(item.id) : '';
        if (id && seen.has(id)) {
            return;
        }
        const recurring = !!(item.rrule && FREQS.indexOf(item.rrule.freq) >= 0);
        const series = recurring ? seriesTimeLines(item, zone, opts) : null;
        const times = recurring ? (series && series.lines) : singleTimeLines(item, zone, opts);
        if (!times) {
            return;
        }
        if (id) {
            seen.add(id);
        }
        if (series && series.firstMs !== null) {
            firstSeriesMs = firstSeriesMs === null ? series.firstMs : Math.min(firstSeriesMs, series.firstMs);
            lastSeriesMs = lastSeriesMs === null ? series.firstMs : Math.max(lastSeriesMs, series.firstMs);
        }
        // Derived from the id alone, so re-importing an edited export updates events.
        events.push('BEGIN:VEVENT', `UID:${icsText(id || `item-${index}`)}@${UID_DOMAIN}`, `DTSTAMP:${stamp}`,
            `SUMMARY:${icsText(item.title || '')}`, ...times, ...statusLine(item.status),
            ...(item.transparent ? ['TRANSP:TRANSPARENT'] : []),
            ...(item.description ? [`DESCRIPTION:${icsText(item.description)}`] : []),
            ...(item.location ? [`LOCATION:${icsText(item.location)}`] : []),
            ...(item.category ? [`CATEGORIES:${icsText(item.category)}`] : []),
            'END:VEVENT');
    });

    const zones: string[] = [];
    if (firstSeriesMs !== null && lastSeriesMs !== null) {
        const fromMs = Math.max(TZ_MIN_MS, (firstSeriesMs as number) - MS_PER_DAY);
        const horizon = Math.max(lastSeriesMs as number, opts.now.getTime()) + TZ_YEARS_AHEAD * 365 * MS_PER_DAY;
        zones.push(...vtimezoneLines(zone, fromMs, Math.min(TZ_MAX_MS, horizon)));
    }
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        ...zones, ...events, 'END:VCALENDAR'];
    return `${lines.map(icsFold).join('\r\n')}\r\n`;
}
