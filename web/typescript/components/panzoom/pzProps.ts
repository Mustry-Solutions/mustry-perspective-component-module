// Prop-tree -> typed props for the Pan & Zoom View.
import { PropReader } from '../../shared/propReader';
import { PzHome, PzPoint } from './panZoomLogic';

export interface PanZoomProps {
    viewPath: string;
    viewParams: Record<string, unknown>;
    contentWidth: number;
    contentHeight: number;
    minZoom: number;
    maxZoom: number;
    zoomStep: number;
    wheelZoom: boolean;
    doubleClickZoom: boolean;
    showControls: boolean;
    home: PzHome;
    zoom: number;        // state.zoom (two-way; <= 0 = unset -> home)
    center: PzPoint;     // state.center (two-way, content coords)
}

export function mapPanZoomProps(tree: PropReader): PanZoomProps {
    const num = (path: string, dflt: number): number => {
        const n = tree.readNumber(path, dflt);
        return Number.isFinite(n) ? n : dflt;
    };
    const minZoom = Math.max(0.01, num('config.minZoom', 0.1));
    const maxZoom = Math.max(minZoom, num('config.maxZoom', 8));
    return {
        viewPath: tree.readString('config.viewPath', ''),
        // readObject isn't in the reader contract; params arrive as an array of
        // {name, value} pairs OR we read known keys — simplest portable shape:
        viewParams: ((arr) => {
            const out: Record<string, unknown> = {};
            (arr || []).forEach((e: any) => {
                const k = String((e && e.name) || '');
                if (k) {
                    out[k] = e.value;
                }
            });
            return out;
        })(tree.readArray('config.viewParams', [])),
        contentWidth: Math.max(1, num('config.contentWidth', 1600)),
        contentHeight: Math.max(1, num('config.contentHeight', 1200)),
        minZoom,
        maxZoom,
        zoomStep: Math.min(3, Math.max(1.05, num('config.zoomStep', 1.25))),
        wheelZoom: tree.readBoolean('config.wheelZoom', true),
        doubleClickZoom: tree.readBoolean('config.doubleClickZoom', true),
        showControls: tree.readBoolean('config.showControls', true),
        home: {
            x: num('config.home.x', -1),
            y: num('config.home.y', -1),
            zoom: num('config.home.zoom', 0)
        },
        zoom: num('state.zoom', 0),
        center: { x: num('state.center.x', 0), y: num('state.center.y', 0) }
    };
}
