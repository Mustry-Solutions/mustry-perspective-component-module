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
        // V8: "... at position 42 (line 3 column 7)" or "... at position 42".
        let pos = -1;
        let line = 0;
        const lineCol = /line (\d+) column (\d+)/.exec(message);
        const position = /at position (\d+)/.exec(message);
        if (position) {
            pos = Math.min(parseInt(position[1], 10), code.length);
        }
        if (lineCol) {
            line = parseInt(lineCol[1], 10);
        } else if (pos >= 0) {
            line = code.slice(0, pos).split('\n').length;
        }
        return { valid: false, message, line, pos };
    }
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
