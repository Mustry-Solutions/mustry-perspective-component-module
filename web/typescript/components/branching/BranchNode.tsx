import * as React from 'react';
import { IconRenderer } from '@inductiveautomation/perspective-client';
import ReactMarkdown from 'react-markdown';
import { BranchNode as BranchNodeData } from './branchingLogic';

interface BranchNodeProps {
    node: BranchNodeData;
    /** Pixel position of the node's grid anchor (the wrapper CENTERS on it —
     *  connector lines pass through the disc centre, as in the original). */
    x: number;
    y: number;
    size: number;
    borderWidth: number;
    /** Inline width for the name label (one column minus breathing space);
     *  the stylesheet additionally caps it at 200px like the original. */
    textSpace: number;
    /** config.backgroundColor ('' = the --brn-node-bg theme var). */
    backgroundColor: string;
    selected: boolean;
    onClick: (id: number) => void;
}

/**
 * One node, mirroring ignition-mustry-ui's NodeComponent structure 1:1 so
 * the rendered look matches: an absolutely-positioned wrapper centred on the
 * grid point, a pill (padding + radius + background halo where labels cross
 * connectors) holding the icon disc, the name absolutely centred beneath,
 * and a markdown info card that opens on hover and stays while hovered.
 * Extensions over the original: click-to-select highlight + onNodeClick.
 */
export function BranchNode(props: BranchNodeProps): JSX.Element {
    const { node, size, borderWidth } = props;
    const background = props.backgroundColor || 'var(--brn-node-bg)';
    return (
        <div
            className={'mustry-branch-node' + (props.selected ? ' mustry-branch-node--selected' : '')}
            style={{ left: props.x - borderWidth, top: props.y - borderWidth, ...node.style }}
            role="button"
            tabIndex={0}
            aria-label={node.name || String(node.id)}
            onClick={() => props.onClick(node.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onClick(node.id); } }}
        >
            <div className="mustry-branch-body">
                <div className="mustry-branch-pill" style={{ backgroundColor: background }}>
                    <div
                        className="mustry-branch-disc"
                        style={{
                            borderColor: node.color || undefined,
                            borderWidth,
                            backgroundColor: node.fill ? (node.color || undefined) : background,
                            width: size,
                            height: size
                        }}
                    >
                        {node.icon && (
                            <div className="mustry-branch-icon">
                                <IconRenderer path={node.icon.path} color={node.icon.color || undefined} />
                            </div>
                        )}
                    </div>
                    <p className="mustry-branch-name" style={{ width: props.textSpace }}>{node.name}</p>
                </div>
            </div>
            {node.tooltip !== '' && (
                <div
                    className="mustry-branch-card"
                    style={{ backgroundColor: background, ...node.tooltipStyle }}
                >
                    <ReactMarkdown source={node.tooltip} />
                </div>
            )}
        </div>
    );
}
