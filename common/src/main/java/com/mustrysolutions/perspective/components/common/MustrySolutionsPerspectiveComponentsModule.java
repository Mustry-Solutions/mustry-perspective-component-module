package com.mustrysolutions.perspective.components.common;

import java.util.Set;

import com.inductiveautomation.perspective.common.api.BrowserResource;

/**
 * Central location for module- and component-wide constants shared across the
 * gateway, designer, and common scopes.
 */
public class MustrySolutionsPerspectiveComponentsModule {

    /** Module id — must match {@code id} in the root build.gradle.kts. */
    public static final String MODULE_ID =
        "com.mustrysolutions.perspective.components.MustrySolutionsPerspectiveComponents";

    /** Mount alias: the module's web resources are served at {@code /res/<URL_ALIAS>/}. */
    public static final String URL_ALIAS = "mustry-components";

    /** Palette category these components appear under in the Designer. */
    public static final String COMPONENT_CATEGORY = "Mustry Solutions";

    /**
     * The browser resources (JS/CSS bundle) Perspective loads for this module's
     * components. Produced by the web/ subproject's webpack build and mounted by
     * the gateway hook at {@code /res/<URL_ALIAS>/}.
     */
    public static final Set<BrowserResource> BROWSER_RESOURCES = Set.of(
        new BrowserResource(
            "mustry-components-js",
            String.format("/res/%s/MustryComponents.js", URL_ALIAS),
            BrowserResource.ResourceType.JS
        ),
        new BrowserResource(
            "mustry-components-css",
            String.format("/res/%s/MustryComponents.css", URL_ALIAS),
            BrowserResource.ResourceType.CSS
        )
    );
}
