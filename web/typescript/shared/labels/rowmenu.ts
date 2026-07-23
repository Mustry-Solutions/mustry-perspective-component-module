// Shared "row menu" labels — the per-row ⋯ menu (Duplicate / Delete) the
// admin family's rails use. Like CommitLabels: each component's label
// interface extends RowMenuLabels and its labelBase() spreads
// rowMenuLabelBase() in, so these are translated once.
import { primaryLang } from './common';

export interface RowMenuLabels {
    moreActions: string;   // the ⋯ button's accessible name
    duplicate: string;     // duplicate menu item
}

const PACKS: { [lang: string]: RowMenuLabels } = {
    en: { moreActions: 'More actions', duplicate: 'Duplicate' },
    fr: { moreActions: 'Plus d’actions', duplicate: 'Dupliquer' },
    de: { moreActions: 'Weitere Aktionen', duplicate: 'Duplizieren' },
    es: { moreActions: 'Más acciones', duplicate: 'Duplicar' },
    nl: { moreActions: 'Meer acties', duplicate: 'Dupliceren' },
    it: { moreActions: 'Altre azioni', duplicate: 'Duplica' },
    pt: { moreActions: 'Mais ações', duplicate: 'Duplicar' }
};

/** The row-menu labels for a locale (English when not bundled). */
export function rowMenuLabelBase(locale: string): RowMenuLabels {
    return PACKS[primaryLang(locale)] || PACKS.en;
}
