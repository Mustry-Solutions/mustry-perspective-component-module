// Shared "commit controls" labels — the Save / Discard / unsaved-badge / undo /
// redo strings common to every editor-style component (rich text, code, …).
// A component's own LabelConfig interface extends CommitLabels and its
// labelBase() spreads commitLabelBase() in, so these are translated ONCE and a
// new editor can never ship an un-localized Undo tooltip again.
import { primaryLang } from './common';

export interface CommitLabels {
    save: string;
    discard: string;                  // discard-draft button tooltip
    unsaved: string;                  // dirty badge
    undo: string;
    redo: string;
}

export const EN_COMMIT_LABELS: CommitLabels = {
    save: 'Save', discard: 'Discard', unsaved: 'Unsaved changes', undo: 'Undo', redo: 'Redo'
};

const COMMIT_PACKS: { [lang: string]: CommitLabels } = {
    en: EN_COMMIT_LABELS,
    fr: { save: 'Enregistrer', discard: 'Annuler', unsaved: 'Modifications non enregistrées', undo: 'Annuler', redo: 'Rétablir' },
    de: { save: 'Speichern', discard: 'Verwerfen', unsaved: 'Ungespeicherte Änderungen', undo: 'Rückgängig', redo: 'Wiederholen' },
    es: { save: 'Guardar', discard: 'Descartar', unsaved: 'Cambios sin guardar', undo: 'Deshacer', redo: 'Rehacer' },
    nl: { save: 'Opslaan', discard: 'Verwerpen', unsaved: 'Niet-opgeslagen wijzigingen', undo: 'Ongedaan maken', redo: 'Opnieuw' },
    it: { save: 'Salva', discard: 'Annulla', unsaved: 'Modifiche non salvate', undo: 'Annulla', redo: 'Ripristina' },
    pt: { save: 'Salvar', discard: 'Descartar', unsaved: 'Alterações não salvas', undo: 'Desfazer', redo: 'Refazer' }
};

/** The commit labels for a locale (English when not bundled). */
export function commitLabelBase(locale: string): CommitLabels {
    return COMMIT_PACKS[primaryLang(locale)] || EN_COMMIT_LABELS;
}
