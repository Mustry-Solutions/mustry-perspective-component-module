package com.mustrysolutions.perspective.components.common;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.util.List;
import java.util.Set;

import javax.swing.ImageIcon;

import com.inductiveautomation.ignition.common.jsonschema.JsonSchema;
import com.inductiveautomation.perspective.common.api.BrowserResource;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;
import com.inductiveautomation.perspective.common.api.ComponentEventDescriptor;

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

    /** Parse a JSON schema bundled in the common resources (props or event payloads). */
    public static JsonSchema schema(String resourcePath) {
        return JsonSchema.parse(
            MustrySolutionsPerspectiveComponentsModule.class.getResourceAsStream(resourcePath));
    }

    /** A component event whose payload schema lives in the common resources. */
    public static ComponentEventDescriptor event(String name, String description, String schemaResource) {
        return new ComponentEventDescriptor(name, description, schema(schemaResource));
    }

    /**
     * The one place a component descriptor is assembled. Every component gets the
     * same category, module id, browser resources, drawn icon and palette-entry
     * shape — per-component code supplies only what actually differs. Keeps the
     * five descriptors structurally identical by construction.
     */
    public static ComponentDescriptor descriptor(String id, String name, String metaName,
            String paletteDescription, String schemaResource, List<ComponentEventDescriptor> events) {
        BufferedImage icon = paletteIcon(id);
        ComponentDescriptorImpl.ComponentBuilder builder = ComponentDescriptorImpl.ComponentBuilder.newBuilder()
            .setPaletteCategory(COMPONENT_CATEGORY)
            .setId(id)
            .setModuleId(MODULE_ID)
            .setSchema(schema(schemaResource))
            .setName(name)
            .setIcon(new ImageIcon(icon))
            .addPaletteEntry("", name, paletteDescription, icon, null)
            .setDefaultMetaName(metaName)
            .setResources(BROWSER_RESOURCES);
        if (events != null && !events.isEmpty()) {
            builder.setEvents(events);
        }
        return builder.build();
    }

    /**
     * Builds a small (16x16) palette icon for a component by drawing a simple glyph
     * with Java2D (offscreen, headless-safe — no binary assets to bundle). Same
     * approach as mustry-openbridge: pass the result to both
     * {@code ComponentBuilder.setIcon(new ImageIcon(img))} (the icon next to the
     * palette entry / in the project browser) and {@code addPaletteEntry}'s
     * BufferedImage parameter (the drag thumbnail).
     */
    public static BufferedImage paletteIcon(String id) {
        int s = 16;
        BufferedImage img = new BufferedImage(s, s, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(new Color(0x53, 0x53, 0x53));
        g.setStroke(new BasicStroke(1.4f));
        String k = id.toLowerCase();
        if (k.contains("richtexteditor")) {
            // Text lines with a bold lead line (a styled document).
            g.drawRoundRect(2, 2, 12, 12, 2, 2);
            g.setStroke(new BasicStroke(2.2f));
            g.drawLine(5, 6, 11, 6);                              // bold heading line
            g.setStroke(new BasicStroke(1.2f));
            g.drawLine(5, 9, 12, 9);                              // body lines
            g.drawLine(5, 11, 10, 11);
        } else if (k.contains("panzoomview")) {
            // Magnifier over a sheet corner (pan/zoom hint).
            g.drawRoundRect(2, 2, 9, 9, 2, 2);                    // content sheet
            g.drawOval(6, 6, 7, 7);                               // lens
            g.drawLine(12, 12, 15, 15);                           // handle
        } else         if (k.contains("datagrid")) {
            // Table sheet: header band + column/row rules.
            g.drawRoundRect(2, 3, 12, 11, 2, 2);
            g.fillRect(2, 3, 12, 3);                              // header band
            g.drawLine(7, 6, 7, 14);                              // column rules
            g.drawLine(11, 6, 11, 14);
            g.drawLine(2, 10, 14, 10);                            // row rule
        } else if (k.contains("resourcetimeline")) {
            // Rows of staggered bars (a scheduling board / Gantt hint).
            g.drawLine(2, 3, 2, 13);                              // resource column edge
            g.fillRect(4, 3, 7, 3);
            g.fillRect(7, 8, 7, 3);
            g.fillRect(5, 12, 5, 2);
        } else if (k.contains("datetimerangepicker")) {
            // Calendar sheet with a selected range band.
            g.drawRoundRect(2, 3, 12, 11, 2, 2);
            g.drawLine(2, 6, 14, 6);                              // header rule
            g.drawLine(5, 1, 5, 4); g.drawLine(11, 1, 11, 4);     // binder rings
            g.fillRect(4, 9, 8, 3);                               // the range
        } else if (k.contains("calendar")) {
            // Month sheet with day dots.
            g.drawRoundRect(2, 3, 12, 11, 2, 2);
            g.drawLine(2, 6, 14, 6);                              // header rule
            g.drawLine(5, 1, 5, 4); g.drawLine(11, 1, 11, 4);     // binder rings
            g.fillRect(4, 8, 2, 2); g.fillRect(8, 8, 2, 2); g.fillRect(11, 8, 2, 2);
            g.fillRect(4, 11, 2, 2); g.fillRect(8, 11, 2, 2);
        } else {
            g.drawOval(3, 3, 10, 10);
        }
        g.dispose();
        return img;
    }
}
