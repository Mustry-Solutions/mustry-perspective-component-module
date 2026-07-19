// Reads the Perspective PropertyTree into the typed props the component uses.
import { PropertyTree } from '@inductiveautomation/perspective-client';
import { ColorLabels, colorLabelBase } from '../../shared/labels/color';
import { ColorFormat } from './colorLogic';

export type ColorMode = 'inline' | 'popover';

export interface ColorPickerProps {
    mode: ColorMode;
    enabled: boolean;
    format: ColorFormat;
    showAlpha: boolean;
    showInput: boolean;
    showSwatches: boolean;
    showRecent: boolean;
    showEyedropper: boolean;
    popoverScrim: boolean;
    locale: string;
    labels: ColorLabels;
    /** The two-way value (value.color) — any accepted colour string; '' means unset. */
    color: string;
    /** Bound palette (data.swatches) — colour strings shown as quick picks. */
    swatches: string[];
}

function normFormat(s: string): ColorFormat {
    return s === 'rgb' || s === 'hsl' ? s : 'hex';
}

export function mapColorProps(tree: PropertyTree): ColorPickerProps {
    const locale = tree.readString('config.locale', '');
    const base = colorLabelBase(locale);
    const labels = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof ColorLabels>).forEach((k) => {
        const v = tree.readString(`config.labels.${k}`, '');
        labels[k] = v !== '' ? v : base[k];
    });

    const swatches = tree.readArray('data.swatches', []).filter((s) => typeof s === 'string') as string[];

    return {
        mode: tree.readString('config.mode', 'popover') === 'inline' ? 'inline' : 'popover',
        enabled: tree.readBoolean('config.enabled', true),
        format: normFormat(tree.readString('config.format', 'hex')),
        showAlpha: tree.readBoolean('config.showAlpha', false),
        showInput: tree.readBoolean('config.showInput', true),
        showSwatches: tree.readBoolean('config.showSwatches', true),
        showRecent: tree.readBoolean('config.showRecent', true),
        showEyedropper: tree.readBoolean('config.showEyedropper', true),
        popoverScrim: tree.readBoolean('config.popoverScrim', false),
        locale,
        labels: labels as unknown as ColorLabels,
        color: tree.readString('value.color', ''),
        swatches
    };
}
