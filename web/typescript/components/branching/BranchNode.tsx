import * as React from 'react';
import { IconRenderer } from '@inductiveautomation/perspective-client';
import { BranchNode as BranchNodeData } from './branchingLogic';

interface BranchNodeProps {
    node: BranchNodeData;
    /** Pixel position of the node centre's grid anchor. */
    x: number;
    y: number;
    size: number;
    borderWidth: number;
    /** Horizontal room for the name label (one column minus breathing space). */
    textSpace: number;
    selected: boolean;
    onClick: (id: number) => void;
}

/**
 * One node: icon disc + name + (optional) hover info card. Ported from
 * mustry-ui's NodeComponent with namespaced classes, theme-var colours and
 * a plain-text info card (markdown parity is a later decision — the React 18
 * react-markdown@9 the original used cannot run on React 16).
 */
export function BranchNode(props: BranchNodeProps): JSX.Element {
    const { node, size, borderWidth } = props;
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
            <div className="mustry-branch-node-body">
                <div
                    className="mustry-branch-disc"
                    style={{
                        borderColor: node.color || undefined,
                        borderWidth,
                        background: node.fill ? (node.color || undefined) : undefined,
                        width: size,
                        height: size
                    }}
                >
                    {node.icon && (
                        <IconRenderer
                            path={node.icon.path}
                            color={node.icon.color || undefined}
                            size={Math.max(8, size - borderWidth * 2 - 6)}
                        />
                    )}
                </div>
                <p className="mustry-branch-name" style={{ width: props.textSpace }}>{node.name}</p>
            </div>
            {node.tooltip !== '' && (
                <div className="mustry-branch-card" style={node.tooltipStyle}>
                    {node.tooltip}
                </div>
            )}
        </div>
    );
}
