package com.mustrysolutions.perspective.components.common.comp;

import static com.mustrysolutions.perspective.components.common.MustrySolutionsPerspectiveComponentsModule.descriptor;
import static com.mustrysolutions.perspective.components.common.MustrySolutionsPerspectiveComponentsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Rich Text Editor component: true WYSIWYG editing (and safe
 * read-only display) of schema-constrained HTML — operator instructions, SOPs,
 * shift notes. Controlled write-back: Save fires onSave, the author persists.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/richtext).
 */
public class RichTextEditor {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.input.richtexteditor";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Rich Text Editor", "richTextEditor",
        "A WYSIWYG editor (and safe display) for rich text: operator instructions, SOPs, notes.",
        "/richtexteditor.props.json",
        List.of(
            event("onSave",
                "Fires when the user saves their edits. Payload: { content (sanitized HTML), plainText, wordCount }. Persist content and rebind data.content — the editor clears its dirty state when the saved content round-trips.",
                "/richtexteditor.onsave.event.json")));
}
