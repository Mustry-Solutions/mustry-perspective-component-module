// Built-in UI-text pack for the Schedule Manager (first of the admin family).
// `config.locale` picks the default language (primary subtag, English
// fallback); `config.labels.*` overrides any single key. Re-exported through
// shared/labelPacks.ts.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; the
// per-key overrides exist so deployments can correct or rebrand them.

import { primaryLang } from './common';
import { CommitLabels, commitLabelBase } from './commit';

export interface ScheduleManagerLabels extends CommitLabels {
    listHeader: string;       // schedule list rail heading
    noSchedules: string;      // empty-list placeholder
    noSelection: string;      // detail pane placeholder when nothing is selected
    allDays: string;          // badge + toggle: schedule is available 24/7
    alternating: string;      // badge: A/B alternating schedule (week A rendered)
    observesHolidays: string; // badge + toggle: schedule observes gateway holidays
    activeNow: string;        // badge/dot: schedule is active at render time
    delete: string;           // delete-schedule button
    confirmDelete: string;    // second-step delete confirmation button
    clickToRemove: string;    // block tooltip while editable
    description: string;      // description input placeholder/aria-label
}

type OwnLabels = Omit<ScheduleManagerLabels, keyof CommitLabels>;

const PACKS: { [lang: string]: OwnLabels } = {
    en: {
        listHeader: 'Schedules', noSchedules: 'No schedules', noSelection: 'Select a schedule',
        allDays: 'All days', alternating: 'Alternating weeks — week A shown',
        observesHolidays: 'Observes holidays', activeNow: 'Active now',
        delete: 'Delete', confirmDelete: 'Confirm delete?', clickToRemove: 'Click to remove',
        description: 'Description'
    },
    fr: {
        listHeader: 'Horaires', noSchedules: 'Aucun horaire', noSelection: 'Sélectionnez un horaire',
        allDays: 'Tous les jours', alternating: 'Semaines alternées — semaine A affichée',
        observesHolidays: 'Respecte les jours fériés', activeNow: 'Actif actuellement',
        delete: 'Supprimer', confirmDelete: 'Confirmer la suppression ?', clickToRemove: 'Cliquer pour retirer',
        description: 'Description'
    },
    de: {
        listHeader: 'Zeitpläne', noSchedules: 'Keine Zeitpläne', noSelection: 'Zeitplan auswählen',
        allDays: 'Alle Tage', alternating: 'Wechselnde Wochen — Woche A angezeigt',
        observesHolidays: 'Berücksichtigt Feiertage', activeNow: 'Jetzt aktiv',
        delete: 'Löschen', confirmDelete: 'Löschen bestätigen?', clickToRemove: 'Klicken zum Entfernen',
        description: 'Beschreibung'
    },
    es: {
        listHeader: 'Horarios', noSchedules: 'Sin horarios', noSelection: 'Seleccione un horario',
        allDays: 'Todos los días', alternating: 'Semanas alternas — se muestra la semana A',
        observesHolidays: 'Respeta los festivos', activeNow: 'Activo ahora',
        delete: 'Eliminar', confirmDelete: '¿Confirmar eliminación?', clickToRemove: 'Clic para quitar',
        description: 'Descripción'
    },
    nl: {
        listHeader: 'Roosters', noSchedules: 'Geen roosters', noSelection: 'Selecteer een rooster',
        allDays: 'Alle dagen', alternating: 'Wisselende weken — week A getoond',
        observesHolidays: 'Volgt feestdagen', activeNow: 'Nu actief',
        delete: 'Verwijderen', confirmDelete: 'Verwijderen bevestigen?', clickToRemove: 'Klik om te verwijderen',
        description: 'Omschrijving'
    },
    it: {
        listHeader: 'Orari', noSchedules: 'Nessun orario', noSelection: 'Seleziona un orario',
        allDays: 'Tutti i giorni', alternating: 'Settimane alternate — settimana A mostrata',
        observesHolidays: 'Osserva le festività', activeNow: 'Attivo ora',
        delete: 'Elimina', confirmDelete: 'Confermare l’eliminazione?', clickToRemove: 'Clic per rimuovere',
        description: 'Descrizione'
    },
    pt: {
        listHeader: 'Horários', noSchedules: 'Sem horários', noSelection: 'Selecione um horário',
        allDays: 'Todos os dias', alternating: 'Semanas alternadas — semana A exibida',
        observesHolidays: 'Observa feriados', activeNow: 'Ativo agora',
        delete: 'Excluir', confirmDelete: 'Confirmar exclusão?', clickToRemove: 'Clique para remover',
        description: 'Descrição'
    }
};

/** The Schedule Manager's default label set for a locale (English when not
 *  bundled) — the shared commit strings (Save / Discard / unsaved) merged in. */
export function scheduleLabelBase(locale: string): ScheduleManagerLabels {
    return { ...commitLabelBase(locale), ...(PACKS[primaryLang(locale)] || PACKS.en) };
}

export const EN_SCHEDULE_LABELS: ScheduleManagerLabels = scheduleLabelBase('en');
