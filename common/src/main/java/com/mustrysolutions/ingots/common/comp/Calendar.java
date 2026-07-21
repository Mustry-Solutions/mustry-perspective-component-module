package com.mustrysolutions.ingots.common.comp;

import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.descriptor;
import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Calendar / Scheduler component to the Java-side registry:
 * month/week/day views over a bound event list, with editing (drag/resize)
 * and recurrence.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components).
 */
public class Calendar {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.ingots.display.calendar";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Calendar", "calendar",
        "A month/week/day calendar bound to a list of events.",
        "/calendar.props.json",
        List.of(
            event("onEventClick",
                "Fires when an event is clicked. Payload is the full event object.",
                "/calendar.oneventclick.event.json"),
            event("onDateClick",
                "Fires when an empty day cell is clicked.",
                "/calendar.ondateclick.event.json"),
            event("onSelect",
                "Fires when an empty time range is dragged out (selectable). Intent event — use it to create a new event with your own UI.",
                "/calendar.onselect.event.json"),
            event("onChange",
                "The single data-mutation event — fires for ANY change (create/edit/delete/move/resize). Payload: { action, event }, where event always carries the final start/end. Handle this one to persist the change or trigger downstream logic.",
                "/calendar.onchange.event.json")));
}
