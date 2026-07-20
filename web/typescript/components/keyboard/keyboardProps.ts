// Reads the Perspective PropertyTree into the typed props the component uses.
import { PropertyTree } from '@inductiveautomation/perspective-client';
import { KeyboardLabels, keyboardLabelBase } from '../../shared/labels/keyboard';
import { TextLayout } from './keyboardLayouts';

/** 'numpad' is the numeric keypad; the rest are alphanumeric (QWERTY) layouts. */
export type KeyboardLayout = 'numpad' | TextLayout;
export type KeyboardMode = 'inline' | 'popover';

export interface KeyboardProps {
    layout: KeyboardLayout;
    mode: KeyboardMode;
    enabled: boolean;
    // numeric (numpad) config
    decimals: number;
    allowNegative: boolean;
    enforceRange: boolean;
    min: number;
    max: number;
    units: string;
    // text (qwerty) config
    maxLength: number;
    // shared
    showValue: boolean;
    liveUpdate: boolean;
    locale: string;
    labels: KeyboardLabels;
    /** The two-way numeric value (value.value) — used by the 'numpad' layout. */
    value: number;
    /** The two-way text value (value.text) — used by the text layouts. */
    text: string;
}

function normLayout(s: string): KeyboardLayout {
    return s === 'text' || s === 'email' || s === 'url' ? s : 'numpad';
}

export function mapKeyboardProps(tree: PropertyTree): KeyboardProps {
    const locale = tree.readString('config.locale', '');
    const base = keyboardLabelBase(locale);
    const labels = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof KeyboardLabels>).forEach((k) => {
        const v = tree.readString(`config.labels.${k}`, '');
        labels[k] = v !== '' ? v : base[k];
    });

    return {
        layout: normLayout(tree.readString('config.layout', 'numpad')),
        mode: tree.readString('config.mode', 'inline') === 'popover' ? 'popover' : 'inline',
        enabled: tree.readBoolean('config.enabled', true),
        decimals: Math.max(0, Math.min(10, tree.readNumber('config.decimals', 2))),
        allowNegative: tree.readBoolean('config.allowNegative', true),
        enforceRange: tree.readBoolean('config.enforceRange', false),
        min: tree.readNumber('config.min', 0),
        max: tree.readNumber('config.max', 100),
        units: tree.readString('config.units', ''),
        maxLength: Math.max(0, tree.readNumber('config.maxLength', 0)),
        showValue: tree.readBoolean('config.showValue', true),
        liveUpdate: tree.readBoolean('config.liveUpdate', false),
        locale,
        labels: labels as unknown as KeyboardLabels,
        value: tree.readNumber('value.value', 0),
        text: tree.readString('value.text', '')
    };
}
