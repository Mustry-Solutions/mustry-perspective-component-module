// Reads the Perspective PropertyTree into the typed props the component uses.
// Kept separate (and PropertyTree-thin) so it stays testable with a fake reader.
import { PropertyTree } from '@inductiveautomation/perspective-client';
import { RteLabels, rteLabelBase } from '../../shared/labels/richtext';
import { ALL_FEATURES, RteFeatures } from './richTextLogic';

export type RteMode = 'edit' | 'display';

export interface RichTextProps {
    mode: RteMode;
    enabled: boolean;
    showToolbar: boolean;
    placeholder: string;
    locale: string;
    labels: RteLabels;
    features: RteFeatures;
    charLimit: number;
    maxImageKb: number;
    content: string;
}

export function mapRteProps(tree: PropertyTree): RichTextProps {
    const locale = tree.readString('config.locale', '');
    // config.locale picks the built-in label language; config.labels.* overrides per key.
    const base = rteLabelBase(locale);
    const labels = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof RteLabels>).forEach((k) => {
        const v = tree.readString(`config.labels.${k}`, '');
        labels[k] = v !== '' ? v : base[k];
    });

    const features = {} as Record<string, boolean>;
    (Object.keys(ALL_FEATURES) as Array<keyof RteFeatures>).forEach((k) => {
        features[k] = tree.readBoolean(`config.features.${k}`, true);
    });

    return {
        mode: tree.readString('config.mode', 'edit') === 'display' ? 'display' : 'edit',
        enabled: tree.readBoolean('config.enabled', true),
        showToolbar: tree.readBoolean('config.showToolbar', true),
        placeholder: tree.readString('config.placeholder', ''),
        locale,
        labels: labels as unknown as RteLabels,
        features: features as unknown as RteFeatures,
        charLimit: tree.readNumber('config.charLimit', 0),
        maxImageKb: tree.readNumber('config.maxImageKb', 256),
        content: tree.readString('data.content', '')
    };
}
