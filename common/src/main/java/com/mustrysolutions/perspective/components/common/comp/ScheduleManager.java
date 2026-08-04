package com.mustrysolutions.perspective.components.common.comp;

import static com.mustrysolutions.perspective.components.common.MustryPerspectiveComponentsModule.descriptor;
import static com.mustrysolutions.perspective.components.common.MustryPerspectiveComponentsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Schedule Manager component: a runtime UI over the gateway's
 * user schedules (Vision's Schedule Management, which Perspective lacks).
 * Controlled: data.schedules is a flat mirror of the BasicScheduleModel beans
 * (bound via system.user.getSchedules()); the week grid is a paint surface
 * whose edits stay draft-only until Save fires onScheduleSave — the author's
 * script persists via system.user.editSchedule and refreshes the binding.
 * First of the admin family, see docs/admin-components-plan.md.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/schedule).
 */
public class ScheduleManager {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.perspective.admin.schedulemanager";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Schedule Manager", "scheduleManager",
        "Master-detail view of the gateway's user schedules: schedule list with active-now dots and a week grid where availability is painted by dragging. Draft edits + Save/Discard; persist onScheduleSave with system.user.editSchedule.",
        "/schedulemanager.props.json",
        List.of(
            event("onScheduleSave",
                "Fires when the user saves a dirty draft. Payload: { schedule, isNew } where `schedule` is the full flat BasicScheduleModel mirror. Persist it (system.user.editSchedule / addSchedule) and refresh data.schedules.",
                "/schedulemanager.onsave.event.json"),
            event("onScheduleDelete",
                "Fires when the user confirms the two-step Delete. Payload: { name }. Persist with system.user.removeSchedule and refresh data.schedules.",
                "/schedulemanager.ondelete.event.json")));
}
