package com.mustrysolutions.perspective.components.common.comp;

import java.util.List;

import com.inductiveautomation.ignition.common.jsonschema.JsonSchema;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;
import com.inductiveautomation.perspective.common.api.ComponentEventDescriptor;

import com.mustrysolutions.perspective.components.common.MustrySolutionsPerspectiveComponentsModule;

/**
 * Describes the Date/Time Range Picker component to the Java-side registry so the
 * gateway and designer know about it and where to find its front-end (JS/CSS).
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components).
 */
public class DateTimeRangePicker {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.input.datetimerangepicker";

    /** Props schema (defaults, types) loaded from the common resources. */
    public static final JsonSchema SCHEMA = JsonSchema.parse(
        DateTimeRangePicker.class.getResourceAsStream("/datetimerangepicker.props.json"));

    /** Payload schema for the onRangeChanged component event. */
    public static final JsonSchema ON_RANGE_CHANGED_SCHEMA = JsonSchema.parse(
        DateTimeRangePicker.class.getResourceAsStream("/onrangechanged.event.json"));

    /** Payload schema for the onPresetSelected component event. */
    public static final JsonSchema ON_PRESET_SELECTED_SCHEMA = JsonSchema.parse(
        DateTimeRangePicker.class.getResourceAsStream("/onpresetselected.event.json"));

    /** The descriptor registered with Perspective's component registries. */
    public static final ComponentDescriptor DESCRIPTOR = ComponentDescriptorImpl.ComponentBuilder.newBuilder()
        .setPaletteCategory(MustrySolutionsPerspectiveComponentsModule.COMPONENT_CATEGORY)
        .setId(COMPONENT_ID)
        .setModuleId(MustrySolutionsPerspectiveComponentsModule.MODULE_ID)
        .setSchema(SCHEMA)
        .setName("Date/Time Range Picker")
        .addPaletteEntry("", "Date/Time Range Picker",
            "An editable start/end date-time range picker.", null, null)
        .setDefaultMetaName("dateTimeRangePicker")
        .setEvents(List.of(
            new ComponentEventDescriptor(
                "onRangeChanged",
                "Fires when the selected range or its derived outputs change.",
                ON_RANGE_CHANGED_SCHEMA),
            new ComponentEventDescriptor(
                "onPresetSelected",
                "Fires when a quick-range preset button is clicked.",
                ON_PRESET_SELECTED_SCHEMA)))
        .setResources(MustrySolutionsPerspectiveComponentsModule.BROWSER_RESOURCES)
        .build();
}
