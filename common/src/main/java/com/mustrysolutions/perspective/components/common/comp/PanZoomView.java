package com.mustrysolutions.perspective.components.common.comp;

import java.awt.image.BufferedImage;

import javax.swing.ImageIcon;

import com.inductiveautomation.ignition.common.jsonschema.JsonSchema;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;

import com.mustrysolutions.perspective.components.common.MustrySolutionsPerspectiveComponentsModule;

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
    public static final String COMPONENT_ID = "mustrysolutions.display.panzoomview";

    /** Props schema (types, descriptions) loaded from the common resources. */
    public static final JsonSchema SCHEMA = JsonSchema.parse(
        PanZoomView.class.getResourceAsStream("/panzoomview.props.json"));

    /** Palette/browser icon + drag thumbnail (drawn, not bundled). */
    private static final BufferedImage ICON = MustrySolutionsPerspectiveComponentsModule.paletteIcon(COMPONENT_ID);

    /** The descriptor registered with Perspective's component registries. */
    public static final ComponentDescriptor DESCRIPTOR = ComponentDescriptorImpl.ComponentBuilder.newBuilder()
        .setPaletteCategory(MustrySolutionsPerspectiveComponentsModule.COMPONENT_CATEGORY)
        .setId(COMPONENT_ID)
        .setModuleId(MustrySolutionsPerspectiveComponentsModule.MODULE_ID)
        .setSchema(SCHEMA)
        .setName("Pan & Zoom View")
        .setIcon(new ImageIcon(ICON))
        .addPaletteEntry("", "Pan & Zoom View",
            "Embeds a view and navigates it like a map: pan, zoom to cursor, home/fit; scriptable center/zoom.", ICON, null)
        .setDefaultMetaName("panZoomView")
        .setResources(MustrySolutionsPerspectiveComponentsModule.BROWSER_RESOURCES)
        .build();
}
