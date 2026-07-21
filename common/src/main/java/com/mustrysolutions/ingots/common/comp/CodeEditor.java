package com.mustrysolutions.ingots.common.comp;

import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.descriptor;
import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Code / JSON Editor component: CodeMirror-based editing (and
 * read-only viewing with folding) of JSON / Python / SQL / XML / plain text,
 * with live JSON validation. Controlled write-back: Save fires onSave.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/code).
 */
public class CodeEditor {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.ingots.input.codeeditor";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Code Editor", "codeEditor",
        "A code/JSON editor (and viewer): syntax highlighting, folding, search, live JSON validation.",
        "/codeeditor.props.json",
        List.of(
            event("onSave",
                "Fires when the user saves their edits. Payload: { code, isValid, errorMessage } (validity is JSON-language only; always true otherwise). Persist code and rebind data.code — the editor clears its dirty state when the saved code round-trips.",
                "/codeeditor.onsave.event.json")));
}
