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
 * Describes the Calendar / Scheduler component to the Java-side registry. M0 is a
 * read-oriented month view bound to a JSON array of events; later milestones add
 * week/day time-grid views, editing (drag/resize), and recurrence.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components).
 */
public class Calendar {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.display.calendar";

    /** Props schema (defaults, types) loaded from the common resources. */
    public static final JsonSchema SCHEMA = JsonSchema.parse(
        Calendar.class.getResourceAsStream("/calendar.props.json"));

    /** Payload schema for the onEventClick component event. */
    public static final JsonSchema ON_EVENT_CLICK_SCHEMA = JsonSchema.parse(
        Calendar.class.getResourceAsStream("/calendar.oneventclick.event.json"));

    /** Payload schema for the onDateClick component event. */
    public static final JsonSchema ON_DATE_CLICK_SCHEMA = JsonSchema.parse(
        Calendar.class.getResourceAsStream("/calendar.ondateclick.event.json"));

    /** Payload schema for the onSelect component event. */
    public static final JsonSchema ON_SELECT_SCHEMA = JsonSchema.parse(
        Calendar.class.getResourceAsStream("/calendar.onselect.event.json"));

    /** Payload schema for the onChange component event (the single data-mutation event). */
    public static final JsonSchema ON_CHANGE_SCHEMA = JsonSchema.parse(
        Calendar.class.getResourceAsStream("/calendar.onchange.event.json"));

    /** Palette/browser icon + drag thumbnail (drawn, not bundled). */
    private static final BufferedImage ICON = MustrySolutionsPerspectiveComponentsModule.paletteIcon(COMPONENT_ID);

    /** The descriptor registered with Perspective's component registries. */
    public static final ComponentDescriptor DESCRIPTOR = ComponentDescriptorImpl.ComponentBuilder.newBuilder()
        .setPaletteCategory(MustrySolutionsPerspectiveComponentsModule.COMPONENT_CATEGORY)
        .setId(COMPONENT_ID)
        .setModuleId(MustrySolutionsPerspectiveComponentsModule.MODULE_ID)
        .setSchema(SCHEMA)
        .setName("Calendar")
        .setIcon(new ImageIcon(ICON))
        .addPaletteEntry("", "Calendar",
            "A month/week/day calendar bound to a list of events.", ICON, null)
        .setDefaultMetaName("calendar")
        .setEvents(List.of(
            new ComponentEventDescriptor(
                "onEventClick",
                "Fires when an event is clicked. Payload is the full event object.",
                ON_EVENT_CLICK_SCHEMA),
            new ComponentEventDescriptor(
                "onDateClick",
                "Fires when an empty day cell is clicked.",
                ON_DATE_CLICK_SCHEMA),
            new ComponentEventDescriptor(
                "onSelect",
                "Fires when an empty time range is dragged out (selectable). Intent event — use it to create a new event with your own UI.",
                ON_SELECT_SCHEMA),
            new ComponentEventDescriptor(
                "onChange",
                "The single data-mutation event — fires for ANY change (create/edit/delete/move/resize). Payload: { action, event }, where event always carries the final start/end. Handle this one to persist the change or trigger downstream logic.",
                ON_CHANGE_SCHEMA)))
        .setResources(MustrySolutionsPerspectiveComponentsModule.BROWSER_RESOURCES)
        .build();
}
