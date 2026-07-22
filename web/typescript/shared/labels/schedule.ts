// Built-in UI-text pack for the Schedule Manager (first of the admin family).
// `config.locale` picks the default language (primary subtag, English
// fallback); `config.labels.*` overrides any single key. Re-exported through
// shared/labelPacks.ts.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; the
// per-key overrides exist so deployments can correct or rebrand them.

import { primaryLang } from './common';

export interface ScheduleManagerLabels {
    listHeader: string;       // schedule list rail heading
    noSchedules: string;      // empty-list placeholder
    noSelection: string;      // detail pane placeholder when nothing is selected
    allDays: string;          // badge: schedule is available 24/7
    alternating: string;      // badge: A/B alternating schedule (week A rendered)
    observesHolidays: string; // badge: schedule observes gateway holidays
    activeNow: string;        // badge/dot: schedule is active at render time
}

const PACKS: { [lang: string]: ScheduleManagerLabels } = {
    en: {
        listHeader: 'Schedules', noSchedules: 'No schedules', noSelection: 'Select a schedule',
        allDays: 'All days', alternating: 'Alternating weeks — week A shown',
        observesHolidays: 'Observes holidays', activeNow: 'Active now'
    },
    fr: {
        listHeader: 'Horaires', noSchedules: 'Aucun horaire', noSelection: 'Sélectionnez un horaire',
        allDays: 'Tous les jours', alternating: 'Semaines alternées — semaine A affichée',
        observesHolidays: 'Respecte les jours fériés', activeNow: 'Actif actuellement'
    },
    de: {
        listHeader: 'Zeitpläne', noSchedules: 'Keine Zeitpläne', noSelection: 'Zeitplan auswählen',
        allDays: 'Alle Tage', alternating: 'Wechselnde Wochen — Woche A angezeigt',
        observesHolidays: 'Berücksichtigt Feiertage', activeNow: 'Jetzt aktiv'
    },
    es: {
        listHeader: 'Horarios', noSchedules: 'Sin horarios', noSelection: 'Seleccione un horario',
        allDays: 'Todos los días', alternating: 'Semanas alternas — se muestra la semana A',
        observesHolidays: 'Respeta los festivos', activeNow: 'Activo ahora'
    },
    nl: {
        listHeader: 'Roosters', noSchedules: 'Geen roosters', noSelection: 'Selecteer een rooster',
        allDays: 'Alle dagen', alternating: 'Wisselende weken — week A getoond',
        observesHolidays: 'Volgt feestdagen', activeNow: 'Nu actief'
    },
    it: {
        listHeader: 'Orari', noSchedules: 'Nessun orario', noSelection: 'Seleziona un orario',
        allDays: 'Tutti i giorni', alternating: 'Settimane alternate — settimana A mostrata',
        observesHolidays: 'Osserva le festività', activeNow: 'Attivo ora'
    },
    pt: {
        listHeader: 'Horários', noSchedules: 'Sem horários', noSelection: 'Selecione um horário',
        allDays: 'Todos os dias', alternating: 'Semanas alternadas — semana A exibida',
        observesHolidays: 'Observa feriados', activeNow: 'Ativo agora'
    }
};

export const EN_SCHEDULE_LABELS: ScheduleManagerLabels = PACKS.en;

/** The Schedule Manager's default label set for a locale (English when not bundled). */
export function scheduleLabelBase(locale: string): ScheduleManagerLabels {
    return PACKS[primaryLang(locale)] || PACKS.en;
}
