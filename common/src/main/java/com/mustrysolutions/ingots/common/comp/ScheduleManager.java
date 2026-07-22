package com.mustrysolutions.ingots.common.comp;

import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.descriptor;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Schedule Manager component: a runtime UI over the gateway's
 * user schedules (Vision's Schedule Management, which Perspective lacks).
 * Controlled: data.schedules is a flat mirror of the BasicScheduleModel beans
 * (bound via system.user.getSchedules()); the component renders and selects.
 * This milestone is read-only — editing events (onScheduleSave etc.) arrive
 * with M1, see docs/admin-components-plan.md. First of the admin family.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/schedule).
 */
public class ScheduleManager {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.ingots.admin.schedulemanager";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Schedule Manager", "scheduleManager",
        "Master-detail view of the gateway's user schedules: schedule list with active-now dots and a week grid of painted availability. Bind data.schedules from system.user.getSchedules(); selection is two-way. Read-only this milestone.",
        "/schedulemanager.props.json",
        List.of());
}
