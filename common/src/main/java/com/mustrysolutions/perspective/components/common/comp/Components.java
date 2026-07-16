package com.mustrysolutions.perspective.components.common.comp;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * The single source of truth for the component set: BOTH hooks (gateway and
 * designer) iterate this list to register and remove components, so the two
 * scopes can never drift. Adding a component means adding its descriptor here
 * — plus its web-side registration in web/typescript/index.ts, which webpack
 * requires to be a static import and therefore cannot be driven from Java.
 */
public final class Components {

    private Components() {
    }

    /** Every component this module ships, in palette order. */
    public static final List<ComponentDescriptor> ALL = List.of(
        DateTimeRangePicker.DESCRIPTOR,
        Calendar.DESCRIPTOR,
        DataGrid.DESCRIPTOR,
        PanZoomView.DESCRIPTOR,
        ResourceTimeline.DESCRIPTOR);
}
