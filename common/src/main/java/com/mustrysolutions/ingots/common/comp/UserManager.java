package com.mustrysolutions.ingots.common.comp;

import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.descriptor;
import static com.mustrysolutions.ingots.common.MustrySolutionsIngotsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the User Manager component: a runtime UI over a gateway user
 * source (Vision's User Management, which Perspective lacks). Controlled:
 * data.users is the flat PyUser mirror (bound via system.user.getUsers())
 * plus role/schedule directories; edits stay draft-only until Save fires
 * onUserSave — the author's script persists via system.user.addUser /
 * editUser. Passwords are opt-in (config.allowPasswordChange) and travel
 * ONLY in the event payload, never through props or output. AD/LDAP-backed
 * sources are read-only: set config.editable false to degrade to a
 * directory viewer. Third of the admin family, see
 * docs/admin-components-plan.md.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/users).
 */
public class UserManager {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.ingots.admin.usermanager";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "User Manager", "userManager",
        "Master-detail view of a gateway user source: filterable user list, editable names/roles/schedule/contact info, opt-in password staging. Bind data.users from system.user.getUsers(); persist onUserSave with addUser/editUser.",
        "/usermanager.props.json",
        List.of(
            event("onUserSave",
                "Fires when the user saves a dirty draft. Payload: { user, isNew, password? } — `user` is the full flat mirror; `password` is present ONLY when config.allowPasswordChange is on and one was staged. Persist via system.user.addUser/editUser and refresh data.users.",
                "/usermanager.onsave.event.json"),
            event("onUserDelete",
                "Fires when the user confirms the two-step Delete. Payload: { username }. Persist with system.user.removeUser and refresh data.users.",
                "/usermanager.ondelete.event.json")));
}
