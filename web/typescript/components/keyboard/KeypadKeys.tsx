import * as React from 'react';
import { KeyboardLabels } from '../../shared/labels/keyboard';
import { KeypadKey } from './keyboardLogic';

export interface KeypadKeysProps {
    labels: KeyboardLabels;
    enabled: boolean;
    allowDecimal: boolean;    // decimals > 0
    allowNegative: boolean;
    onKey: (key: KeypadKey) => void;   // digit / '.' / 'sign' / 'backspace' / 'clear'
    onEnter: () => void;
}

// The numeric keypad grid (3 columns). Purely presentational — every press is
// reported up; the draft/value logic lives in keyboardLogic + the component.
// 'enter' is a grid-only key (commit), separate from the draft-editing KeypadKeys.
type GridKey = KeypadKey | 'enter';

const ROWS: GridKey[][] = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['sign', '0', '.'],
    ['backspace', 'clear', 'enter']
];

export function KeypadKeys(props: KeypadKeysProps): JSX.Element {
    const { labels, enabled, allowDecimal, allowNegative, onKey, onEnter } = props;

    const cell = (key: GridKey): JSX.Element => {
        const isEnter = key === 'enter';
        const disabled = !enabled
            || (key === '.' && !allowDecimal)
            || (key === 'sign' && !allowNegative);

        let content: React.ReactNode = key;
        let aria = key as string;
        let cls = 'mustry-kbd-key';
        if (key === 'sign') { content = '±'; aria = labels.sign; }
        else if (key === 'backspace') { content = '⌫'; aria = labels.backspace; cls += ' mustry-kbd-key--util'; }
        else if (key === 'clear') { content = labels.clear; aria = labels.clear; cls += ' mustry-kbd-key--util'; }
        else if (isEnter) { content = labels.enter; aria = labels.enter; cls += ' mustry-kbd-key--enter'; }

        return (
            <button
                key={key}
                type="button"
                className={cls}
                disabled={disabled}
                aria-label={aria}
                onClick={isEnter ? onEnter : () => onKey(key as KeypadKey)}
            >
                {content}
            </button>
        );
    };

    return (
        <div className="mustry-kbd-keys" role="group">
            {ROWS.map((row, i) => (
                <div className="mustry-kbd-row" key={i}>
                    {row.map(cell)}
                </div>
            ))}
        </div>
    );
}
