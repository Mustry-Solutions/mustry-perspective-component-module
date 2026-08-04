package com.mustrysolutions.perspective.components.common.comp;

import static com.mustrysolutions.perspective.components.common.MustryPerspectiveComponentsModule.descriptor;
import static com.mustrysolutions.perspective.components.common.MustryPerspectiveComponentsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Date/Time Range Picker component to the Java-side registry.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components).
 */
public class DateTimeRangePicker {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.perspective.input.datetimerangepicker";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Date/Time Range Picker", "dateTimeRangePicker",
        "An editable start/end date-time range picker.",
        "/datetimerangepicker.props.json",
        List.of(
            event("onRangeChanged",
                "Fires when the selected range or its derived outputs change.",
                "/onrangechanged.event.json"),
            event("onPresetSelected",
                "Fires when a quick-range preset button is clicked.",
                "/onpresetselected.event.json")));
}
