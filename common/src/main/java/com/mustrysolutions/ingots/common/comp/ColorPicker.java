package com.mustrysolutions.ingots.common.comp;

import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.descriptor;
import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Color Picker component: a controlled two-way colour input with
 * HSV selection, hex / rgb / hsl formats, optional alpha, a bound swatch
 * palette and an eyedropper, in inline or popover layout. The bound truth is
 * {@code value.color}; user picks fire {@code onChange} and write the canonical
 * string back.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/color).
 */
public class ColorPicker {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.ingots.input.colorpicker";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Color Picker", "colorPicker",
        "A colour picker: HSV area, hue/alpha sliders, hex/rgb/hsl formats, bound swatches, eyedropper; inline or popover.",
        "/colorpicker.props.json",
        List.of(
            event("onChange",
                "Fires when the user picks a colour. Payload: { value, hex, rgb:{r,g,b}, hsl:{h,s,l}, alpha }. `value` is the canonical string in the configured format; persist it and rebind value.color if you want it to survive a reload.",
                "/colorpicker.onchange.event.json")));
}
