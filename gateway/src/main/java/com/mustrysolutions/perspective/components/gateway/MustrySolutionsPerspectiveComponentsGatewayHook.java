package com.mustrysolutions.perspective.components.gateway;

import com.inductiveautomation.ignition.common.licensing.LicenseState;
import com.inductiveautomation.ignition.gateway.model.AbstractGatewayModuleHook;
import com.inductiveautomation.ignition.gateway.model.GatewayContext;

/**
 * Class which is instantiated by the Ignition platform when the module is loaded in the gateway scope.
 *
 * <p>This is where the module registers its server-side behavior. For a Perspective component module,
 * this is where you will register your component(s) with the Perspective module once you add that code.
 */
public class MustrySolutionsPerspectiveComponentsGatewayHook extends AbstractGatewayModuleHook {

    /**
     * Called before startup. The chance for the module to add extension points and update persistent
     * records and schemas. None of the managers will be started up at this point.
     */
    @Override
    public void setup(GatewayContext context) {

    }

    /**
     * Called to initialize the module. Will only be called once.
     */
    @Override
    public void startup(LicenseState activationState) {

    }

    /**
     * Called to shut down this module. A new instance will be created if a restart is desired.
     */
    @Override
    public void shutdown() {

    }
}
