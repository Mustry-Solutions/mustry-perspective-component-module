package com.mustrysolutions.perspective.components.gateway;

import static com.mustrysolutions.perspective.components.common.MustrySolutionsPerspectiveComponentsModule.URL_ALIAS;

import java.util.Optional;

import com.inductiveautomation.ignition.common.licensing.LicenseState;
import com.inductiveautomation.ignition.common.util.LoggerEx;
import com.inductiveautomation.ignition.gateway.model.AbstractGatewayModuleHook;
import com.inductiveautomation.ignition.gateway.model.GatewayContext;
import com.inductiveautomation.perspective.common.api.ComponentRegistry;
import com.inductiveautomation.perspective.gateway.api.PerspectiveContext;

import com.mustrysolutions.perspective.components.common.comp.Calendar;
import com.mustrysolutions.perspective.components.common.comp.DataGrid;
import com.mustrysolutions.perspective.components.common.comp.DateTimeRangePicker;
import com.mustrysolutions.perspective.components.common.comp.ResourceTimeline;

/**
 * Gateway-scope hook. Registers this module's Perspective components with the
 * gateway's component registry and serves their front-end resources.
 */
public class MustrySolutionsPerspectiveComponentsGatewayHook extends AbstractGatewayModuleHook {

    private static final LoggerEx log = LoggerEx.newBuilder().build(
        "MustrySolutions.PerspectiveComponents.GatewayHook");

    private GatewayContext gatewayContext;
    private PerspectiveContext perspectiveContext;
    private ComponentRegistry componentRegistry;

    @Override
    public void setup(GatewayContext context) {
        this.gatewayContext = context;
    }

    @Override
    public void startup(LicenseState activationState) {
        this.perspectiveContext = PerspectiveContext.get(this.gatewayContext);
        this.componentRegistry = this.perspectiveContext.getComponentRegistry();

        if (this.componentRegistry != null) {
            log.info("Registering Mustry Solutions Perspective components.");
            this.componentRegistry.registerComponent(DateTimeRangePicker.DESCRIPTOR);
            this.componentRegistry.registerComponent(Calendar.DESCRIPTOR);
            this.componentRegistry.registerComponent(DataGrid.DESCRIPTOR);
            this.componentRegistry.registerComponent(ResourceTimeline.DESCRIPTOR);
        } else {
            log.error("Perspective component registry not found; components not registered.");
        }
    }

    @Override
    public void shutdown() {
        if (this.componentRegistry != null) {
            this.componentRegistry.removeComponent(DateTimeRangePicker.COMPONENT_ID);
            this.componentRegistry.removeComponent(Calendar.COMPONENT_ID);
            this.componentRegistry.removeComponent(DataGrid.COMPONENT_ID);
            this.componentRegistry.removeComponent(ResourceTimeline.COMPONENT_ID);
        }
    }

    /** Serve the bundled web resources found in the module's "mounted" resource folder. */
    @Override
    public Optional<String> getMountedResourceFolder() {
        return Optional.of("mounted");
    }

    /** Mount those resources at /res/{URL_ALIAS}/ rather than under the module id. */
    @Override
    public Optional<String> getMountPathAlias() {
        return Optional.of(URL_ALIAS);
    }

    @Override
    public boolean isFreeModule() {
        return true;
    }
}
