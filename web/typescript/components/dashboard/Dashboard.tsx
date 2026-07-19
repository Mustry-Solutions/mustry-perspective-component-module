import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d,
    View
} from '@inductiveautomation/perspective-client';
import { DashTile, TileGeom, effectiveTiles, gridStyle, layoutOf, rowsUsed } from './dashboardLogic';
import { columnUnit, DashCommitKind } from './dashboardGestureLogic';
import { DashboardGestureController, DashGesture, DashPreview } from './dashboardGestureController';
import { DashboardProps, mapDashboardProps } from './dashboardProps';

// Must match Dashboard.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.display.dashboard';

interface DashboardState {
    /** The tile being dragged/resized and its live geometry (null when idle). */
    preview: DashPreview | null;
}

/**
 * Dashboard Layout: a grid of tiles, each embedding a Perspective view by path.
 * Authored tiles (data.tiles) render on a `config.columns`-wide grid; the
 * operator's arrangement (state.layout) is merged on top by id. When
 * `config.arrangeable`, a tile's header drags it and a corner handle resizes
 * it — on release the new arrangement writes back to state.layout and fires
 * onLayoutChange. The tile body stays interactive (the drag lives on the
 * header), so embedded views keep working.
 */
export class Dashboard extends Component<ComponentProps<DashboardProps>, DashboardState> {

    private gridRef = React.createRef<HTMLDivElement>();
    private gestures = new DashboardGestureController({
        setPreview: (p) => this.setState({ preview: p }),
        commit: (kind, g, preview) => this.commit(kind, g, preview)
    });

    constructor(props: ComponentProps<DashboardProps>) {
        super(props);
        this.state = { preview: null };
    }

    componentWillUnmount(): void {
        this.gestures.dispose();
    }

    /** A stable, unique mount path for a tile's embedded view. */
    private mountPathFor(tileId: string): string {
        const store = this.props.store;
        const safe = tileId.replace(/[^a-zA-Z0-9]/g, '_');
        return `${store.view.mountPath}.dash${store.addressPath.join('_')}_${safe}`;
    }

    /** Pixel size of one column / row step, measured from the live grid. */
    private units(): { unitX: number; unitY: number } {
        const p = this.props.props;
        const w = this.gridRef.current ? this.gridRef.current.clientWidth : 0;
        return { unitX: columnUnit(w, p.columns, p.gap), unitY: p.rowHeight + p.gap };
    }

    private startArgs(tile: DashTile) {
        const u = this.units();
        return {
            tileId: tile.id,
            orig: { x: tile.x, y: tile.y, w: tile.w, h: tile.h } as TileGeom,
            unitX: u.unitX,
            unitY: u.unitY,
            columns: this.props.props.columns,
            minW: tile.minW,
            minH: tile.minH
        };
    }

    /** Commit a move/resize: rewrite state.layout and fire onLayoutChange. */
    private commit(_kind: DashCommitKind, g: DashGesture, preview: DashPreview | null): void {
        if (!preview) {
            return;
        }
        const p = this.props.props;
        const effective = effectiveTiles(p.tiles, p.layout, p.columns);
        const next = effective.map((t) => (t.id === g.tileId
            ? { ...t, ...preview.geom }
            : t));
        const layout = layoutOf(next);
        const layoutArray = Object.keys(layout).map((id) => ({ id, ...layout[id] }));
        this.props.store.props.write('state.layout', layoutArray);
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent('onLayoutChange', { layout: layoutArray });
        }
    }

    private renderTile(tile: DashTile): React.ReactNode {
        const p = this.props.props;
        const store = this.props.store;
        const client = store.clientStore;
        const arrange = p.arrangeable && p.enabled;
        const pv = this.state.preview;
        const geom: TileGeom = pv && pv.tileId === tile.id ? pv.geom : tile;
        const cls = ['mustry-dash-tile'];
        if (arrange) { cls.push('mustry-dash-tile--arrangeable'); }
        if (pv && pv.tileId === tile.id) { cls.push('mustry-dash-tile--dragging'); }
        const showHead = p.showTitles || arrange;
        return (
            <div key={tile.id} className={cls.join(' ')} style={gridStyle(geom)} data-tile={tile.id}>
                {showHead && (
                    <div
                        className={`mustry-dash-tile-head${arrange ? ' mustry-dash-tile-head--handle' : ''}`}
                        onPointerDown={arrange ? (e) => this.gestures.startMove(this.startArgs(tile), e) : undefined}
                        role={arrange ? 'button' : undefined}
                        aria-label={arrange ? p.labels.move : undefined}
                    >
                        {arrange && <span className="mustry-dash-grip" aria-hidden="true">⠿</span>}
                        <span className="mustry-dash-tile-title">{tile.title}</span>
                    </div>
                )}
                <div className="mustry-dash-tile-body">
                    {tile.viewPath && client ? (
                        <View
                            store={client}
                            resourcePath={tile.viewPath}
                            mountPath={this.mountPathFor(tile.id)}
                            parent={store}
                            params={tile.viewParams}
                            useDefaultWidth={false}
                            useDefaultHeight={false}
                        />
                    ) : (
                        <div className="mustry-dash-tile-missing">{tile.viewPath || '—'}</div>
                    )}
                </div>
                {arrange && (
                    <div
                        className="mustry-dash-resize"
                        aria-hidden="true"
                        onPointerDown={(e) => this.gestures.startResize(this.startArgs(tile), e)}
                    />
                )}
            </div>
        );
    }

    render() {
        const p = this.props.props;
        const tiles = effectiveTiles(p.tiles, p.layout, p.columns);
        const classes = ['mustry-dash'];
        if (!p.enabled) {
            classes.push('is-disabled');
        }
        const gridStyleObj: React.CSSProperties = {
            display: 'grid',
            gridTemplateColumns: `repeat(${p.columns}, 1fr)`,
            gridAutoRows: `${p.rowHeight}px`,
            gap: `${p.gap}px`
        };
        return (
            <div {...this.props.emit({ classes })}>
                {tiles.length === 0 ? (
                    <div className="mustry-dash-empty">{p.labels.empty}</div>
                ) : (
                    <div className="mustry-dash-grid" style={gridStyleObj} ref={this.gridRef} data-rows={rowsUsed(tiles)}>
                        {tiles.map((t) => this.renderTile(t))}
                    </div>
                )}
            </div>
        );
    }
}

export class DashboardMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        // PComponent is typed over PlainObject props; getPropsReducer below is
        // what actually guarantees the shape this class receives.
        return Dashboard as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        return { width: 800, height: 600 };
    }

    getPropsReducer(tree: PropertyTree): DashboardProps {
        return mapDashboardProps(tree);
    }
}
