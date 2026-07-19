package com.mustrysolutions.perspective.components.common.comp;

import static com.mustrysolutions.perspective.components.common.MustrySolutionsPerspectiveComponentsModule.descriptor;
import static com.mustrysolutions.perspective.components.common.MustrySolutionsPerspectiveComponentsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Dashboard Layout component: a grid of tiles that each embed a
 * Perspective view by path, with an operator-configurable arrangement written
 * back through state.layout.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/dashboard).
 */
public class Dashboard {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.display.dashboard";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Dashboard Layout", "dashboard",
        "A grid of tiles, each embedding a view; operators can rearrange it (two-way state.layout).",
        "/dashboard.props.json",
        List.of(
            event("onLayoutChange",
                "Fires when the operator rearranges the tiles (move/resize). Payload: { layout } (id -> {x,y,w,h}). Persist it per user/role and rebind state.layout.",
                "/dashboard.onlayoutchange.event.json")));
}
