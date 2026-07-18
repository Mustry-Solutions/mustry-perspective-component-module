// Pure logic for the code editor: JSON validation with line/column extraction,
// pretty-printing, and the language model. No DOM, no CodeMirror — everything
// here runs under plain-node jest.

export type CodeLanguage = 'json' | 'python' | 'sql' | 'xml' | 'text';

export function normalizeLanguage(raw: string): CodeLanguage {
    const l = (raw || '').toLowerCase();
    return (['json', 'python', 'sql', 'xml', 'text'].indexOf(l) >= 0 ? l : 'text') as CodeLanguage;
}

export interface JsonValidation {
    valid: boolean;
    /** Human-readable parse error ('' when valid). */
    message: string;
    /** 1-based line of the error when derivable, else 0. */
    line: number;
    /** 0-based character offset of the error when derivable, else -1. */
    pos: number;
}

const VALID: JsonValidation = { valid: true, message: '', line: 0, pos: -1 };

/**
 * Validate a JSON document. An empty/whitespace document counts as VALID
 * (an unfilled config field is not an error — pair with a required check in
 * the author's script if emptiness matters).
 */
export function validateJson(code: string): JsonValidation {
    if (!code || !code.trim()) {
        return VALID;
    }
    try {
        JSON.parse(code);
        return VALID;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Error message formats differ per JS engine, so try several shapes:
        //   V8/Chrome:  "... at position 42 (line 3 column 7)" or "at position 42"
        //   Firefox:    "... at line 3 column 7 of the JSON data"
        //   Safari/JSC: "JSON Parse error: ..."  (no position at all)
        let pos = -1;
        let line = 0;
        let col = 0;
        const lineCol = /line (\d+) column (\d+)/.exec(message);
        const position = /at position (\d+)/.exec(message);
        if (position) {
            pos = Math.min(parseInt(position[1], 10), code.length);
        }
        if (lineCol) {
            line = parseInt(lineCol[1], 10);
            col = parseInt(lineCol[2], 10);
        } else if (pos >= 0) {
            line = code.slice(0, pos).split('\n').length;
        }
        // No engine-reported position (Safari): fall back to the line/column if
        // we have one, else leave pos at -1 (callers clamp to 0). This keeps the
        // gutter marker's degradation graceful rather than silently wrong.
        if (pos < 0 && line > 0) {
            pos = offsetFromLineCol(code, line, col);
        }
        return { valid: false, message, line, pos };
    }
}

/** Convert a 1-based line + 1-based column to a 0-based character offset. */
function offsetFromLineCol(code: string, line: number, col: number): number {
    const lines = code.split('\n');
    let offset = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) {
        offset += lines[i].length + 1;   // +1 for the newline
    }
    return Math.min(offset + Math.max(0, col - 1), code.length);
}

/** Pretty-print a JSON document; null when it doesn't parse. */
export function formatJson(code: string, indent = 2): string | null {
    if (!code || !code.trim()) {
        return code;
    }
    try {
        return JSON.stringify(JSON.parse(code), null, indent) + '\n';
    } catch (e) {
        return null;
    }
}

export function lineCountOf(code: string): number {
    return code ? code.split('\n').length : 0;
}
