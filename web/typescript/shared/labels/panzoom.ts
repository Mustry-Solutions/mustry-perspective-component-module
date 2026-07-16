// Built-in UI-text packs for the module's components. `config.locale` picks the
// default language (matched on the primary subtag: 'fr-BE' -> 'fr'; unknown ->
// English), and `config.labels.*` still overrides any individual key on top.
// Date, weekday and month names are NOT here — they come from Intl via the same
// locale. The label-set interfaces live here too so the shared layer has no
// dependency on any component.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; per-key
// overrides exist precisely so deployments can correct or rebrand them.

import { primaryLang } from './common';

// --- pan & zoom view --------------------------------------------------------------

export interface PzLabels {
    zoomIn: string;
    zoomOut: string;
    home: string;                     // reset to config.home
    fit: string;                      // fit the whole content
    goTo: string;                     // POI list placeholder
    overview: string;                 // minimap aria-label
}

export const EN_PZ_LABELS: PzLabels = {
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    home: 'Reset view',
    fit: 'Fit to view',
    goTo: 'Go to…',
    overview: 'Overview',
};

const PZ_PACKS: { [lang: string]: PzLabels } = {
    fr: { zoomIn: 'Zoomer', zoomOut: 'Dézoomer', home: 'Réinitialiser la vue', fit: 'Ajuster à la vue', goTo: 'Aller à…', overview: 'Vue d’ensemble' },
    de: { zoomIn: 'Vergrößern', zoomOut: 'Verkleinern', home: 'Ansicht zurücksetzen', fit: 'Einpassen', goTo: 'Gehe zu…', overview: 'Übersicht' },
    es: { zoomIn: 'Acercar', zoomOut: 'Alejar', home: 'Restablecer vista', fit: 'Ajustar a la vista', goTo: 'Ir a…', overview: 'Vista general' },
    nl: { zoomIn: 'Inzoomen', zoomOut: 'Uitzoomen', home: 'Weergave herstellen', fit: 'Passend maken', goTo: 'Ga naar…', overview: 'Overzicht' },
    it: { zoomIn: 'Ingrandisci', zoomOut: 'Riduci', home: 'Reimposta vista', fit: 'Adatta alla vista', goTo: 'Vai a…', overview: 'Panoramica' },
    pt: { zoomIn: 'Aproximar', zoomOut: 'Afastar', home: 'Redefinir vista', fit: 'Ajustar à vista', goTo: 'Ir para…', overview: 'Visão geral' },
};

/** The pan/zoom label pack for a locale (primary subtag; unknown -> English). */
export function pzLabelBase(locale: string): PzLabels {
    return PZ_PACKS[primaryLang(locale)] || EN_PZ_LABELS;
}
