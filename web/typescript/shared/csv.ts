// CSV serialisation shared by the components' export buttons.
//
// Cells are RFC-4180-quoted, and cells that would be interpreted as formulas by
// spreadsheet apps (=, +, -, @, tab/CR starts) get a leading apostrophe — the
// standard CSV-injection mitigation, since exports are routinely opened in Excel.

/** UTF-8 byte-order mark. Prepend to the downloaded blob (NOT the CSV text
 *  itself) so Excel detects UTF-8 instead of mangling accented characters. */
export const CSV_BOM = '\ufeff';

/** One CSV cell: formula-guard first, then quote when the content needs it. */
export function csvCell(v: string): string {
    const guarded = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
