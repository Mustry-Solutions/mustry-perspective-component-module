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

/** The calendar's overridable UI text — every user-visible built-in string. */
export interface CalLabels {
    // toolbar
    month: string; week: string; day: string; list: string;
    today: string;
    followNow: string;            // toolbar live-follow toggle ('Live')
    exportCsv: string;            // export button tooltip / accessible label
    previous: string; next: string;   // nav arrows (accessible labels)
    // grids, list, popovers
    allDayTime: string;           // the 'all-day' time-cell/gutter label
    statusTentative: string; statusCancelled: string; statusDone: string;   // hover-popover status badge
    noEvents: string;             // list / day-popover empty text (emptyMessage wins in the list)
    more: string;                 // month-cell overflow, '{n}' = hidden count
    showDayEvents: string;        // date-number tooltip (opens the day popover)
    previousMonth: string; nextMonth: string;   // mini-nav arrows (accessible labels)
    // empty-state badge tooltip (Calendar.emptyHint)
    emptyHintIntro: string;
    emptyHintCreate: string;
    emptyHintBind: string;
    // built-in editor
    newEvent: string; editEvent: string;
    thisEvent: string; allEvents: string;   // apply-to scope for a recurring occurrence
    title: string; eventTitle: string;      // field label / placeholder
    allDay: string;
    start: string; end: string;
    timesIn: string;              // timezone hint, '{tz}' = the configured zone
    invalidRange: string;         // save-blocking hint when the end is not after the start
    repeat: string; doesNotRepeat: string;
    daily: string; weekly: string; monthly: string; yearly: string;
    every: string;
    unitDays: string; unitWeeks: string; unitMonths: string; unitYears: string;
    ends: string; never: string; on: string; after: string; times: string;
    category: string; none: string; notes: string;
    save: string; create: string; cancel: string; delete: string;
}

export const EN_CALENDAR_LABELS: CalLabels = {
    month: 'Month', week: 'Week', day: 'Day', list: 'List',
    today: 'Today',
    followNow: 'Live',
    exportCsv: 'Export events to CSV',
    previous: 'Previous', next: 'Next',
    allDayTime: 'all-day',
    statusTentative: 'Tentative', statusCancelled: 'Cancelled', statusDone: 'Done',
    noEvents: 'No events',
    more: '+{n} more',
    showDayEvents: "Show this day's events",
    previousMonth: 'Previous month', nextMonth: 'Next month',
    emptyHintIntro: 'This calendar shows the events in its data; switch Month / Week / Day / List in the toolbar.',
    emptyHintCreate: 'Add an event: in Week or Day view, drag over an empty time slot.',
    emptyHintBind: 'Events come from the data binding — enable "selectable" + "builtInEditor" to add them here.',
    newEvent: 'New event', editEvent: 'Edit event',
    thisEvent: 'This event', allEvents: 'All events',
    title: 'Title', eventTitle: 'Event title',
    allDay: 'All day',
    start: 'Start', end: 'End',
    timesIn: 'Times in {tz}',
    invalidRange: 'End must be after start',
    repeat: 'Repeat', doesNotRepeat: 'Does not repeat',
    daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
    every: 'Every',
    unitDays: 'day(s)', unitWeeks: 'week(s)', unitMonths: 'month(s)', unitYears: 'year(s)',
    ends: 'Ends', never: 'Never', on: 'On', after: 'After', times: 'times',
    category: 'Category', none: 'None', notes: 'Notes',
    save: 'Save', create: 'Create', cancel: 'Cancel', delete: 'Delete'
};

