package com.mustrysolutions.ingots.common.comp;

import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.descriptor;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Pan &amp; Zoom View component: embeds any Perspective view and
 * navigates it like a map (drag pan, wheel zoom toward the cursor, home/fit),
 * with two-way state.zoom/state.center so scripts can fly the viewport.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/panzoom).
 */
public class PanZoomView {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.ingots.display.panzoomview";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Pan & Zoom View", "panZoomView",
        "Embeds a view and navigates it like a map: pan, zoom to cursor, home/fit; scriptable center/zoom.",
        "/panzoomview.props.json",
        List.of());
}
