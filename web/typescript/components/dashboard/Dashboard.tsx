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
import { DashTile, effectiveTiles, gridStyle, rowsUsed } from './dashboardLogic';
import { DashboardProps, mapDashboardProps } from './dashboardProps';

// Must match Dashboard.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.display.dashboard';

/**
 * Dashboard Layout: a grid of tiles, each embedding a Perspective view by path.
 * M0 renders the authored tiles (data.tiles) on a `config.columns`-wide grid,
 * with any two-way arrangement (state.layout) applied on top. Each tile embeds
 * its view via <View> with a unique mount path. Later milestones add the
 * arrange gestures (drag/resize -> state.layout write-back).
 */
export class Dashboard extends Component<ComponentProps<DashboardProps>, {}> {

    /** A stable, unique mount path for a tile's embedded view. */
    private mountPathFor(tileId: string): string {
        const store = this.props.store;
        const safe = tileId.replace(/[^a-zA-Z0-9]/g, '_');
        return `${store.view.mountPath}.dash${store.addressPath.join('_')}_${safe}`;
    }

    private renderTile(tile: DashTile): React.ReactNode {
        const p = this.props.props;
        const store = this.props.store;
        const client = store.clientStore;
        return (
            <div
                key={tile.id}
                className="mustry-dash-tile"
                style={gridStyle(tile)}
                data-tile={tile.id}
            >
                {p.showTitles && tile.title && (
                    <div className="mustry-dash-tile-head">
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
                    <div className="mustry-dash-grid" style={gridStyleObj} data-rows={rowsUsed(tiles)}>
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
