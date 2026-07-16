// The popover mode's trigger button (calendar glyph + formatted range + caret).
// Pure presentation — panel state, positioning and portaling stay in the class.
import * as React from 'react';

interface PickerTriggerProps {
    open: boolean;
    enabled: boolean;
    text: string;
    isPlaceholder: boolean;
    setTriggerEl: (el: HTMLElement | null) => void;
    onToggle: () => void;
}

export function PickerTrigger(p: PickerTriggerProps): React.ReactElement {
    const triggerClasses = p.open ? 'mustry-dtrp-trigger mustry-dtrp-trigger--open' : 'mustry-dtrp-trigger';
    const textClasses = p.isPlaceholder
        ? 'mustry-dtrp-trigger-text mustry-dtrp-trigger-text--placeholder'
        : 'mustry-dtrp-trigger-text';
    return (
        <button
            type="button"
            className={triggerClasses}
            ref={p.setTriggerEl}
            disabled={!p.enabled}
            aria-haspopup="dialog"
            aria-expanded={p.open}
            onClick={p.onToggle}
        >
            <svg
                className="mustry-dtrp-trigger-icon"
                width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="16" y1="2" x2="16" y2="6" />
            </svg>
            <span className={textClasses}>{p.text}</span>
            <svg
                className="mustry-dtrp-trigger-caret"
                width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            >
                <polyline points="6 9 12 15 18 9" />
            </svg>
        </button>
    );
}
