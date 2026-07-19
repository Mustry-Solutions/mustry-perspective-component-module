// Built-in UI-text packs for the module's components. `config.locale` picks the
// default language (matched on the primary subtag: 'fr-BE' -> 'fr'; unknown ->
// English), and `config.labels.*` still overrides any individual key on top.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; per-key
// overrides exist precisely so deployments can correct or rebrand them.

import { primaryLang } from './common';

// --- dashboard layout -----------------------------------------------------------

export interface DashLabels {
    empty: string;                    // empty-state text (no tiles)
    arrange: string;                  // arrange-mode toggle tooltip
    done: string;                     // finish-arranging tooltip
    remove: string;                   // remove-tile tooltip
    addTile: string;                  // add-tile button
    move: string;                     // drag-handle accessible label
}

export const EN_DASH_LABELS: DashLabels = {
    empty: 'No tiles to show', arrange: 'Arrange', done: 'Done', remove: 'Remove tile',
    addTile: 'Add tile', move: 'Move tile'
};

const DASH_PACKS: { [lang: string]: DashLabels } = {
    en: EN_DASH_LABELS,
    fr: { empty: 'Aucune tuile à afficher', arrange: 'Réorganiser', done: 'Terminé', remove: 'Supprimer la tuile', addTile: 'Ajouter une tuile', move: 'Déplacer la tuile' },
    de: { empty: 'Keine Kacheln', arrange: 'Anordnen', done: 'Fertig', remove: 'Kachel entfernen', addTile: 'Kachel hinzufügen', move: 'Kachel verschieben' },
    es: { empty: 'No hay mosaicos', arrange: 'Organizar', done: 'Hecho', remove: 'Quitar mosaico', addTile: 'Añadir mosaico', move: 'Mover mosaico' },
    nl: { empty: 'Geen tegels', arrange: 'Schikken', done: 'Klaar', remove: 'Tegel verwijderen', addTile: 'Tegel toevoegen', move: 'Tegel verplaatsen' },
    it: { empty: 'Nessun riquadro', arrange: 'Disponi', done: 'Fatto', remove: 'Rimuovi riquadro', addTile: 'Aggiungi riquadro', move: 'Sposta riquadro' },
    pt: { empty: 'Nenhum bloco', arrange: 'Organizar', done: 'Concluído', remove: 'Remover bloco', addTile: 'Adicionar bloco', move: 'Mover bloco' }
};

/** The dashboard's default label set for a locale (English when not bundled). */
export function dashLabelBase(locale: string): DashLabels {
    return DASH_PACKS[primaryLang(locale)] || EN_DASH_LABELS;
}
