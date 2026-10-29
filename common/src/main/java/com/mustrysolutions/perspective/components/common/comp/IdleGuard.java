package com.mustrysolutions.perspective.components.common.comp;

import static com.mustrysolutions.perspective.components.common.MustryPerspectiveComponentsModule.descriptor;
import static com.mustrysolutions.perspective.components.common.MustryPerspectiveComponentsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Idle Guard: a screensaver for Perspective pages. One per page
 * (put it in a shared dock); it watches pointer, touch, key and wheel input in
 * the browser and, after a timeout, covers the page with an idle mode. Any
 * input wakes it, and so does an alarm at or above the wake priority. An active
 * Critical alarm is never covered. Its gateway half is
 * {@code gateway.guard.GuardModelDelegate}, fed by the shared AlarmFeed.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in web/typescript/components/guard/IdleGuard.tsx.
 */
public class IdleGuard {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.perspective.screensaver.idleguard";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Idle Guard", "IdleGuard",
        "Screensaver for Perspective. After config.timeoutSec without input the page shows an idle mode (clock by default); any touch, key or mouse movement wakes it, and so does an alarm. Put one in a shared dock.",
        "/idleguard.props.json",
        List.of(
            event("onIdle",
                "Fires when the page goes idle. Payload: { mode, idleSince }; mode is what is shown (after the night window, shuffle and reduced motion).",
                "/idleguard.onidle.event.json"),
            event("onWake",
                "Fires when the page wakes. Payload: { cause, idleForMs } where cause is 'input', 'alarm', 'feed-stale' or 'disabled'.",
                "/idleguard.onwake.event.json")));
}
