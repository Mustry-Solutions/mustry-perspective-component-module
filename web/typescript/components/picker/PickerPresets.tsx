// The quick-range preset button row. Pure presentation — conflict checking,
// label resolution and application live in the DateTimeRangePicker class.
import * as React from 'react';
import { PresetDef } from './pickerLogic';

interface PickerPresetsProps {
    presets: PresetDef[];
    enabled: boolean;
    /** The armed rolling preset stays highlighted while its window ticks live. */
    isLive: (preset: PresetDef) => boolean;
    conflict: (preset: PresetDef) => string | null;
    label: (preset: PresetDef) => string;
    onApply: (preset: PresetDef) => void;
}

export function PickerPresets(p: PickerPresetsProps): React.ReactElement | null {
    const items = (p.presets || []).filter((it) => it && it.label);
    if (items.length === 0) {
        return null;
    }
    return (
        <div className="mustry-dtrp-presets">
            {items.map((it, i) => {
                const conflict = p.conflict(it);
                const live = p.isLive(it);
                return (
                    <button
                        key={`${it.label}-${i}`}
                        type="button"
                        className={live ? 'mustry-dtrp-preset mustry-dtrp-preset--live' : 'mustry-dtrp-preset'}
                        disabled={!p.enabled || !!conflict}
                        aria-disabled={!p.enabled || !!conflict}
                        title={conflict || undefined}
                        onClick={() => p.onApply(it)}
                    >
                        {live && <span className="mustry-dtrp-live-dot" aria-hidden="true" />}
                        {p.label(it)}
                    </button>
                );
            })}
        </div>
    );
}
