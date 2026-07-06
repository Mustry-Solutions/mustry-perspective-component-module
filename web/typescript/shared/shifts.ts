// Shift definitions ({label, start: 'HH:mm'}) shared by the components that draw
// shift boundaries. Pure and framework-free; parsing/validation mirrors the
// timeline's rules (timelineLogic.shiftStartMinutes) so the timeline can adopt
// this module later without behaviour changes.

/** One shift definition: a zone-local start-of-shift wall time. */
export interface ShiftDef {
    label: string;
    start: string;   // 'HH:mm'
}

/** Parsed 'HH:mm' (minutes into the wall day), or null when malformed. */
export function shiftStartMinutes(start: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(start || '');
    if (!m) {
        return null;
    }
    const h = Number(m[1]);
    const mi = Number(m[2]);
    return h < 24 && mi < 60 ? h * 60 + mi : null;
}

/** Map raw config entries to ShiftDefs, dropping malformed ones (no 'HH:mm' start). */
export function parseShifts(raw: any[] | null | undefined): ShiftDef[] {
    return (raw || [])
        .map((s: any) => ({ label: String((s && s.label) || ''), start: String((s && s.start) || '') }))
        .filter((s: ShiftDef) => shiftStartMinutes(s.start) !== null);
}

/** A shift boundary placed on the time grid: its label + minutes-from-midnight. */
export interface ShiftMark {
    label: string;
    min: number;
}

/** The shift starts that fall within the visible [winStart, winEnd) minute window. */
export function visibleShifts(shifts: ShiftDef[], winStart: number, winEnd: number): ShiftMark[] {
    return (shifts || [])
        .map((s) => ({ label: s.label, min: shiftStartMinutes(s.start) as number }))
        .filter((s) => s.min !== null && s.min >= winStart && s.min < winEnd);
}