const CALENDAR_PACKS: { [lang: string]: CalLabels } = {
    fr: {
        month: 'Mois', week: 'Semaine', day: 'Jour', list: 'Liste',
        today: "Aujourd'hui",
        followNow: 'En direct',
        exportCsv: 'Exporter les événements en CSV',
        previous: 'Précédent', next: 'Suivant',
        allDayTime: 'journée',
        statusTentative: 'Provisoire', statusCancelled: 'Annulé', statusDone: 'Terminé',
        noEvents: 'Aucun événement',
        more: '+{n} autres',
        showDayEvents: 'Voir les événements du jour',
        previousMonth: 'Mois précédent', nextMonth: 'Mois suivant',
        emptyHintIntro: "Ce calendrier affiche les événements de ses données ; changez de vue (Mois / Semaine / Jour / Liste) dans la barre d'outils.",
        emptyHintCreate: 'Ajouter un événement : en vue Semaine ou Jour, faites glisser sur un créneau vide.',
        emptyHintBind: 'Les événements proviennent de la liaison de données — activez « selectable » + « builtInEditor » pour les ajouter ici.',
        newEvent: 'Nouvel événement', editEvent: "Modifier l'événement",
        thisEvent: 'Cet événement', allEvents: 'Tous les événements',
        title: 'Titre', eventTitle: "Titre de l'événement",
        allDay: 'Toute la journée',
        start: 'Début', end: 'Fin',
        timesIn: 'Heures en {tz}',
        invalidRange: 'La fin doit être après le début',
        repeat: 'Répéter', doesNotRepeat: 'Ne se répète pas',
        daily: 'Quotidien', weekly: 'Hebdomadaire', monthly: 'Mensuel', yearly: 'Annuel',
        every: 'Tous les',
        unitDays: 'jour(s)', unitWeeks: 'semaine(s)', unitMonths: 'mois', unitYears: 'an(s)',
        ends: 'Se termine', never: 'Jamais', on: 'Le', after: 'Après', times: 'fois',
        category: 'Catégorie', none: 'Aucune', notes: 'Notes',
        save: 'Enregistrer', create: 'Créer', cancel: 'Annuler', delete: 'Supprimer'
    },
    de: {
        month: 'Monat', week: 'Woche', day: 'Tag', list: 'Liste',
        today: 'Heute',
        followNow: 'Live',
        exportCsv: 'Ereignisse als CSV exportieren',
        previous: 'Zurück', next: 'Weiter',
        allDayTime: 'ganztägig',
        statusTentative: 'Vorläufig', statusCancelled: 'Abgesagt', statusDone: 'Erledigt',
        noEvents: 'Keine Ereignisse',
        more: '+{n} weitere',
        showDayEvents: 'Ereignisse dieses Tages anzeigen',
        previousMonth: 'Vorheriger Monat', nextMonth: 'Nächster Monat',
        emptyHintIntro: 'Dieser Kalender zeigt die Ereignisse seiner Daten; wechseln Sie die Ansicht (Monat / Woche / Tag / Liste) in der Symbolleiste.',
        emptyHintCreate: 'Ereignis hinzufügen: in der Wochen- oder Tagesansicht über einen leeren Zeitraum ziehen.',
        emptyHintBind: 'Ereignisse kommen aus der Datenanbindung — aktivieren Sie „selectable“ + „builtInEditor“, um sie hier anzulegen.',
        newEvent: 'Neues Ereignis', editEvent: 'Ereignis bearbeiten',
        thisEvent: 'Dieses Ereignis', allEvents: 'Alle Ereignisse',
        title: 'Titel', eventTitle: 'Ereignistitel',
        allDay: 'Ganztägig',
        start: 'Beginn', end: 'Ende',
        timesIn: 'Zeiten in {tz}',
        invalidRange: 'Das Ende muss nach dem Beginn liegen',
        repeat: 'Wiederholen', doesNotRepeat: 'Wiederholt sich nicht',
        daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich', yearly: 'Jährlich',
        every: 'Alle',
        unitDays: 'Tag(e)', unitWeeks: 'Woche(n)', unitMonths: 'Monat(e)', unitYears: 'Jahr(e)',
        ends: 'Endet', never: 'Nie', on: 'Am', after: 'Nach', times: 'Terminen',
        category: 'Kategorie', none: 'Keine', notes: 'Notizen',
        save: 'Speichern', create: 'Erstellen', cancel: 'Abbrechen', delete: 'Löschen'
    },
    es: {
        month: 'Mes', week: 'Semana', day: 'Día', list: 'Lista',
        today: 'Hoy',
        followNow: 'En vivo',
        exportCsv: 'Exportar eventos a CSV',
        previous: 'Anterior', next: 'Siguiente',
        allDayTime: 'todo el día',
        statusTentative: 'Provisional', statusCancelled: 'Cancelado', statusDone: 'Completado',
        noEvents: 'Sin eventos',
        more: '+{n} más',
        showDayEvents: 'Ver los eventos de este día',
        previousMonth: 'Mes anterior', nextMonth: 'Mes siguiente',
        emptyHintIntro: 'Este calendario muestra los eventos de sus datos; cambie de vista (Mes / Semana / Día / Lista) en la barra de herramientas.',
        emptyHintCreate: 'Añadir un evento: en la vista Semana o Día, arrastre sobre un intervalo vacío.',
        emptyHintBind: 'Los eventos provienen del enlace de datos — active «selectable» + «builtInEditor» para añadirlos aquí.',
        newEvent: 'Nuevo evento', editEvent: 'Editar evento',
        thisEvent: 'Este evento', allEvents: 'Todos los eventos',
        title: 'Título', eventTitle: 'Título del evento',
        allDay: 'Todo el día',
        start: 'Inicio', end: 'Fin',
        timesIn: 'Horas en {tz}',
        invalidRange: 'El fin debe ser posterior al inicio',
        repeat: 'Repetir', doesNotRepeat: 'No se repite',
        daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual', yearly: 'Anual',
        every: 'Cada',
        unitDays: 'día(s)', unitWeeks: 'semana(s)', unitMonths: 'mes(es)', unitYears: 'año(s)',
        ends: 'Termina', never: 'Nunca', on: 'El', after: 'Después de', times: 'veces',
        category: 'Categoría', none: 'Ninguna', notes: 'Notas',
        save: 'Guardar', create: 'Crear', cancel: 'Cancelar', delete: 'Eliminar'
    },
    nl: {
        month: 'Maand', week: 'Week', day: 'Dag', list: 'Lijst',
        today: 'Vandaag',
        followNow: 'Live',
        exportCsv: 'Evenementen exporteren als CSV',
        previous: 'Vorige', next: 'Volgende',
        allDayTime: 'hele dag',
        statusTentative: 'Voorlopig', statusCancelled: 'Geannuleerd', statusDone: 'Afgerond',
        noEvents: 'Geen evenementen',
        more: '+{n} meer',
        showDayEvents: 'Toon de evenementen van deze dag',
        previousMonth: 'Vorige maand', nextMonth: 'Volgende maand',
        emptyHintIntro: 'Deze kalender toont de evenementen uit zijn data; wissel van weergave (Maand / Week / Dag / Lijst) in de werkbalk.',
        emptyHintCreate: 'Evenement toevoegen: sleep in de Week- of Dagweergave over een leeg tijdvak.',
        emptyHintBind: 'Evenementen komen uit de databinding — zet "selectable" + "builtInEditor" aan om ze hier toe te voegen.',
        newEvent: 'Nieuw evenement', editEvent: 'Evenement bewerken',
        thisEvent: 'Dit evenement', allEvents: 'Alle evenementen',
        title: 'Titel', eventTitle: 'Titel van het evenement',
        allDay: 'Hele dag',
        start: 'Begin', end: 'Einde',
        timesIn: 'Tijden in {tz}',
        invalidRange: 'Het einde moet na het begin liggen',
        repeat: 'Herhalen', doesNotRepeat: 'Wordt niet herhaald',
        daily: 'Dagelijks', weekly: 'Wekelijks', monthly: 'Maandelijks', yearly: 'Jaarlijks',
        every: 'Elke',
        unitDays: 'dag(en)', unitWeeks: 'week/weken', unitMonths: 'maand(en)', unitYears: 'jaar/jaren',
        ends: 'Eindigt', never: 'Nooit', on: 'Op', after: 'Na', times: 'keer',
        category: 'Categorie', none: 'Geen', notes: 'Notities',
        save: 'Opslaan', create: 'Aanmaken', cancel: 'Annuleren', delete: 'Verwijderen'
    },
    it: {
        month: 'Mese', week: 'Settimana', day: 'Giorno', list: 'Elenco',
        today: 'Oggi',
        followNow: 'In diretta',
        exportCsv: 'Esporta eventi in CSV',
        previous: 'Precedente', next: 'Successivo',
        allDayTime: 'tutto il giorno',
        statusTentative: 'Provvisorio', statusCancelled: 'Annullato', statusDone: 'Completato',
        noEvents: 'Nessun evento',
        more: '+{n} altri',
        showDayEvents: 'Mostra gli eventi di questo giorno',
        previousMonth: 'Mese precedente', nextMonth: 'Mese successivo',
        emptyHintIntro: 'Questo calendario mostra gli eventi dei suoi dati; cambia vista (Mese / Settimana / Giorno / Elenco) nella barra degli strumenti.',
        emptyHintCreate: 'Aggiungi un evento: nella vista Settimana o Giorno, trascina su una fascia oraria vuota.',
        emptyHintBind: 'Gli eventi provengono dal binding dei dati — attiva "selectable" + "builtInEditor" per aggiungerli qui.',
        newEvent: 'Nuovo evento', editEvent: 'Modifica evento',
        thisEvent: 'Questo evento', allEvents: 'Tutti gli eventi',
        title: 'Titolo', eventTitle: "Titolo dell'evento",
        allDay: 'Tutto il giorno',
        start: 'Inizio', end: 'Fine',
        timesIn: 'Orari in {tz}',
        invalidRange: "La fine deve essere successiva all'inizio",
        repeat: 'Ripeti', doesNotRepeat: 'Non si ripete',
        daily: 'Giornaliero', weekly: 'Settimanale', monthly: 'Mensile', yearly: 'Annuale',
        every: 'Ogni',
        unitDays: 'giorno/i', unitWeeks: 'settimana/e', unitMonths: 'mese/i', unitYears: 'anno/i',
        ends: 'Termina', never: 'Mai', on: 'Il', after: 'Dopo', times: 'volte',
        category: 'Categoria', none: 'Nessuna', notes: 'Note',
        save: 'Salva', create: 'Crea', cancel: 'Annulla', delete: 'Elimina'
    },
    pt: {
        month: 'Mês', week: 'Semana', day: 'Dia', list: 'Lista',
        today: 'Hoje',
        followNow: 'Ao vivo',
        exportCsv: 'Exportar eventos para CSV',
        previous: 'Anterior', next: 'Seguinte',
        allDayTime: 'dia inteiro',
        statusTentative: 'Provisório', statusCancelled: 'Cancelado', statusDone: 'Concluído',
        noEvents: 'Sem eventos',
        more: '+{n} mais',
        showDayEvents: 'Mostrar os eventos deste dia',
        previousMonth: 'Mês anterior', nextMonth: 'Mês seguinte',
        emptyHintIntro: 'Este calendário mostra os eventos dos seus dados; mude de vista (Mês / Semana / Dia / Lista) na barra de ferramentas.',
        emptyHintCreate: 'Adicionar um evento: na vista Semana ou Dia, arraste sobre um intervalo vazio.',
        emptyHintBind: 'Os eventos vêm da ligação de dados — ative "selectable" + "builtInEditor" para os adicionar aqui.',
        newEvent: 'Novo evento', editEvent: 'Editar evento',
        thisEvent: 'Este evento', allEvents: 'Todos os eventos',
        title: 'Título', eventTitle: 'Título do evento',
        allDay: 'Dia inteiro',
        start: 'Início', end: 'Fim',
        timesIn: 'Horas em {tz}',
        invalidRange: 'O fim deve ser posterior ao início',
        repeat: 'Repetir', doesNotRepeat: 'Não se repete',
        daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual',
        every: 'A cada',
        unitDays: 'dia(s)', unitWeeks: 'semana(s)', unitMonths: 'mês/meses', unitYears: 'ano(s)',
        ends: 'Termina', never: 'Nunca', on: 'Em', after: 'Após', times: 'vezes',
        category: 'Categoria', none: 'Nenhuma', notes: 'Notas',
        save: 'Salvar', create: 'Criar', cancel: 'Cancelar', delete: 'Excluir'
    }
};

/** The calendar's default label set for a locale (English when not bundled). */
export function calendarLabelBase(locale: string): CalLabels {
    return CALENDAR_PACKS[primaryLang(locale)] || EN_CALENDAR_LABELS;
}
