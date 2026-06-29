// Pure event-styling helpers (colour, icon, status) shared by every view. They take
// the category list explicitly so they have no component-state dependency.
import * as React from 'react';
import { IconRenderer } from '@inductiveautomation/perspective-client';
import { CalEvent } from '../calendarLogic';
import { Category } from './types';

/** Colour for uncategorised events when categories are in use — a neutral grey so
 *  "None" events are clearly distinct from any defined category. */
export const UNCATEGORIZED_COLOR = '#6b7280';

/** A category's colour by id (undefined if none / unknown). */
export function categoryColor(categories: Category[], id?: string): string | undefined {
    const cat = (categories || []).find((c) => c.id === id);
    return cat ? cat.color : undefined;
}

/** Effective colour: explicit `color` > category colour > neutral grey (if categories
 *  are in use) > undefined (no categories at all → CSS falls back to the theme accent). */
export function resolveColor(categories: Category[], ev: CalEvent): string | undefined {
    if (ev.color) {
        return ev.color;
    }
    const c = categoryColor(categories, ev.category);
    if (c) {
        return c;
    }
    return (categories || []).length ? UNCATEGORIZED_COLOR : undefined;
}

/** The icon path for an event, taken from its category (undefined = no icon). */
export function eventIcon(categories: Category[], ev: CalEvent): string | undefined {
    const cat = (categories || []).find((c) => c.id === ev.category);
    return cat ? cat.icon : undefined;
}

/** Status modifier class for an event chip ('' for normal/unset). */
export function statusClass(ev: CalEvent): string {
    switch (ev.status) {
        case 'tentative': return ' cal-ev--tentative';
        case 'cancelled': return ' cal-ev--cancelled';
        case 'done': return ' cal-ev--done';
        default: return '';
    }
}

/** Inline `--ev` custom-property style for an event chip (undefined → CSS falls back to the accent). */
export function evVar(categories: Category[], ev: CalEvent): React.CSSProperties | undefined {
    const c = resolveColor(categories, ev);
    return c ? ({ ['--ev' as string]: c } as React.CSSProperties) : undefined;
}

/** An event's category icon as a small inline element (renders nothing if there's no icon). */
export function EventIcon({ ev, categories }: { ev: CalEvent; categories: Category[] }): React.ReactElement | null {
    const icon = eventIcon(categories, ev);
    if (!icon) {
        return null;
    }
    return (
        <span className="cal-ev-icon">
            <IconRenderer path={icon} color={resolveColor(categories, ev) || 'currentColor'} />
        </span>
    );
}
