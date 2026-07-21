package com.mustrysolutions.ingots.common.comp;

import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.descriptor;
import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the On-Screen Keyboard component: a touch numeric keypad whose value
 * display is a {@code <div>} (not an {@code <input>}), so it never summons the OS
 * on-screen keyboard — the "double-keyboard" problem Perspective's native entry
 * fields have on touchscreens. Controlled: taps build a draft, Enter commits and
 * fires onCommit. (This milestone: numeric keypad; QWERTY layouts follow.)
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/keyboard).
 */
public class Keyboard {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.ingots.input.keyboard";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "On-Screen Keyboard", "onScreenKeyboard",
        "A touch keyboard that never raises the OS keyboard (its display is a div, not an input). Numeric keypad (min/max, decimals, units) or QWERTY text/email/url layouts; controlled write-back on Enter.",
        "/keyboard.props.json",
        List.of(
            event("onCommit",
                "Fires when the user presses Enter. Payload: { value, text, isValid }. `value` is the committed number (clamped when config.enforceRange). Persist it and rebind value.value.",
                "/keyboard.oncommit.event.json"),
            event("onChange",
                "Fires on every key while typing. Payload: { draft, value } where `draft` is the in-progress string and `value` is its parsed number (null until it parses).",
                "/keyboard.onchange.event.json")));
}
