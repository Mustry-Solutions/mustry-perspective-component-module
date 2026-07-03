// Types shared by every component in the module (calendar, picker, timeline, …).

/** A category definition: supplies colour, icon and legend grouping for items
 *  that reference it by id. */
export interface Category {
    id: string;
    label: string;
    color: string;
    icon?: string;   // Ignition icon path (library/name), e.g. 'material/build'
}

/** The minimal shape the styling helpers need from an event/bar/item. */
export interface Styleable {
    color?: string;      // explicit colour override
    category?: string;   // category id (supplies colour/icon unless color overrides)
    status?: string;     // 'tentative' | 'cancelled' | 'done' — anything else = normal
}
