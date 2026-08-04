package com.mustrysolutions.perspective.components.common.comp;

import static com.mustrysolutions.perspective.components.common.MustryPerspectiveComponentsModule.descriptor;
import static com.mustrysolutions.perspective.components.common.MustryPerspectiveComponentsModule.event;

import java.util.List;

import com.inductiveautomation.perspective.common.api.ComponentDescriptor;

/**
 * Describes the Branching Diagram component: a left-to-right decision-tree /
 * flow-path renderer migrated from the ignition-mustry-ui module (see
 * docs/branching-component-migration-plan.md). Display-only and controlled:
 * data.nodes is a flat node array laid out by a pure BFS algorithm; clicking
 * a node fires onNodeClick and writes state.selectedNode.
 *
 * <p>The {@link #COMPONENT_ID} here MUST exactly match the {@code COMPONENT_TYPE}
 * declared in the matching TypeScript component (web/typescript/components/branching).
 */
public class BranchingDiagram {

    /** Unique component id — must match the front-end ComponentMeta.getComponentType(). */
    public static final String COMPONENT_ID = "mustrysolutions.perspective.display.branching";

    /** The descriptor registered with Perspective's component registries (see {@link Components#ALL}). */
    public static final ComponentDescriptor DESCRIPTOR = descriptor(
        COMPONENT_ID, "Branching Diagram", "branchingDiagram",
        "A left-to-right decision-tree / flow-path diagram from a flat node array: BFS layout with category rows, always-forward arrows, SVG connectors, icons and hover info cards. Click a node to select it (two-way) and fire onNodeClick.",
        "/branching.props.json",
        List.of(
            event("onNodeClick",
                "Fires when a node is clicked. Payload: { id, name, category }. The same click writes state.selectedNode.",
                "/branching.onnodeclick.event.json")));
}
