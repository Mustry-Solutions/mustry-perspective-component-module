import * as React from 'react';
import { KeyDef } from './keyboardLayouts';

export interface KeyboardKeysProps {
    rows: KeyDef[][];
    shiftActive: boolean;
    enabled: boolean;
    onKey: (k: KeyDef) => void;
}

// Presentational alphanumeric (QWERTY) keyboard. It renders whatever rows
// getRows() produced; every press is reported up with its KeyDef and the
// parent applies the action (char / shift / layer / backspace / enter / space).
export function KeyboardKeys(props: KeyboardKeysProps): JSX.Element {
    const { rows, shiftActive, enabled, onKey } = props;

    const cell = (k: KeyDef, i: number): JSX.Element => {
        const cls = ['mustry-kbd-key'];
        if (k.kind === 'control') { cls.push('mustry-kbd-key--util'); }
        if (k.kind === 'accent') { cls.push('mustry-kbd-key--enter'); }
        if (k.action === 'shift' && shiftActive) { cls.push('is-active'); }
        if (k.action === 'space') { cls.push('mustry-kbd-key--space'); }
        return (
            <button
                key={i}
                type="button"
                className={cls.join(' ')}
                style={{ flex: `${k.flex || 1} 1 0` }}
                disabled={!enabled}
                aria-label={k.label}
                onClick={() => onKey(k)}
            >
                {k.label}
            </button>
        );
    };

    return (
        <div className="mustry-kbd-keys mustry-kbd-keys--text" role="group">
            {rows.map((row, i) => (
                <div className="mustry-kbd-row" key={i}>
                    {row.map(cell)}
                </div>
            ))}
        </div>
    );
}
