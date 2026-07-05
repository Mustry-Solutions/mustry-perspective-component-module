// Built-in UI-text packs for the module's components. `config.locale` picks the
// default language (matched on the primary subtag: 'fr-BE' -> 'fr'; unknown ->
// English), and `config.labels.*` still overrides any individual key on top.
// Date, weekday and month names are NOT here — they come from Intl via the same
// locale. The label-set interfaces live here too so the shared layer has no
// dependency on any component.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; per-key
// overrides exist precisely so deployments can correct or rebrand them.

/** The calendar's overridable UI text — every user-visible built-in string. */
export interface CalLabels {
    // toolbar
    month: string; week: string; day: string; list: string;
    today: string;
    exportCsv: string;            // export button tooltip / accessible label
    previous: string; next: string;   // nav arrows (accessible labels)
    // grids, list, popovers
    allDayTime: string;           // the 'all-day' time-cell/gutter label
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

/** The picker's overridable UI text. Templated keys substitute {n}/{min}/{max}/
 *  {date}; {days} becomes dayOne/dayMany by count. */
export interface LabelConfig {
    startTime: string;
    endTime: string;
    startDate: string;
    endDate: string;
    clear: string;
    selectRange: string;
    invalidRange: string;
    sameDay: string;
    previousMonth: string;
    nextMonth: string;
    dayOne: string;                // 'day'
    dayMany: string;               // 'days'
    durationDays: string;          // '{n} {days}' (footer duration)
    hintRange: string;             // span hint when both min and max are set
    hintMin: string;               // span hint, minimum only
    hintMax: string;               // span hint, maximum only
    beforeEarliest: string;        // day tooltip: before the earliest selectable date
    afterLatest: string;           // day tooltip: after the latest selectable date
    rangeAtLeast: string;          // day tooltip: violates the minimum span
    rangeAtMost: string;           // day tooltip: violates the maximum span
    presetBeforeEarliest: string;  // disabled-preset tooltip
    presetAfterLatest: string;     // disabled-preset tooltip
    presetTooShort: string;        // disabled-preset tooltip
    presetTooLong: string;         // disabled-preset tooltip
}

/** The resource timeline's overridable UI text. */
export interface TimelineLabels {
    today: string;
    previous: string; next: string;   // nav arrows (accessible labels)
    zoomHour: string; zoomDay: string; zoomWeek: string;   // zoom-preset buttons
    noResources: string;              // empty text when config.resources is empty
    exportCsv: string;                // export button tooltip / accessible label
    previousMonth: string; nextMonth: string;   // mini-nav arrows (accessible labels)
    // built-in editor
    newEvent: string; editEvent: string;
    thisEvent: string; allEvents: string;   // apply-to scope for a recurring occurrence
    title: string; eventTitle: string;   // field label / placeholder
    resource: string;
    start: string; end: string;
    timesIn: string;                     // timezone hint, '{tz}' = the configured zone
    invalidRange: string;                // save-blocking hint when the end is not after the start
    category: string; none: string; notes: string;
    save: string; create: string; cancel: string; delete: string;
}

export const EN_TIMELINE_LABELS: TimelineLabels = {
    today: 'Today',
    previous: 'Previous', next: 'Next',
    zoomHour: 'Hour', zoomDay: 'Day', zoomWeek: 'Week',
    noResources: 'No resources',
    exportCsv: 'Export events to CSV',
    previousMonth: 'Previous month', nextMonth: 'Next month',
    newEvent: 'New event', editEvent: 'Edit event',
    thisEvent: 'This event', allEvents: 'All events',
    title: 'Title', eventTitle: 'Event title',
    resource: 'Resource',
    start: 'Start', end: 'End',
    timesIn: 'Times in {tz}',
    invalidRange: 'End must be after start',
    category: 'Category', none: 'None', notes: 'Notes',
    save: 'Save', create: 'Create', cancel: 'Cancel', delete: 'Delete'
};

const TIMELINE_PACKS: { [lang: string]: TimelineLabels } = {
    fr: {
        today: "Aujourd'hui",
        previous: 'Précédent', next: 'Suivant',
        zoomHour: 'Heure', zoomDay: 'Jour', zoomWeek: 'Semaine',
        noResources: 'Aucune ressource',
        exportCsv: 'Exporter les événements en CSV',
        previousMonth: 'Mois précédent', nextMonth: 'Mois suivant',
        newEvent: 'Nouvel événement', editEvent: "Modifier l'événement",
        thisEvent: 'Cet événement', allEvents: 'Tous les événements',
        title: 'Titre', eventTitle: "Titre de l'événement",
        resource: 'Ressource',
        start: 'Début', end: 'Fin',
        timesIn: 'Heures en {tz}',
        invalidRange: 'La fin doit être après le début',
        category: 'Catégorie', none: 'Aucune', notes: 'Notes',
        save: 'Enregistrer', create: 'Créer', cancel: 'Annuler', delete: 'Supprimer'
    },
    de: {
        today: 'Heute',
        previous: 'Zurück', next: 'Weiter',
        zoomHour: 'Stunde', zoomDay: 'Tag', zoomWeek: 'Woche',
        noResources: 'Keine Ressourcen',
        exportCsv: 'Ereignisse als CSV exportieren',
        previousMonth: 'Vorheriger Monat', nextMonth: 'Nächster Monat',
        newEvent: 'Neues Ereignis', editEvent: 'Ereignis bearbeiten',
        thisEvent: 'Dieses Ereignis', allEvents: 'Alle Ereignisse',
        title: 'Titel', eventTitle: 'Ereignistitel',
        resource: 'Ressource',
        start: 'Beginn', end: 'Ende',
        timesIn: 'Zeiten in {tz}',
        invalidRange: 'Das Ende muss nach dem Beginn liegen',
        category: 'Kategorie', none: 'Keine', notes: 'Notizen',
        save: 'Speichern', create: 'Erstellen', cancel: 'Abbrechen', delete: 'Löschen'
    },
    es: {
        today: 'Hoy',
        previous: 'Anterior', next: 'Siguiente',
        zoomHour: 'Hora', zoomDay: 'Día', zoomWeek: 'Semana',
        noResources: 'Sin recursos',
        exportCsv: 'Exportar eventos a CSV',
        previousMonth: 'Mes anterior', nextMonth: 'Mes siguiente',
        newEvent: 'Nuevo evento', editEvent: 'Editar evento',
        thisEvent: 'Este evento', allEvents: 'Todos los eventos',
        title: 'Título', eventTitle: 'Título del evento',
        resource: 'Recurso',
        start: 'Inicio', end: 'Fin',
        timesIn: 'Horas en {tz}',
        invalidRange: 'El fin debe ser posterior al inicio',
        category: 'Categoría', none: 'Ninguna', notes: 'Notas',
        save: 'Guardar', create: 'Crear', cancel: 'Cancelar', delete: 'Eliminar'
    },
    nl: {
        today: 'Vandaag',
        previous: 'Vorige', next: 'Volgende',
        zoomHour: 'Uur', zoomDay: 'Dag', zoomWeek: 'Week',
        noResources: 'Geen resources',
        exportCsv: 'Evenementen exporteren als CSV',
        previousMonth: 'Vorige maand', nextMonth: 'Volgende maand',
        newEvent: 'Nieuw evenement', editEvent: 'Evenement bewerken',
        thisEvent: 'Dit evenement', allEvents: 'Alle evenementen',
        title: 'Titel', eventTitle: 'Titel van het evenement',
        resource: 'Resource',
        start: 'Begin', end: 'Einde',
        timesIn: 'Tijden in {tz}',
        invalidRange: 'Het einde moet na het begin liggen',
        category: 'Categorie', none: 'Geen', notes: 'Notities',
        save: 'Opslaan', create: 'Aanmaken', cancel: 'Annuleren', delete: 'Verwijderen'
    },
    it: {
        today: 'Oggi',
        previous: 'Precedente', next: 'Successivo',
        zoomHour: 'Ora', zoomDay: 'Giorno', zoomWeek: 'Settimana',
        noResources: 'Nessuna risorsa',
        exportCsv: 'Esporta eventi in CSV',
        previousMonth: 'Mese precedente', nextMonth: 'Mese successivo',
        newEvent: 'Nuovo evento', editEvent: 'Modifica evento',
        thisEvent: 'Questo evento', allEvents: 'Tutti gli eventi',
        title: 'Titolo', eventTitle: "Titolo dell'evento",
        resource: 'Risorsa',
        start: 'Inizio', end: 'Fine',
        timesIn: 'Orari in {tz}',
        invalidRange: "La fine deve essere successiva all'inizio",
        category: 'Categoria', none: 'Nessuna', notes: 'Note',
        save: 'Salva', create: 'Crea', cancel: 'Annulla', delete: 'Elimina'
    },
    pt: {
        today: 'Hoje',
        previous: 'Anterior', next: 'Seguinte',
        zoomHour: 'Hora', zoomDay: 'Dia', zoomWeek: 'Semana',
        noResources: 'Sem recursos',
        exportCsv: 'Exportar eventos para CSV',
        previousMonth: 'Mês anterior', nextMonth: 'Mês seguinte',
        newEvent: 'Novo evento', editEvent: 'Editar evento',
        thisEvent: 'Este evento', allEvents: 'Todos os eventos',
        title: 'Título', eventTitle: 'Título do evento',
        resource: 'Recurso',
        start: 'Início', end: 'Fim',
        timesIn: 'Horas em {tz}',
        invalidRange: 'O fim deve ser posterior ao início',
        category: 'Categoria', none: 'Nenhuma', notes: 'Notas',
        save: 'Salvar', create: 'Criar', cancel: 'Cancelar', delete: 'Excluir'
    }
};

/** The timeline's default label set for a locale (English when not bundled). */
export function timelineLabelBase(locale: string): TimelineLabels {
    return TIMELINE_PACKS[primaryLang(locale)] || EN_TIMELINE_LABELS;
}

/** Primary language subtag of a BCP-47/underscore locale ('fr-BE' / 'fr_BE' -> 'fr'). */
export function primaryLang(locale: string): string {
    return (locale || '').toLowerCase().split(/[-_]/)[0];
}

export const EN_CALENDAR_LABELS: CalLabels = {
    month: 'Month', week: 'Week', day: 'Day', list: 'List',
    today: 'Today',
    exportCsv: 'Export events to CSV',
    previous: 'Previous', next: 'Next',
    allDayTime: 'all-day',
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
        exportCsv: 'Exporter les événements en CSV',
        previous: 'Précédent', next: 'Suivant',
        allDayTime: 'journée',
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
        exportCsv: 'Ereignisse als CSV exportieren',
        previous: 'Zurück', next: 'Weiter',
        allDayTime: 'ganztägig',
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
        exportCsv: 'Exportar eventos a CSV',
        previous: 'Anterior', next: 'Siguiente',
        allDayTime: 'todo el día',
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
        exportCsv: 'Evenementen exporteren als CSV',
        previous: 'Vorige', next: 'Volgende',
        allDayTime: 'hele dag',
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
        exportCsv: 'Esporta eventi in CSV',
        previous: 'Precedente', next: 'Successivo',
        allDayTime: 'tutto il giorno',
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
        exportCsv: 'Exportar eventos para CSV',
        previous: 'Anterior', next: 'Seguinte',
        allDayTime: 'dia inteiro',
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

export const EN_PICKER_LABELS: LabelConfig = {
    startTime: 'Start time', endTime: 'End time',
    startDate: 'Start', endDate: 'End',
    clear: 'Clear',
    selectRange: 'Select a range', invalidRange: 'Invalid range', sameDay: 'Same day',
    previousMonth: 'Previous month', nextMonth: 'Next month',
    dayOne: 'day', dayMany: 'days',
    durationDays: '{n} {days}',
    hintRange: 'Pick a range of {min}–{max} days',
    hintMin: 'Pick a range of at least {n} {days}',
    hintMax: 'Pick a range of up to {n} {days}',
    beforeEarliest: 'Before the earliest selectable date ({date})',
    afterLatest: 'After the latest selectable date ({date})',
    rangeAtLeast: 'Range must be at least {n} {days}',
    rangeAtMost: 'Range can be at most {n} {days}',
    presetBeforeEarliest: 'Starts before the earliest selectable date ({date})',
    presetAfterLatest: 'Ends after the latest selectable date ({date})',
    presetTooShort: 'Shorter than the {n}-day minimum',
    presetTooLong: 'Exceeds the {n}-day maximum'
};

const PICKER_PACKS: { [lang: string]: LabelConfig } = {
    fr: {
        startTime: 'Heure de début', endTime: 'Heure de fin',
        startDate: 'Début', endDate: 'Fin',
        clear: 'Effacer',
        selectRange: 'Sélectionnez une plage', invalidRange: 'Plage invalide', sameDay: 'Même jour',
        previousMonth: 'Mois précédent', nextMonth: 'Mois suivant',
        dayOne: 'jour', dayMany: 'jours',
        durationDays: '{n} {days}',
        hintRange: 'Choisissez une plage de {min} à {max} jours',
        hintMin: "Choisissez une plage d'au moins {n} {days}",
        hintMax: 'Choisissez une plage de {n} {days} maximum',
        beforeEarliest: 'Avant la première date sélectionnable ({date})',
        afterLatest: 'Après la dernière date sélectionnable ({date})',
        rangeAtLeast: 'La plage doit durer au moins {n} {days}',
        rangeAtMost: 'La plage ne peut pas dépasser {n} {days}',
        presetBeforeEarliest: 'Commence avant la première date sélectionnable ({date})',
        presetAfterLatest: 'Se termine après la dernière date sélectionnable ({date})',
        presetTooShort: 'Plus court que le minimum de {n} jour(s)',
        presetTooLong: 'Dépasse le maximum de {n} jour(s)'
    },
    de: {
        startTime: 'Startzeit', endTime: 'Endzeit',
        startDate: 'Beginn', endDate: 'Ende',
        clear: 'Leeren',
        selectRange: 'Zeitraum wählen', invalidRange: 'Ungültiger Zeitraum', sameDay: 'Gleicher Tag',
        previousMonth: 'Vorheriger Monat', nextMonth: 'Nächster Monat',
        dayOne: 'Tag', dayMany: 'Tage',
        durationDays: '{n} {days}',
        hintRange: 'Wählen Sie einen Zeitraum von {min} bis {max} Tagen',
        hintMin: 'Wählen Sie einen Zeitraum von mindestens {n} Tag(en)',
        hintMax: 'Wählen Sie einen Zeitraum von höchstens {n} Tag(en)',
        beforeEarliest: 'Vor dem frühesten wählbaren Datum ({date})',
        afterLatest: 'Nach dem spätesten wählbaren Datum ({date})',
        rangeAtLeast: 'Der Zeitraum muss mindestens {n} {days} umfassen',
        rangeAtMost: 'Der Zeitraum darf höchstens {n} {days} umfassen',
        presetBeforeEarliest: 'Beginnt vor dem frühesten wählbaren Datum ({date})',
        presetAfterLatest: 'Endet nach dem spätesten wählbaren Datum ({date})',
        presetTooShort: 'Unterschreitet das Minimum von {n} Tag(en)',
        presetTooLong: 'Überschreitet das Maximum von {n} Tag(en)'
    },
    es: {
        startTime: 'Hora de inicio', endTime: 'Hora de fin',
        startDate: 'Inicio', endDate: 'Fin',
        clear: 'Borrar',
        selectRange: 'Seleccione un rango', invalidRange: 'Rango no válido', sameDay: 'Mismo día',
        previousMonth: 'Mes anterior', nextMonth: 'Mes siguiente',
        dayOne: 'día', dayMany: 'días',
        durationDays: '{n} {days}',
        hintRange: 'Elija un rango de {min} a {max} días',
        hintMin: 'Elija un rango de al menos {n} {days}',
        hintMax: 'Elija un rango de como máximo {n} {days}',
        beforeEarliest: 'Anterior a la primera fecha seleccionable ({date})',
        afterLatest: 'Posterior a la última fecha seleccionable ({date})',
        rangeAtLeast: 'El rango debe ser de al menos {n} {days}',
        rangeAtMost: 'El rango puede ser de como máximo {n} {days}',
        presetBeforeEarliest: 'Comienza antes de la primera fecha seleccionable ({date})',
        presetAfterLatest: 'Termina después de la última fecha seleccionable ({date})',
        presetTooShort: 'Inferior al mínimo de {n} día(s)',
        presetTooLong: 'Supera el máximo de {n} día(s)'
    },
    nl: {
        startTime: 'Begintijd', endTime: 'Eindtijd',
        startDate: 'Begin', endDate: 'Einde',
        clear: 'Wissen',
        selectRange: 'Selecteer een periode', invalidRange: 'Ongeldige periode', sameDay: 'Zelfde dag',
        previousMonth: 'Vorige maand', nextMonth: 'Volgende maand',
        dayOne: 'dag', dayMany: 'dagen',
        durationDays: '{n} {days}',
        hintRange: 'Kies een periode van {min} tot {max} dagen',
        hintMin: 'Kies een periode van minstens {n} {days}',
        hintMax: 'Kies een periode van hoogstens {n} {days}',
        beforeEarliest: 'Vóór de vroegste selecteerbare datum ({date})',
        afterLatest: 'Na de laatste selecteerbare datum ({date})',
        rangeAtLeast: 'De periode moet minstens {n} {days} duren',
        rangeAtMost: 'De periode mag hoogstens {n} {days} duren',
        presetBeforeEarliest: 'Begint vóór de vroegste selecteerbare datum ({date})',
        presetAfterLatest: 'Eindigt na de laatste selecteerbare datum ({date})',
        presetTooShort: 'Korter dan het minimum van {n} dag(en)',
        presetTooLong: 'Langer dan het maximum van {n} dag(en)'
    },
    it: {
        startTime: 'Ora di inizio', endTime: 'Ora di fine',
        startDate: 'Inizio', endDate: 'Fine',
        clear: 'Cancella',
        selectRange: 'Seleziona un intervallo', invalidRange: 'Intervallo non valido', sameDay: 'Stesso giorno',
        previousMonth: 'Mese precedente', nextMonth: 'Mese successivo',
        dayOne: 'giorno', dayMany: 'giorni',
        durationDays: '{n} {days}',
        hintRange: 'Scegli un intervallo di {min}–{max} giorni',
        hintMin: 'Scegli un intervallo di almeno {n} {days}',
        hintMax: 'Scegli un intervallo di massimo {n} {days}',
        beforeEarliest: 'Prima della prima data selezionabile ({date})',
        afterLatest: "Dopo l'ultima data selezionabile ({date})",
        rangeAtLeast: "L'intervallo deve essere di almeno {n} {days}",
        rangeAtMost: "L'intervallo può essere al massimo di {n} {days}",
        presetBeforeEarliest: 'Inizia prima della prima data selezionabile ({date})',
        presetAfterLatest: "Termina dopo l'ultima data selezionabile ({date})",
        presetTooShort: 'Inferiore al minimo di {n} giorno/i',
        presetTooLong: 'Supera il massimo di {n} giorno/i'
    },
    pt: {
        startTime: 'Hora de início', endTime: 'Hora de fim',
        startDate: 'Início', endDate: 'Fim',
        clear: 'Limpar',
        selectRange: 'Selecione um intervalo', invalidRange: 'Intervalo inválido', sameDay: 'Mesmo dia',
        previousMonth: 'Mês anterior', nextMonth: 'Mês seguinte',
        dayOne: 'dia', dayMany: 'dias',
        durationDays: '{n} {days}',
        hintRange: 'Escolha um intervalo de {min} a {max} dias',
        hintMin: 'Escolha um intervalo de pelo menos {n} {days}',
        hintMax: 'Escolha um intervalo de no máximo {n} {days}',
        beforeEarliest: 'Antes da primeira data selecionável ({date})',
        afterLatest: 'Depois da última data selecionável ({date})',
        rangeAtLeast: 'O intervalo deve ter pelo menos {n} {days}',
        rangeAtMost: 'O intervalo pode ter no máximo {n} {days}',
        presetBeforeEarliest: 'Começa antes da primeira data selecionável ({date})',
        presetAfterLatest: 'Termina depois da última data selecionável ({date})',
        presetTooShort: 'Inferior ao mínimo de {n} dia(s)',
        presetTooLong: 'Excede o máximo de {n} dia(s)'
    }
};

/** The calendar's default label set for a locale (English when not bundled). */
export function calendarLabelBase(locale: string): CalLabels {
    return CALENDAR_PACKS[primaryLang(locale)] || EN_CALENDAR_LABELS;
}

/** The picker's default label set for a locale (English when not bundled). */
export function pickerLabelBase(locale: string): LabelConfig {
    return PICKER_PACKS[primaryLang(locale)] || EN_PICKER_LABELS;
}
