// Built-in UI-text packs for the module's components. `config.locale` picks the
// default language (matched on the primary subtag: 'fr-BE' -> 'fr'; unknown ->
// English), and `config.labels.*` still overrides any individual key on top.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; per-key
// overrides exist precisely so deployments can correct or rebrand them.

import { primaryLang } from './common';

// --- code editor ----------------------------------------------------------------

export interface CodeLabels {
    save: string;
    discard: string;
    unsaved: string;                  // dirty badge
    format: string;                   // JSON pretty-print button
    invalid: string;                  // validity badge when the JSON doesn't parse
}

export const EN_CODE_LABELS: CodeLabels = {
    save: 'Save', discard: 'Discard', unsaved: 'Unsaved changes',
    format: 'Format JSON', invalid: 'Invalid JSON'
};

const CODE_PACKS: { [lang: string]: CodeLabels } = {
    en: EN_CODE_LABELS,
    fr: { save: 'Enregistrer', discard: 'Annuler', unsaved: 'Modifications non enregistrées', format: 'Formater le JSON', invalid: 'JSON invalide' },
    de: { save: 'Speichern', discard: 'Verwerfen', unsaved: 'Ungespeicherte Änderungen', format: 'JSON formatieren', invalid: 'Ungültiges JSON' },
    es: { save: 'Guardar', discard: 'Descartar', unsaved: 'Cambios sin guardar', format: 'Formatear JSON', invalid: 'JSON no válido' },
    nl: { save: 'Opslaan', discard: 'Verwerpen', unsaved: 'Niet-opgeslagen wijzigingen', format: 'JSON formatteren', invalid: 'Ongeldige JSON' },
    it: { save: 'Salva', discard: 'Annulla', unsaved: 'Modifiche non salvate', format: 'Formatta JSON', invalid: 'JSON non valido' },
    pt: { save: 'Salvar', discard: 'Descartar', unsaved: 'Alterações não salvas', format: 'Formatar JSON', invalid: 'JSON inválido' }
};

/** The code editor's default label set for a locale (English when not bundled). */
export function codeLabelBase(locale: string): CodeLabels {
    return CODE_PACKS[primaryLang(locale)] || EN_CODE_LABELS;
}
