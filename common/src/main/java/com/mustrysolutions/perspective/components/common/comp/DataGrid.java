package com.mustrysolutions.perspective.components.common.comp;

import java.awt.image.BufferedImage;
import java.util.List;

import javax.swing.ImageIcon;

import com.inductiveautomation.ignition.common.jsonschema.JsonSchema;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;
import com.inductiveautomation.perspective.common.api.ComponentEventDescriptor;

import com.mustrysolutions.perspective.components.common.MustrySolutionsPerspectiveComponentsModule;

/**
 * Describes the (editable) Data Grid component to the Java-side registry so the
 * gateway and designer know about it and where to find its front-end (JS/CSS).
 *
 * <p>Editing is controlled: onCellEdit/onRowAdd/onRowsDelete fire for the
 * author to persist — the grid never mutates its own data (see
 * docs/data-grid-plan.md).
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

    public static final JsonSchema ON_CELL_EDIT_SCHEMA = JsonSchema.parse(
        DataGrid.class.getResourceAsStream("/datagrid.oncelledit.event.json"));

    public static final JsonSchema ON_ROW_ADD_SCHEMA = JsonSchema.parse(
        DataGrid.class.getResourceAsStream("/datagrid.onrowadd.event.json"));

    public static final JsonSchema ON_ROWS_DELETE_SCHEMA = JsonSchema.parse(
        DataGrid.class.getResourceAsStream("/datagrid.onrowsdelete.event.json"));

    public static final JsonSchema ON_BATCH_SAVE_SCHEMA = JsonSchema.parse(
        DataGrid.class.getResourceAsStream("/datagrid.onbatchsave.event.json"));

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
            "An editable virtualized data grid: typed cell editors with validation, frozen columns, write-back events.", ICON, null)
        .setDefaultMetaName("dataGrid")
        .setEvents(List.of(
            new ComponentEventDescriptor(
                "onCellEdit",
                "Fires after a cell edit passes validation, with the old/new value and the full row — persist it and rebind data.rows.",
                ON_CELL_EDIT_SCHEMA),
            new ComponentEventDescriptor(
                "onRowAdd",
                "Fires when the toolbar add button is clicked (config.allowAdd).",
                ON_ROW_ADD_SCHEMA),
            new ComponentEventDescriptor(
                "onRowsDelete",
                "Fires when the toolbar delete button is clicked with rows selected (config.allowDelete).",
                ON_ROWS_DELETE_SCHEMA),
            new ComponentEventDescriptor(
                "onBatchSave",
                "Batch mode: fires once for Save with every dirty cell and each changed row — persist and rebind data.rows.",
                ON_BATCH_SAVE_SCHEMA)))
        .setResources(MustrySolutionsPerspectiveComponentsModule.BROWSER_RESOURCES)
        .build();
}
