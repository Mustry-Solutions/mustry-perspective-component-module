// Built-in UI-text packs for the module's components. `config.locale` picks the
// default language (matched on the primary subtag: 'fr-BE' -> 'fr'; unknown ->
// English), and `config.labels.*` still overrides any individual key on top.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; per-key
// overrides exist precisely so deployments can correct or rebrand them.

import { primaryLang } from './common';

// --- rich text editor -----------------------------------------------------------

export interface RteLabels {
    bold: string;                     // toolbar tooltips / accessible labels
    italic: string;
    underline: string;
    strike: string;
    paragraph: string;
    heading: string;                  // '{n}' = heading level
    bulletList: string;
    orderedList: string;
    link: string;
    linkPlaceholder: string;          // the link popover's input placeholder
    apply: string;                    // link popover: apply button
    removeLink: string;
    save: string;
    discard: string;
    unsaved: string;                  // dirty badge
}

export const EN_RTE_LABELS: RteLabels = {
    bold: 'Bold', italic: 'Italic', underline: 'Underline', strike: 'Strikethrough',
    paragraph: 'Paragraph', heading: 'Heading {n}',
    bulletList: 'Bulleted list', orderedList: 'Numbered list',
    link: 'Link', linkPlaceholder: 'https://…', apply: 'Apply', removeLink: 'Remove link',
    save: 'Save', discard: 'Discard', unsaved: 'Unsaved changes'
};

const RTE_PACKS: { [lang: string]: RteLabels } = {
    en: EN_RTE_LABELS,
    fr: {
        bold: 'Gras', italic: 'Italique', underline: 'Souligné', strike: 'Barré',
        paragraph: 'Paragraphe', heading: 'Titre {n}',
        bulletList: 'Liste à puces', orderedList: 'Liste numérotée',
        link: 'Lien', linkPlaceholder: 'https://…', apply: 'Appliquer', removeLink: 'Supprimer le lien',
        save: 'Enregistrer', discard: 'Annuler', unsaved: 'Modifications non enregistrées'
    },
    de: {
        bold: 'Fett', italic: 'Kursiv', underline: 'Unterstrichen', strike: 'Durchgestrichen',
        paragraph: 'Absatz', heading: 'Überschrift {n}',
        bulletList: 'Aufzählung', orderedList: 'Nummerierte Liste',
        link: 'Link', linkPlaceholder: 'https://…', apply: 'Übernehmen', removeLink: 'Link entfernen',
        save: 'Speichern', discard: 'Verwerfen', unsaved: 'Ungespeicherte Änderungen'
    },
    es: {
        bold: 'Negrita', italic: 'Cursiva', underline: 'Subrayado', strike: 'Tachado',
        paragraph: 'Párrafo', heading: 'Título {n}',
        bulletList: 'Lista con viñetas', orderedList: 'Lista numerada',
        link: 'Enlace', linkPlaceholder: 'https://…', apply: 'Aplicar', removeLink: 'Quitar enlace',
        save: 'Guardar', discard: 'Descartar', unsaved: 'Cambios sin guardar'
    },
    nl: {
        bold: 'Vet', italic: 'Cursief', underline: 'Onderstreept', strike: 'Doorgestreept',
        paragraph: 'Alinea', heading: 'Kop {n}',
        bulletList: 'Opsommingslijst', orderedList: 'Genummerde lijst',
        link: 'Link', linkPlaceholder: 'https://…', apply: 'Toepassen', removeLink: 'Link verwijderen',
        save: 'Opslaan', discard: 'Verwerpen', unsaved: 'Niet-opgeslagen wijzigingen'
    },
    it: {
        bold: 'Grassetto', italic: 'Corsivo', underline: 'Sottolineato', strike: 'Barrato',
        paragraph: 'Paragrafo', heading: 'Titolo {n}',
        bulletList: 'Elenco puntato', orderedList: 'Elenco numerato',
        link: 'Link', linkPlaceholder: 'https://…', apply: 'Applica', removeLink: 'Rimuovi link',
        save: 'Salva', discard: 'Annulla', unsaved: 'Modifiche non salvate'
    },
    pt: {
        bold: 'Negrito', italic: 'Itálico', underline: 'Sublinhado', strike: 'Tachado',
        paragraph: 'Parágrafo', heading: 'Título {n}',
        bulletList: 'Lista com marcadores', orderedList: 'Lista numerada',
        link: 'Link', linkPlaceholder: 'https://…', apply: 'Aplicar', removeLink: 'Remover link',
        save: 'Salvar', discard: 'Descartar', unsaved: 'Alterações não salvas'
    }
};

/** The rich text editor's default label set for a locale (English when not bundled). */
export function rteLabelBase(locale: string): RteLabels {
    return RTE_PACKS[primaryLang(locale)] || EN_RTE_LABELS;
}
