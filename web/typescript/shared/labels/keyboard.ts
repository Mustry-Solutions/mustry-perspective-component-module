// Built-in UI-text pack for the On-Screen Keyboard. `config.locale` picks the
// default language (primary subtag, English fallback); `config.labels.*`
// overrides any single key. Re-exported through shared/labelPacks.ts.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; the
// per-key overrides exist so deployments can correct or rebrand them.

import { primaryLang } from './common';

export interface KeyboardLabels {
    enter: string;        // commit key
    clear: string;        // clear-all key
    backspace: string;    // backspace key aria-label
    sign: string;         // +/- key aria-label
    outOfRange: string;   // shown when the value is outside min/max
}

const PACKS: { [lang: string]: KeyboardLabels } = {
    en: { enter: 'Enter', clear: 'Clear', backspace: 'Backspace', sign: 'Toggle sign', outOfRange: 'Out of range' },
    fr: { enter: 'Entrée', clear: 'Effacer', backspace: 'Retour arrière', sign: 'Inverser le signe', outOfRange: 'Hors plage' },
    de: { enter: 'Eingabe', clear: 'Löschen', backspace: 'Rücktaste', sign: 'Vorzeichen umschalten', outOfRange: 'Außerhalb des Bereichs' },
    es: { enter: 'Entrar', clear: 'Borrar', backspace: 'Retroceso', sign: 'Cambiar signo', outOfRange: 'Fuera de rango' },
    nl: { enter: 'Enter', clear: 'Wissen', backspace: 'Backspace', sign: 'Teken omschakelen', outOfRange: 'Buiten bereik' },
    it: { enter: 'Invio', clear: 'Cancella', backspace: 'Backspace', sign: 'Inverti segno', outOfRange: 'Fuori intervallo' },
    pt: { enter: 'Enter', clear: 'Limpar', backspace: 'Retrocesso', sign: 'Inverter sinal', outOfRange: 'Fora do intervalo' }
};

export const EN_KEYBOARD_LABELS: KeyboardLabels = PACKS.en;

/** The keyboard's default label set for a locale (English when not bundled). */
export function keyboardLabelBase(locale: string): KeyboardLabels {
    return PACKS[primaryLang(locale)] || PACKS.en;
}
