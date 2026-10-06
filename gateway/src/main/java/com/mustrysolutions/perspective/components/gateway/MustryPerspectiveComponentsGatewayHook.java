package com.mustrysolutions.perspective.components.gateway;

import static com.mustrysolutions.perspective.components.common.MustryPerspectiveComponentsModule.TOAST_RESOURCES;
import static com.mustrysolutions.perspective.components.common.MustryPerspectiveComponentsModule.URL_ALIAS;

import java.util.Optional;

import com.inductiveautomation.ignition.common.BundleUtil;
import com.inductiveautomation.ignition.common.licensing.LicenseState;
import com.inductiveautomation.ignition.common.script.ScriptManager;
import com.inductiveautomation.ignition.common.script.hints.PropertiesFileDocProvider;
import com.inductiveautomation.ignition.common.util.LoggerEx;
import com.inductiveautomation.ignition.gateway.model.AbstractGatewayModuleHook;
import com.inductiveautomation.ignition.gateway.model.GatewayContext;
import com.inductiveautomation.perspective.common.api.ComponentRegistry;
import com.inductiveautomation.perspective.gateway.api.PerspectiveContext;

import com.mustrysolutions.perspective.components.common.comp.Components;

/**
 * Gateway-scope hook. Registers this module's Perspective components with the
 * gateway's component registry and serves their front-end resources. Also
 * provides system.mustry.toast() and loads its toast bundle on every page.
 */
public class MustryPerspectiveComponentsGatewayHook extends AbstractGatewayModuleHook {

    private static final LoggerEx log = LoggerEx.newBuilder().build(
        "MustrySolutions.PerspectiveComponents.GatewayHook");

    private GatewayContext gatewayContext;
    private PerspectiveContext perspectiveContext;
    private ComponentRegistry componentRegistry;

    @Override
    public void setup(GatewayContext context) {
        this.gatewayContext = context;
        BundleUtil.get().addBundle("ToastFunctions", ToastFunctions.class, "ToastFunctions");
    }

    /** Adds system.mustry.toast() to gateway and Perspective session scripts. */
    @Override
    public void initializeScriptManager(ScriptManager manager) {
        manager.addScriptModule("system.mustry",
            new ToastFunctions(() -> PerspectiveContext.get(this.gatewayContext)),
            new PropertiesFileDocProvider());
    }

    @Override
    public void startup(LicenseState activationState) {
        this.perspectiveContext = PerspectiveContext.get(this.gatewayContext);
        this.componentRegistry = this.perspectiveContext.getComponentRegistry();

        if (this.componentRegistry != null) {
            log.info("Registering Mustry Perspective Components components.");
            Components.ALL.forEach(this.componentRegistry::registerComponent);
            int updated = GlobalBrowserResources.add(this.componentRegistry, TOAST_RESOURCES);
            log.infof("Toast bundle added to %d Perspective components.", updated);
        } else {
            log.error("Perspective component registry not found; components not registered.");
        }
    }

    @Override
    public void shutdown() {
        if (this.componentRegistry != null) {
            GlobalBrowserResources.remove(this.componentRegistry, TOAST_RESOURCES);
            Components.ALL.forEach(d -> this.componentRegistry.removeComponent(d.id()));
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

    /**
     * Allow the module on Ignition Maker Edition. A Maker Edition gateway only loads
     * modules whose gateway hook returns true here (the SDK default is false), and
     * refuses the rest at startup with "Not eligible for use with Ignition Maker Edition".
     */
    @Override
    public boolean isMakerEditionCompatible() {
        return true;
    }
}
