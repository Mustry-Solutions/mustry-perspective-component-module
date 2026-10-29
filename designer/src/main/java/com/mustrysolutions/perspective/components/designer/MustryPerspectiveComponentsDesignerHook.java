package com.mustrysolutions.perspective.components.designer;

import com.inductiveautomation.ignition.common.licensing.LicenseState;
import com.inductiveautomation.ignition.common.util.LoggerEx;
import com.inductiveautomation.ignition.designer.model.AbstractDesignerModuleHook;
import com.inductiveautomation.ignition.designer.model.DesignerContext;
import com.inductiveautomation.perspective.designer.DesignerComponentRegistry;
import com.inductiveautomation.perspective.designer.api.PerspectiveDesignerInterface;

import com.mustrysolutions.perspective.components.common.comp.Components;

/**
 * Designer-scope hook. Registers this module's components so they appear in the
 * Perspective component palette while designing.
 */
public class MustryPerspectiveComponentsDesignerHook extends AbstractDesignerModuleHook {

    private static final LoggerEx log = LoggerEx.newBuilder().build(
        "MustrySolutions.PerspectiveComponents.DesignerHook");

    private DesignerComponentRegistry registry;

    @Override
    public void startup(DesignerContext context, LicenseState activationState) throws Exception {
        // get() is a plain module lookup: null when Perspective's designer hook isn't loaded.
        PerspectiveDesignerInterface pdi = PerspectiveDesignerInterface.get(context);
        this.registry = pdi != null ? pdi.getDesignerComponentRegistry() : null;

        if (this.registry != null) {
            log.info("Registering Mustry Perspective Components components in the Designer.");
            Components.ALL.forEach(this.registry::registerComponent);
        } else {
            log.error("Perspective designer component registry not found; components not registered.");
        }
    }

    @Override
    public void shutdown() {
        if (this.registry != null) {
            Components.ALL.forEach(d -> this.registry.removeComponent(d.id()));
        }
    }
}
