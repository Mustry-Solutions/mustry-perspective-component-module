// Prop-tree -> typed props for the Data Grid (the reducer half of the component).
import { PropReader } from '../../shared/propReader';
import { EN_GRID_LABELS, GridLabels, gridLabelBase } from '../../shared/labelPacks';
import { GridColumn, MIN_COL_PX, ROW_H_MIN, ROW_H_MAX } from './gridLogic';

export interface GridProps {
    columns: GridColumn[];
    rows: Array<Record<string, unknown>>;
    rowHeight: number;
    locale: string;
    loading: boolean;
    emptyMessage: string;
    labels: GridLabels;
}

function mapColumn(c: any): GridColumn | null {
    const field = String((c && c.field) || '');
    if (!field) {
        return null;   // a column without a field can't display anything
    }
    const width = Number(c && c.width);
    const align = c && (c.align === 'center' || c.align === 'right') ? c.align : 'left';
    return {
        field,
        header: String((c && c.header) || ''),
        width: Number.isFinite(width) && width >= MIN_COL_PX ? width : 120,
        pinned: !!(c && c.pinned),
        align
    };
}

export function mapGridProps(tree: PropReader): GridProps {
    const locale = tree.readString('config.locale', '');
    // config.locale picks the built-in label language; config.labels.* overrides per
    // key. A value equal to the built-in English text counts as "unset" (house rule:
    // materialized schema defaults must not shadow the locale packs).
    const base = gridLabelBase(locale);
    const labels = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof GridLabels>).forEach((k) => {
        const v = tree.readString(`config.labels.${k}`, '');
        labels[k] = v === '' || v === EN_GRID_LABELS[k] ? base[k] : v;
    });
    return {
        columns: (tree.readArray('config.columns', []) || [])
            .map(mapColumn)
            .filter((c: GridColumn | null): c is GridColumn => c !== null),
        rows: (tree.readArray('data.rows', []) || []).filter((r: unknown) => r && typeof r === 'object'),
        rowHeight: ((h) => (Number.isFinite(h) ? Math.max(ROW_H_MIN, Math.min(ROW_H_MAX, h)) : 32))(
            tree.readNumber('config.rowHeight', 32)),
        locale,
        loading: tree.readBoolean('config.loading', false),
        emptyMessage: tree.readString('config.emptyMessage', 'No rows'),
        labels: labels as unknown as GridLabels
    };
}
