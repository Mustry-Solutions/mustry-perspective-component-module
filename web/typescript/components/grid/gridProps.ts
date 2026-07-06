// Prop-tree -> typed props for the Data Grid (the reducer half of the component).
import { PropReader } from '../../shared/propReader';
import { EN_GRID_LABELS, GridLabels, gridLabelBase } from '../../shared/labelPacks';
import { CellStyleRule, ColumnLayoutState, ColumnType, GridColumn, GridSort, MIN_COL_PX, ROW_H_MIN, ROW_H_MAX, RowSelectMode, SortDir } from './gridLogic';

export interface GridProps {
    columns: GridColumn[];
    rows: Array<Record<string, unknown>>;
    rowHeight: number;
    idField: string;
    rowSelect: RowSelectMode;
    showToolbar: boolean;
    showExport: boolean;
    locale: string;
    loading: boolean;
    emptyMessage: string;
    labels: GridLabels;
    sort: GridSort;
    quickFilter: string;
    selection: string[];
    columnLayout: ColumnLayoutState;
}

function mapStyleRule(r: any): CellStyleRule | null {
    if (!r || typeof r !== 'object') {
        return null;
    }
    const rule: CellStyleRule = {};
    if (r.equals !== undefined) { rule.equals = r.equals; }
    if (Number.isFinite(Number(r.gt)) && r.gt !== '' && r.gt !== null && r.gt !== undefined) { rule.gt = Number(r.gt); }
    if (Number.isFinite(Number(r.lt)) && r.lt !== '' && r.lt !== null && r.lt !== undefined) { rule.lt = Number(r.lt); }
    if (r.contains !== undefined && r.contains !== '') { rule.contains = String(r.contains); }
    if (r.color) { rule.color = String(r.color); }
    if (r.background) { rule.background = String(r.background); }
    // a rule with no condition or no effect does nothing — drop it
    const hasCond = 'equals' in rule || 'gt' in rule || 'lt' in rule || 'contains' in rule;
    const hasEffect = rule.color !== undefined || rule.background !== undefined;
    return hasCond && hasEffect ? rule : null;
}

const COLUMN_TYPES: ColumnType[] = ['text', 'number', 'date', 'datetime', 'boolean'];

function mapColumn(c: any): GridColumn | null {
    const field = String((c && c.field) || '');
    if (!field) {
        return null;   // a column without a field can't display anything
    }
    const width = Number(c && c.width);
    const type: ColumnType = COLUMN_TYPES.indexOf(c && c.type) >= 0 ? c.type : 'text';
    // numbers read best right-aligned unless the author says otherwise
    const align = c && (c.align === 'center' || c.align === 'right' || c.align === 'left')
        ? c.align : (type === 'number' ? 'right' : 'left');
    const decimals = Number(c && c.decimals);
    return {
        field,
        header: String((c && c.header) || ''),
        width: Number.isFinite(width) && width >= MIN_COL_PX ? width : 120,
        pinned: !!(c && c.pinned),
        align,
        type,
        decimals: Number.isFinite(decimals) && decimals >= 0 ? Math.min(6, decimals) : -1,
        cellStyles: ((c && c.cellStyles) || [])
            .map(mapStyleRule)
            .filter((r: CellStyleRule | null): r is CellStyleRule => r !== null)
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
        idField: tree.readString('config.idField', 'id') || 'id',
        rowSelect: ((m) => (m === 'single' || m === 'multi' ? m : 'none'))(
            tree.readString('config.rowSelect', 'none')) as RowSelectMode,
        showToolbar: tree.readBoolean('config.showToolbar', true),
        showExport: tree.readBoolean('config.showExport', false),
        loading: tree.readBoolean('config.loading', false),
        emptyMessage: tree.readString('config.emptyMessage', 'No rows'),
        labels: labels as unknown as GridLabels,
        sort: {
            field: tree.readString('state.sort.field', ''),
            dir: ((d) => (d === 'asc' || d === 'desc' ? d : ''))(tree.readString('state.sort.dir', '')) as SortDir
        },
        quickFilter: tree.readString('state.quickFilter', ''),
        selection: (tree.readArray('state.selection', []) || []).map((v: any) => String(v)).filter((v: string) => v),
        columnLayout: {
            widths: ((arr) => {
                const out: Record<string, number> = {};
                (arr || []).forEach((e: any) => {
                    const f = String((e && e.field) || '');
                    const n = Number(e && e.width);
                    if (f && Number.isFinite(n) && n > 0) {
                        out[f] = n;
                    }
                });
                return out;
            })(tree.readArray('state.columnLayout.widths', [])),
            order: (tree.readArray('state.columnLayout.order', []) || []).map((v: any) => String(v)).filter((v: string) => v),
            hidden: (tree.readArray('state.columnLayout.hidden', []) || []).map((v: any) => String(v)).filter((v: string) => v)
        }
    };
}
