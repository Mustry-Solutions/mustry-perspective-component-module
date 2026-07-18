// Built-in UI-text packs for the module's components. `config.locale` picks the
// default language (matched on the primary subtag: 'fr-BE' -> 'fr'; unknown ->
// English), and `config.labels.*` still overrides any individual key on top.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; per-key
// overrides exist precisely so deployments can correct or rebrand them.

import { primaryLang } from './common';
import { CommitLabels, commitLabelBase } from './commit';

// --- code editor ----------------------------------------------------------------
// save / discard / unsaved / undo / redo come from CommitLabels (shared with
// every editor); only the code-specific strings live here.

export interface CodeLabels extends CommitLabels {
    format: string;                   // JSON pretty-print button
    invalid: string;                  // validity badge when the JSON doesn't parse
}

interface CodeOnly { format: string; invalid: string; }

const CODE_ONLY: { [lang: string]: CodeOnly } = {
    en: { format: 'Format JSON', invalid: 'Invalid JSON' },
    fr: { format: 'Formater le JSON', invalid: 'JSON invalide' },
    de: { format: 'JSON formatieren', invalid: 'Ungültiges JSON' },
    es: { format: 'Formatear JSON', invalid: 'JSON no válido' },
    nl: { format: 'JSON formatteren', invalid: 'Ongeldige JSON' },
    it: { format: 'Formatta JSON', invalid: 'JSON non valido' },
    pt: { format: 'Formatar JSON', invalid: 'JSON inválido' }
};

export const EN_CODE_LABELS: CodeLabels = { ...commitLabelBase('en'), ...CODE_ONLY.en };

/** The code editor's default label set for a locale (English when not bundled). */
export function codeLabelBase(locale: string): CodeLabels {
    return { ...commitLabelBase(locale), ...(CODE_ONLY[primaryLang(locale)] || CODE_ONLY.en) };
}
