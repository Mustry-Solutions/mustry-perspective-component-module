// The category legend under the grid. Clicking an item toggles that category's
// visibility (two-way via state.hiddenCategories — the write stays in the class).
import * as React from 'react';
import { IconRenderer } from '@inductiveautomation/perspective-client';
import { categoryColor } from '../../shared/eventStyle';
import { Category } from '../../shared/types';

interface TimelineLegendProps {
    categories: Category[];
    hiddenCategories: string[];
    onToggle: (id: string) => void;
}

export function TimelineLegend(p: TimelineLegendProps): React.ReactElement | null {
    if (!(p.categories || []).length) {
        return null;
    }
    return (
        <div className="mustry-tml-legend">
            {p.categories.map((c) => (
                <button
                    type="button" key={c.id}
                    className={`mustry-tml-legend-item${(p.hiddenCategories || []).indexOf(c.id) >= 0 ? ' mustry-tml-legend-item--off' : ''}`}
                    onClick={() => p.onToggle(c.id)}
                >
                    {c.icon
                        ? <span className="mustry-tml-legend-icon"><IconRenderer path={c.icon} color={c.color} /></span>
                        : <span className="mustry-tml-legend-dot" style={{ background: categoryColor(p.categories, c.id) }} />}
                    {c.label}
                </button>
            ))}
        </div>
    );
}
