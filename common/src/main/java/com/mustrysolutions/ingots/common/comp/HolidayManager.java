package com.mustrysolutions.ingots.common.comp;

import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.descriptor;
import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Holiday Manager component: a runtime UI over the gateway's
 * holiday list — the missing quarter of the schedule story (schedules can
 * "observe holidays", but nothing in the runtime showed or edited which
 * dates those are). Controlled: data.holidays is the flat HolidayModel
 * mirror (bound via system.user.getHolidays()); edits stay draft-only until
 * Save fires onHolidaySave — the author's script persists via
 * system.user.addHoliday/editHoliday/removeHoliday. Fourth of the admin
 * family, see docs/admin-components-plan.md.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/holiday).
 */
public class HolidayManager {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.ingots.admin.holidaymanager";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Holiday Manager", "holidayManager",
        "Master-detail view of the gateway's holidays (name, date, repeat-annually), sorted by next occurrence. Pairs with schedules that observe holidays. Bind data.holidays from system.user.getHolidays(); persist onHolidaySave with addHoliday/editHoliday.",
        "/holidaymanager.props.json",
        List.of(
            event("onHolidaySave",
                "Fires when the user saves a dirty draft. Payload: { holiday, isNew, oldName? } — `holiday` is the flat HolidayModel mirror {name, date: 'YYYY-MM-DD', repeatAnnually}. Persist via system.user.addHoliday / editHoliday and refresh data.holidays.",
                "/holidaymanager.onsave.event.json"),
            event("onHolidayDelete",
                "Fires when the user confirms the two-step Delete. Payload: { name }. Persist with system.user.removeHoliday and refresh data.holidays.",
                "/holidaymanager.ondelete.event.json")));
}
