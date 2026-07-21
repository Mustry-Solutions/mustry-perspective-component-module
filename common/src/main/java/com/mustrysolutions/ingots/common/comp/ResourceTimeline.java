package com.mustrysolutions.ingots.common.comp;

import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.descriptor;
import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Resource Timeline component to the Java-side registry.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/timeline).
 */
public class ResourceTimeline {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.ingots.display.resourcetimeline";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Resource Timeline", "resourceTimeline",
        "A scheduling board: resources as rows on a zoomable horizontal time axis.",
        "/resourcetimeline.props.json",
        List.of(
            event("onChange",
                "Fires for every data mutation (create / edit / delete / move / resize) with the resulting event.",
                "/timeline.onchange.event.json"),
            event("onEventClick",
                "Fires when an event bar is clicked.",
                "/timeline.oneventclick.event.json"),
            event("onSelect",
                "Fires when an empty span is dragged out on a row.",
                "/timeline.onselect.event.json"),
            event("onResourceClick",
                "Fires when a resource row label is clicked.",
                "/timeline.onresourceclick.event.json")));
}
