package com.mustrysolutions.perspective.components.gateway;

import java.lang.reflect.Field;
import java.util.LinkedHashSet;
import java.util.Set;

import com.inductiveautomation.ignition.common.util.LoggerEx;
import com.inductiveautomation.perspective.common.api.BrowserResource;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;
import com.inductiveautomation.perspective.common.api.ComponentRegistry;

/**
 * Makes browser resources load on every Perspective page.
 *
 * <p>Perspective only sends a page the resources of the components it shows, and
 * the SDK has no page-wide resource hook. Every page shows at least one of
 * Perspective's own components (a view's root container), so adding the
 * resources to those descriptors loads them everywhere. The descriptor keeps
 * its set in a private field, hence the reflection; a failure is logged and
 * leaves the components untouched, so the module still starts.
 */
final class GlobalBrowserResources {

    /** Module id of the components that carry the resources. */
    static final String PERSPECTIVE_MODULE_ID = "com.inductiveautomation.perspective";

    private static final LoggerEx log = LoggerEx.newBuilder().build(
        "MustrySolutions.PerspectiveComponents.GlobalBrowserResources");

    private GlobalBrowserResources() {}

    /** Add the resources to every Perspective component. Returns how many descriptors changed. */
    static int add(ComponentRegistry registry, Set<BrowserResource> resources) {
        return update(registry, resources, true);
    }

    /** Undo {@link #add}. Returns how many descriptors changed. */
    static int remove(ComponentRegistry registry, Set<BrowserResource> resources) {
        return update(registry, resources, false);
    }

    private static int update(ComponentRegistry registry, Set<BrowserResource> resources, boolean add) {
        Field field;
        try {
            field = ComponentDescriptorImpl.class.getDeclaredField("browserResources");
            field.setAccessible(true);
        } catch (ReflectiveOperationException | RuntimeException e) {
            log.error("Cannot reach component browser resources; toasts will not load on pages.", e);
            return 0;
        }

        int changed = 0;
        for (ComponentDescriptor descriptor : registry.get().values()) {
            if (!(descriptor instanceof ComponentDescriptorImpl)
                    || !PERSPECTIVE_MODULE_ID.equals(descriptor.moduleId())) {
                continue;
            }
            Set<BrowserResource> current = descriptor.browserResources();
            Set<BrowserResource> next = new LinkedHashSet<>(current == null ? Set.of() : current);
            boolean modified = add ? next.addAll(resources) : next.removeAll(resources);
            if (!modified) {
                continue;
            }
            try {
                field.set(descriptor, next);
                changed++;
            } catch (IllegalAccessException | RuntimeException e) {
                log.warnf("Could not update browser resources of %s: %s", descriptor.id(), e.getMessage());
            }
        }
        return changed;
    }
}
