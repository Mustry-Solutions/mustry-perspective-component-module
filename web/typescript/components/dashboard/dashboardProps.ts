// Reads the Perspective PropertyTree into the typed props the component uses.
import { PropertyTree } from '@inductiveautomation/perspective-client';
import { DashLabels, dashLabelBase } from '../../shared/labels/dashboard';
import { DashTile, TileGeom } from './dashboardLogic';

export interface DashboardProps {
    tiles: DashTile[];
    layout: Record<string, TileGeom>;
    columns: number;
    rowHeight: number;
    gap: number;
    arrangeable: boolean;
    showTitles: boolean;
    enabled: boolean;
    locale: string;
    labels: DashLabels;
}

/** viewParams arrive as an array of {name, value} pairs (the panzoom convention). */
function readParams(arr: unknown): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    (Array.isArray(arr) ? arr : []).forEach((e) => {
        const o = (e || {}) as { name?: unknown; value?: unknown };
        const k = String(o.name ?? '');
        if (k) {
            out[k] = o.value;
        }
    });
    return out;
}

function readTiles(arr: unknown): DashTile[] {
    return (Array.isArray(arr) ? arr : [])
        .map((e, i) => {
            const o = (e || {}) as Record<string, unknown>;
            const id = String(o.id ?? `tile-${i}`);
            const minW = Math.max(1, Number(o.minW ?? 1) || 1);
            const minH = Math.max(1, Number(o.minH ?? 1) || 1);
            return {
                id,
                title: String(o.title ?? ''),
                viewPath: String(o.viewPath ?? ''),
                viewParams: readParams(o.viewParams),
                x: Math.max(0, Math.round(Number(o.x ?? 0) || 0)),
                y: Math.max(0, Math.round(Number(o.y ?? 0) || 0)),
                w: Math.max(minW, Math.round(Number(o.w ?? 3) || 3)),
                h: Math.max(minH, Math.round(Number(o.h ?? 3) || 3)),
                minW,
                minH
            } as DashTile;
        })
        .filter((t) => t.viewPath.length > 0);
}

function readLayout(arr: unknown): Record<string, TileGeom> {
    const out: Record<string, TileGeom> = {};
    (Array.isArray(arr) ? arr : []).forEach((e) => {
        const o = (e || {}) as Record<string, unknown>;
        const id = String(o.id ?? '');
        if (id) {
            out[id] = {
                x: Math.round(Number(o.x ?? 0) || 0),
                y: Math.round(Number(o.y ?? 0) || 0),
                w: Math.round(Number(o.w ?? 1) || 1),
                h: Math.round(Number(o.h ?? 1) || 1)
            };
        }
    });
    return out;
}

export function mapDashboardProps(tree: PropertyTree): DashboardProps {
    const locale = tree.readString('config.locale', '');
    const base = dashLabelBase(locale);
    const labels = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof DashLabels>).forEach((k) => {
        const v = tree.readString(`config.labels.${k}`, '');
        labels[k] = v !== '' ? v : base[k];
    });

    return {
        tiles: readTiles(tree.readArray('data.tiles', [])),
        layout: readLayout(tree.readArray('state.layout', [])),
        columns: Math.max(1, Math.min(48, tree.readNumber('config.columns', 12))),
        rowHeight: Math.max(20, tree.readNumber('config.rowHeight', 80)),
        gap: Math.max(0, tree.readNumber('config.gap', 8)),
        arrangeable: tree.readBoolean('config.arrangeable', false),
        showTitles: tree.readBoolean('config.showTitles', true),
        enabled: tree.readBoolean('config.enabled', true),
        locale,
        labels: labels as unknown as DashLabels
    };
}
