// CSV serialisation shared by the components' export buttons.
//
// Cells are RFC-4180-quoted, and cells that would be interpreted as formulas by
// spreadsheet apps (=, +, -, @, tab/CR starts) get a leading apostrophe — the
// standard CSV-injection mitigation, since exports are routinely opened in Excel.
// Plain numbers that only happen to start with +/- are left alone so Excel keeps
// them numeric (sums, charts, etc.).

/** UTF-8 byte-order mark. Prepend to the downloaded blob (NOT the CSV text
 *  itself) so Excel detects UTF-8 instead of mangling accented characters. */
export const CSV_BOM = '\ufeff';

/** Whole-cell plain number: optional sign, digits with . or , group/decimal
 *  separators, optional scientific exponent. Anything else that starts with a
 *  formula-risk character still gets the apostrophe guard. */
const PLAIN_NUMBER = /^[+-]?\d[\d.,]*(e[+-]?\d+)?$/i;

/** One CSV cell: formula-guard first, then quote when the content needs it. */
export function csvCell(v: string): string {
    const needsGuard = /^[=+\-@\t\r]/.test(v) && !PLAIN_NUMBER.test(v);
    const guarded = needsGuard ? `'${v}` : v;
    return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
