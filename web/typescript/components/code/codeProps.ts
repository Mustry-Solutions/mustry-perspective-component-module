// Reads the Perspective PropertyTree into the typed props the component uses.
import { PropertyTree } from '@inductiveautomation/perspective-client';
import { CodeLabels, codeLabelBase } from '../../shared/labels/code';
import { CodeLanguage, normalizeLanguage } from './codeLogic';

export type CodeMode = 'edit' | 'display';

export interface CodeProps {
    mode: CodeMode;
    enabled: boolean;
    language: CodeLanguage;
    showToolbar: boolean;
    lineNumbers: boolean;
    lineWrapping: boolean;
    tabSize: number;
    placeholder: string;
    locale: string;
    labels: CodeLabels;
    code: string;
}

export function mapCodeProps(tree: PropertyTree): CodeProps {
    const locale = tree.readString('config.locale', '');
    const base = codeLabelBase(locale);
    const labels = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof CodeLabels>).forEach((k) => {
        const v = tree.readString(`config.labels.${k}`, '');
        labels[k] = v !== '' ? v : base[k];
    });

    return {
        mode: tree.readString('config.mode', 'edit') === 'display' ? 'display' : 'edit',
        enabled: tree.readBoolean('config.enabled', true),
        language: normalizeLanguage(tree.readString('config.language', 'json')),
        showToolbar: tree.readBoolean('config.showToolbar', true),
        lineNumbers: tree.readBoolean('config.lineNumbers', true),
        lineWrapping: tree.readBoolean('config.lineWrapping', false),
        tabSize: Math.max(1, Math.min(8, tree.readNumber('config.tabSize', 2))),
        placeholder: tree.readString('config.placeholder', ''),
        locale,
        labels: labels as unknown as CodeLabels,
        code: tree.readString('data.code', '')
    };
}
