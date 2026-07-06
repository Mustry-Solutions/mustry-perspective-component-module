package com.mustrysolutions.perspective.components.common.comp;

import java.awt.image.BufferedImage;

import javax.swing.ImageIcon;

import com.inductiveautomation.ignition.common.jsonschema.JsonSchema;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;

import com.mustrysolutions.perspective.components.common.MustrySolutionsPerspectiveComponentsModule;

/**
 * Describes the (editable) Data Grid component to the Java-side registry so the
 * gateway and designer know about it and where to find its front-end (JS/CSS).
 *
 * <p>M0 is a read-only virtualized grid; editing events land with M2 (see
 * docs/data-grid-plan.md), so no component events are declared yet.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/grid).
 */
public class DataGrid {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.input.datagrid";

    /** Props schema (types, descriptions) loaded from the common resources. */
    public static final JsonSchema SCHEMA = JsonSchema.parse(
        DataGrid.class.getResourceAsStream("/datagrid.props.json"));

    /** Palette/browser icon + drag thumbnail (drawn, not bundled). */
    private static final BufferedImage ICON = MustrySolutionsPerspectiveComponentsModule.paletteIcon(COMPONENT_ID);

    /** The descriptor registered with Perspective's component registries. */
    public static final ComponentDescriptor DESCRIPTOR = ComponentDescriptorImpl.ComponentBuilder.newBuilder()
        .setPaletteCategory(MustrySolutionsPerspectiveComponentsModule.COMPONENT_CATEGORY)
        .setId(COMPONENT_ID)
        .setModuleId(MustrySolutionsPerspectiveComponentsModule.MODULE_ID)
        .setSchema(SCHEMA)
        .setName("Data Grid")
        .setIcon(new ImageIcon(ICON))
        .addPaletteEntry("", "Data Grid",
            "A virtualized data grid: frozen columns, sticky header; editing arrives in a later milestone.", ICON, null)
        .setDefaultMetaName("dataGrid")
        .setResources(MustrySolutionsPerspectiveComponentsModule.BROWSER_RESOURCES)
        .build();
}
