package com.mustrysolutions.ingots.common.comp;

import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.descriptor;
import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the (editable) Data Grid component to the Java-side registry.
 *
 * <p>Editing is controlled: onCellEdit/onRowAdd/onRowsDelete fire for the
 * author to persist — the grid never mutates its own data (see the Data Grid
 * section of the README).
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/grid).
 */
public class DataGrid {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.ingots.input.datagrid";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Data Grid", "dataGrid",
        "An editable virtualized data grid: typed cell editors with validation, frozen columns, write-back events.",
        "/datagrid.props.json",
        List.of(
            event("onCellEdit",
                "Fires after a cell edit passes validation, with the old/new value and the full row — persist it and rebind data.rows.",
                "/datagrid.oncelledit.event.json"),
            event("onRowAdd",
                "Fires when the toolbar add button is clicked (config.allowAdd).",
                "/datagrid.onrowadd.event.json"),
            event("onRowsDelete",
                "Fires when the toolbar delete button is clicked with rows selected (config.allowDelete).",
                "/datagrid.onrowsdelete.event.json"),
            event("onBatchSave",
                "Batch mode: fires once for Save with every dirty cell and each changed row — persist and rebind data.rows.",
                "/datagrid.onbatchsave.event.json")));
}
