// Built-in UI-text pack for the Color Picker. `config.locale` picks the default
// language (primary subtag, English fallback) and `config.labels.*` overrides
// any single key on top. See labelPacks.ts for the barrel re-export.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; the
// per-key overrides exist precisely so deployments can correct or rebrand them.

import { primaryLang } from './common';

export interface ColorLabels {
    hex: string;          // format toggle: hexadecimal
    rgb: string;          // format toggle: rgb()
    hsl: string;          // format toggle: hsl()
    alpha: string;        // alpha slider aria-label
    hue: string;          // hue slider aria-label
    saturation: string;   // saturation/value area aria-label
    eyedropper: string;   // eyedropper button tooltip
    swatches: string;     // bound-palette heading
    recent: string;       // recent-colours heading
    invalid: string;      // shown when the typed text isn't a colour
    clear: string;        // clear / reset tooltip
}

const PACKS: { [lang: string]: ColorLabels } = {
    en: { hex: 'HEX', rgb: 'RGB', hsl: 'HSL', alpha: 'Alpha', hue: 'Hue', saturation: 'Saturation and value', eyedropper: 'Pick a colour from the screen', swatches: 'Swatches', recent: 'Recent', invalid: 'Not a colour', clear: 'Clear' },
    fr: { hex: 'HEX', rgb: 'RVB', hsl: 'TSL', alpha: 'Alpha', hue: 'Teinte', saturation: 'Saturation et valeur', eyedropper: 'Choisir une couleur à l’écran', swatches: 'Échantillons', recent: 'Récents', invalid: 'Pas une couleur', clear: 'Effacer' },
    de: { hex: 'HEX', rgb: 'RGB', hsl: 'HSL', alpha: 'Alpha', hue: 'Farbton', saturation: 'Sättigung und Helligkeit', eyedropper: 'Farbe vom Bildschirm wählen', swatches: 'Farbfelder', recent: 'Zuletzt', invalid: 'Keine Farbe', clear: 'Löschen' },
    es: { hex: 'HEX', rgb: 'RGB', hsl: 'HSL', alpha: 'Alfa', hue: 'Tono', saturation: 'Saturación y valor', eyedropper: 'Elegir un color de la pantalla', swatches: 'Muestras', recent: 'Recientes', invalid: 'No es un color', clear: 'Borrar' },
    nl: { hex: 'HEX', rgb: 'RGB', hsl: 'HSL', alpha: 'Alfa', hue: 'Tint', saturation: 'Verzadiging en waarde', eyedropper: 'Kies een kleur van het scherm', swatches: 'Stalen', recent: 'Recent', invalid: 'Geen kleur', clear: 'Wissen' },
    it: { hex: 'HEX', rgb: 'RGB', hsl: 'HSL', alpha: 'Alfa', hue: 'Tonalità', saturation: 'Saturazione e valore', eyedropper: 'Scegli un colore dallo schermo', swatches: 'Campioni', recent: 'Recenti', invalid: 'Non è un colore', clear: 'Cancella' },
    pt: { hex: 'HEX', rgb: 'RGB', hsl: 'HSL', alpha: 'Alfa', hue: 'Matiz', saturation: 'Saturação e valor', eyedropper: 'Escolher uma cor do ecrã', swatches: 'Amostras', recent: 'Recentes', invalid: 'Não é uma cor', clear: 'Limpar' }
};

export const EN_COLOR_LABELS: ColorLabels = PACKS.en;

/** The colour picker's default label set for a locale (English when not bundled). */
export function colorLabelBase(locale: string): ColorLabels {
    return PACKS[primaryLang(locale)] || PACKS.en;
}
