package com.mustrysolutions.perspective.components.common.comp;

import static com.mustrysolutions.perspective.components.common.MustryPerspectiveComponentsModule.descriptor;
import static com.mustrysolutions.perspective.components.common.MustryPerspectiveComponentsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Roster Manager component: a runtime UI over the gateway's
 * alarm-notification rosters (Vision's Roster Management, which Perspective
 * lacks). Controlled: data.rosters + a data.availableUsers directory are
 * bound (system.roster.getRosters() / system.user.getUsers()); the ordered
 * user list — the escalation sequence — is edited by drag-to-reorder and a
 * typeahead picker, and Save fires onRosterSave with the full desired order
 * (the system.roster API is append-only, so the author's script reconciles
 * with removeUsers + addUsers). Second of the admin family, see
 * docs/admin-components-plan.md.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/roster).
 */
public class RosterManager {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.perspective.admin.rostermanager";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Roster Manager", "rosterManager",
        "Master-detail view of the gateway's alarm rosters: the ordered escalation list with drag-to-reorder, a typeahead user picker, and no-contact-info warnings. Bind data.rosters from system.roster.getRosters(); persist onRosterSave with removeUsers + addUsers.",
        "/rostermanager.props.json",
        List.of(
            event("onRosterSave",
                "Fires when the user saves a dirty draft. Payload: { name, users, isNew } where `users` is the FULL desired ordered list. Reconcile via system.roster (removeUsers then addUsers) and refresh data.rosters.",
                "/rostermanager.onsave.event.json"),
            event("onRosterDelete",
                "Fires when the user confirms the two-step Delete. Payload: { name }. Persist with system.roster.deleteRoster and refresh data.rosters.",
                "/rostermanager.ondelete.event.json")));
}
