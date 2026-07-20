// Pure layout definitions for the alphanumeric (text) keyboard — no DOM, no
// React (node-tested). getRows() returns the key grid for a text layout + the
// active layer (+ shift), so the component just renders what it's given and the
// character/behaviour rules stay here and testable. The numeric keypad has its
// own grid in KeypadKeys; this is the QWERTY side.

export type KeyAction = 'char' | 'backspace' | 'enter' | 'shift' | 'space' | 'layer';
export type KeyLayer = 'letters' | 'symbols';
export type TextLayout = 'text' | 'email' | 'url';

export interface KeyDef {
    /** Text shown on the key. */
    label: string;
    /** Character inserted (for 'char' / 'space'); absent for control keys. */
    value?: string;
    action: KeyAction;
    /** For a 'layer' key: which layer to switch to. */
    layer?: KeyLayer;
    /** Relative width (default 1). */
    flex?: number;
    /** Semantic class hint for styling ('control' keys look different). */
    kind?: 'control' | 'accent';
}

const c = (ch: string): KeyDef => ({ label: ch, value: ch, action: 'char' });

const LETTER_ROWS = [
    'qwertyuiop'.split(''),
    'asdfghjkl'.split(''),
    'zxcvbnm'.split('')
];

const SYMBOL_ROWS = [
    '1234567890'.split(''),
    ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
    ['.', ',', '?', '!', "'"]
];

const SHIFT: KeyDef = { label: '⇧', action: 'shift', flex: 1.5, kind: 'control' };
const BACKSPACE: KeyDef = { label: '⌫', action: 'backspace', flex: 1.5, kind: 'control' };
const ENTER = (label: string): KeyDef => ({ label, action: 'enter', flex: 2, kind: 'accent' });
const TO_SYMBOLS: KeyDef = { label: '?123', action: 'layer', layer: 'symbols', flex: 1.6, kind: 'control' };
const TO_LETTERS: KeyDef = { label: 'ABC', action: 'layer', layer: 'letters', flex: 1.6, kind: 'control' };

/** The convenience key on the bottom row that changes with the layout. */
function bottomExtras(layout: TextLayout): KeyDef[] {
    if (layout === 'email') {
        return [c('@'), { label: '.com', value: '.com', action: 'char', flex: 1.4 }];
    }
    if (layout === 'url') {
        return [c('/'), { label: '.com', value: '.com', action: 'char', flex: 1.4 }];
    }
    return [c(','), c('.')];
}

/**
 * The key rows for a text layout + layer. `shift` upper-cases letters (letters
 * layer only). The component owns the shift/layer state and just re-renders.
 */
export function getRows(layout: TextLayout, layer: KeyLayer, shift: boolean, enterLabel: string): KeyDef[][] {
    if (layer === 'symbols') {
        const [extraA, extraB] = bottomExtras(layout);
        return [
            SYMBOL_ROWS[0].map(c),
            SYMBOL_ROWS[1].map(c),
            [TO_LETTERS, ...SYMBOL_ROWS[2].map(c), BACKSPACE],
            [extraA, { label: 'space', value: ' ', action: 'space', flex: 4 }, extraB, ENTER(enterLabel)]
        ];
    }
    // letters
    const up = (ch: string): KeyDef => (shift ? c(ch.toUpperCase()) : c(ch));
    const [extraA, extraB] = bottomExtras(layout);
    return [
        LETTER_ROWS[0].map(up),
        LETTER_ROWS[1].map(up),
        [SHIFT, ...LETTER_ROWS[2].map(up), BACKSPACE],
        [TO_SYMBOLS, extraA, { label: 'space', value: ' ', action: 'space', flex: 4 }, extraB, ENTER(enterLabel)]
    ];
}

/** Append a character to the draft, respecting an optional max length (0 = unlimited). */
export function appendChar(draft: string, ch: string, maxLength: number): string {
    if (maxLength > 0 && draft.length + ch.length > maxLength) {
        return draft;
    }
    return draft + ch;
}

export function backspaceText(draft: string): string {
    return draft.slice(0, -1);
}
