package com.mustrysolutions.perspective.components.common.comp;

import java.util.List;

import com.inductiveautomation.ignition.common.jsonschema.JsonSchema;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;
import com.inductiveautomation.perspective.common.api.ComponentEventDescriptor;

import com.mustrysolutions.perspective.components.common.MustrySolutionsPerspectiveComponentsModule;

/**
 * Describes the Resource Timeline component to the Java-side registry so the
 * gateway and designer know about it and where to find its front-end (JS/CSS).
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/timeline).
 */
public class ResourceTimeline {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.display.resourcetimeline";

    /** Props schema (types, descriptions) loaded from the common resources. */
    public static final JsonSchema SCHEMA = JsonSchema.parse(
        ResourceTimeline.class.getResourceAsStream("/resourcetimeline.props.json"));

    public static final JsonSchema ON_CHANGE_SCHEMA = JsonSchema.parse(
        ResourceTimeline.class.getResourceAsStream("/timeline.onchange.event.json"));

    public static final JsonSchema ON_EVENT_CLICK_SCHEMA = JsonSchema.parse(
        ResourceTimeline.class.getResourceAsStream("/timeline.oneventclick.event.json"));

    public static final JsonSchema ON_SELECT_SCHEMA = JsonSchema.parse(
        ResourceTimeline.class.getResourceAsStream("/timeline.onselect.event.json"));

    public static final JsonSchema ON_RESOURCE_CLICK_SCHEMA = JsonSchema.parse(
        ResourceTimeline.class.getResourceAsStream("/timeline.onresourceclick.event.json"));

    /** The descriptor registered with Perspective's component registries. */
    public static final ComponentDescriptor DESCRIPTOR = ComponentDescriptorImpl.ComponentBuilder.newBuilder()
        .setPaletteCategory(MustrySolutionsPerspectiveComponentsModule.COMPONENT_CATEGORY)
        .setId(COMPONENT_ID)
        .setModuleId(MustrySolutionsPerspectiveComponentsModule.MODULE_ID)
        .setSchema(SCHEMA)
        .setName("Resource Timeline")
        .addPaletteEntry("", "Resource Timeline",
            "A scheduling board: resources as rows on a zoomable horizontal time axis.", null, null)
        .setDefaultMetaName("resourceTimeline")
        .setEvents(List.of(
            new ComponentEventDescriptor(
                "onChange",
                "Fires for every data mutation (create / edit / delete / move / resize) with the resulting event.",
                ON_CHANGE_SCHEMA),
            new ComponentEventDescriptor(
                "onEventClick",
                "Fires when an event bar is clicked.",
                ON_EVENT_CLICK_SCHEMA),
            new ComponentEventDescriptor(
                "onSelect",
                "Fires when an empty span is dragged out on a row.",
                ON_SELECT_SCHEMA),
            new ComponentEventDescriptor(
                "onResourceClick",
                "Fires when a resource row label is clicked.",
                ON_RESOURCE_CLICK_SCHEMA)))
        .setResources(MustrySolutionsPerspectiveComponentsModule.BROWSER_RESOURCES)
        .build();
}
