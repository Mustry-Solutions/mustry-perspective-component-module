// Reads the Perspective PropertyTree into the typed props the component uses.
import { PropertyTree } from '@inductiveautomation/perspective-client';
import { KeyboardLabels, keyboardLabelBase } from '../../shared/labels/keyboard';

export type KeyboardLayout = 'numpad';   // M1 adds 'qwerty' etc.
export type KeyboardMode = 'inline' | 'popover';

export interface KeyboardProps {
    layout: KeyboardLayout;
    mode: KeyboardMode;
    enabled: boolean;
    decimals: number;
    allowNegative: boolean;
    enforceRange: boolean;
    min: number;
    max: number;
    units: string;
    showValue: boolean;
    liveUpdate: boolean;
    locale: string;
    labels: KeyboardLabels;
    /** The two-way committed value (value.value). */
    value: number;
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
        layout: 'numpad',
        mode: tree.readString('config.mode', 'inline') === 'popover' ? 'popover' : 'inline',
        enabled: tree.readBoolean('config.enabled', true),
        decimals: Math.max(0, Math.min(10, tree.readNumber('config.decimals', 2))),
        allowNegative: tree.readBoolean('config.allowNegative', true),
        enforceRange: tree.readBoolean('config.enforceRange', false),
        min: tree.readNumber('config.min', 0),
        max: tree.readNumber('config.max', 100),
        units: tree.readString('config.units', ''),
        showValue: tree.readBoolean('config.showValue', true),
        liveUpdate: tree.readBoolean('config.liveUpdate', false),
        locale,
        labels: labels as unknown as KeyboardLabels,
        value: tree.readNumber('value.value', 0)
    };
}
