// Category legend (bottom footer). Click an item to show/hide that category's events.
import * as React from 'react';
import { IconRenderer } from '@inductiveautomation/perspective-client';
import { Category } from './calendarTypes';

interface LegendProps {
    categories: Category[];
    hiddenCats: Set<string>;
    onToggle: (id: string) => void;
}

export function Legend({ categories, hiddenCats, onToggle }: LegendProps): React.ReactElement | null {
    if (!categories || categories.length === 0) {
        return null;
    }
    return (
        <div className="cal-legend" role="group" aria-label="Categories">
            {categories.map((c) => {
                const hidden = hiddenCats.has(c.id);
                return (
                    <button
                        type="button"
                        key={c.id}
                        className={`cal-legend-item${hidden ? ' is-hidden' : ''}`}
                        onClick={() => onToggle(c.id)}
                        aria-pressed={!hidden}
                        title={hidden ? `Show ${c.label}` : `Hide ${c.label}`}
                    >
                        {c.icon
                            ? <span className="cal-ev-icon cal-legend-icon"><IconRenderer path={c.icon} color={c.color} /></span>
                            : <span className="cal-legend-dot" style={{ background: c.color }} />}
                        <span className="cal-legend-label">{c.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
