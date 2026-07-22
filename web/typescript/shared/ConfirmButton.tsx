import * as React from 'react';

interface ConfirmButtonProps {
    /** Resting label (e.g. "Delete" or "✕"). */
    label: string;
    /** Armed label (e.g. "Confirm delete?"). */
    confirmLabel: string;
    confirming: boolean;
    className: string;
    confirmingClassName: string;
    title?: string;
    ariaLabel?: string;
    onClick: () => void;
}

/**
 * A two-step button whose WIDTH never changes when it arms: both labels are
 * always rendered stacked, the inactive one invisible, so the button sizes to
 * the wider of the two and the swap can't reflow its neighbours. Used by the
 * admin family's delete affordances.
 */
export function ConfirmButton(p: ConfirmButtonProps): JSX.Element {
    return (
        <button
            type="button"
            className={p.className + (p.confirming ? ` ${p.confirmingClassName}` : '')}
            title={p.title}
            aria-label={p.ariaLabel ?? (p.confirming ? p.confirmLabel : p.title)}
            onClick={p.onClick}
        >
            <span className="mustry-confirm-stack">
                <span className={p.confirming ? 'mustry-confirm-ghost' : undefined} aria-hidden={p.confirming}>
                    {p.label}
                </span>
                <span className={p.confirming ? undefined : 'mustry-confirm-ghost'} aria-hidden={!p.confirming}>
                    {p.confirmLabel}
                </span>
            </span>
        </button>
    );
}
