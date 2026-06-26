package com.mustrysolutions.perspective.components.designer;

import com.inductiveautomation.ignition.common.licensing.LicenseState;
import com.inductiveautomation.ignition.common.util.LoggerEx;
import com.inductiveautomation.ignition.designer.model.AbstractDesignerModuleHook;
import com.inductiveautomation.ignition.designer.model.DesignerContext;
import com.inductiveautomation.perspective.designer.DesignerComponentRegistry;
import com.inductiveautomation.perspective.designer.api.PerspectiveDesignerInterface;

import com.mustrysolutions.perspective.components.common.comp.Calendar;
import com.mustrysolutions.perspective.components.common.comp.DateTimeRangePicker;

/**
 * Designer-scope hook. Registers this module's components so they appear in the
 * Perspective component palette while designing.
 */
public class MustrySolutionsPerspectiveComponentsDesignerHook extends AbstractDesignerModuleHook {

    private static final LoggerEx log = LoggerEx.newBuilder().build(
        "MustrySolutions.PerspectiveComponents.DesignerHook");

    private DesignerComponentRegistry registry;

    @Override
    public void startup(DesignerContext context, LicenseState activationState) throws Exception {
        PerspectiveDesignerInterface pdi = PerspectiveDesignerInterface.get(context);
        this.registry = pdi.getDesignerComponentRegistry();
        log.info("Registering Mustry Solutions Perspective components in the Designer.");
        this.registry.registerComponent(DateTimeRangePicker.DESCRIPTOR);
        this.registry.registerComponent(Calendar.DESCRIPTOR);
    }

    @Override
    public void shutdown() {
        if (this.registry != null) {
            this.registry.removeComponent(DateTimeRangePicker.COMPONENT_ID);
            this.registry.removeComponent(Calendar.COMPONENT_ID);
        }
    }
}
