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

/** The resource timeline's overridable UI text. */
export interface TimelineLabels {
    today: string;
    followNow: string;                // toolbar live-follow toggle ('Live')
    previous: string; next: string;   // nav arrows (accessible labels)
    zoomHour: string; zoomDay: string; zoomShift: string; zoomWeek: string;   // zoom-preset buttons
    noResources: string;              // empty text when config.resources is empty
    noEvents: string;                 // localized empty-badge text (the emptyMessage default follows it)
    // hover popover status badge (event.status)
    statusTentative: string; statusCancelled: string; statusDone: string;
    // empty-state badge tooltip (ResourceTimeline.emptyHint)
    emptyHintIntro: string;
    emptyHintCreate: string;
    emptyHintBind: string;
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
    // recurrence rule editing (same controls as the calendar's editor)
    repeat: string; doesNotRepeat: string;
    daily: string; weekly: string; monthly: string; yearly: string;
    every: string;
    unitDays: string; unitWeeks: string; unitMonths: string; unitYears: string;
    ends: string; never: string; on: string; after: string; times: string;
    category: string; none: string; notes: string;
    save: string; create: string; cancel: string; delete: string;
}

export const EN_TIMELINE_LABELS: TimelineLabels = {
    today: 'Today',
    followNow: 'Live',
    previous: 'Previous', next: 'Next',
    zoomHour: 'Hour', zoomDay: 'Day', zoomShift: 'Shift', zoomWeek: 'Week',
    noResources: 'No resources',
    statusTentative: 'Tentative', statusCancelled: 'Cancelled', statusDone: 'Done',
    noEvents: 'No events',
    emptyHintIntro: 'This timeline shows the events in its data, one row per resource.',
    emptyHintCreate: 'Add an event: drag over an empty span on a resource row.',
    emptyHintBind: 'Events come from the data binding — enable "selectable" + "builtInEditor" to add them here.',
    exportCsv: 'Export events to CSV',
    previousMonth: 'Previous month', nextMonth: 'Next month',
    newEvent: 'New event', editEvent: 'Edit event',
    thisEvent: 'This event', allEvents: 'All events',
    title: 'Title', eventTitle: 'Event title',
    resource: 'Resource',
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

const TIMELINE_PACKS: { [lang: string]: TimelineLabels } = {
    fr: {
        today: "Aujourd'hui",
        followNow: 'En direct',
        previous: 'Précédent', next: 'Suivant',
        zoomHour: 'Heure', zoomDay: 'Jour', zoomShift: 'Poste', zoomWeek: 'Semaine',
        noResources: 'Aucune ressource',
        statusTentative: 'Provisoire', statusCancelled: 'Annulé', statusDone: 'Terminé',
        noEvents: 'Aucun événement',
        emptyHintIntro: 'Cette timeline affiche les événements de ses données, une ligne par ressource.',
        emptyHintCreate: "Ajouter un événement : faites glisser sur une plage vide d'une ligne de ressource.",
        emptyHintBind: 'Les événements proviennent de la liaison de données — activez « selectable » + « builtInEditor » pour les ajouter ici.',
        exportCsv: 'Exporter les événements en CSV',
        previousMonth: 'Mois précédent', nextMonth: 'Mois suivant',
        newEvent: 'Nouvel événement', editEvent: "Modifier l'événement",
        thisEvent: 'Cet événement', allEvents: 'Tous les événements',
        title: 'Titre', eventTitle: "Titre de l'événement",
        resource: 'Ressource',
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
        today: 'Heute',
        followNow: 'Live',
        previous: 'Zurück', next: 'Weiter',
        zoomHour: 'Stunde', zoomDay: 'Tag', zoomShift: 'Schicht', zoomWeek: 'Woche',
        noResources: 'Keine Ressourcen',
        statusTentative: 'Vorläufig', statusCancelled: 'Abgesagt', statusDone: 'Erledigt',
        noEvents: 'Keine Ereignisse',
        emptyHintIntro: 'Diese Timeline zeigt die Ereignisse ihrer Daten, eine Zeile pro Ressource.',
        emptyHintCreate: 'Ereignis hinzufügen: über einen leeren Bereich einer Ressourcenzeile ziehen.',
        emptyHintBind: 'Ereignisse kommen aus der Datenanbindung — aktivieren Sie „selectable“ + „builtInEditor“, um sie hier anzulegen.',
        exportCsv: 'Ereignisse als CSV exportieren',
        previousMonth: 'Vorheriger Monat', nextMonth: 'Nächster Monat',
        newEvent: 'Neues Ereignis', editEvent: 'Ereignis bearbeiten',
        thisEvent: 'Dieses Ereignis', allEvents: 'Alle Ereignisse',
        title: 'Titel', eventTitle: 'Ereignistitel',
        resource: 'Ressource',
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
        today: 'Hoy',
        followNow: 'En vivo',
        previous: 'Anterior', next: 'Siguiente',
        zoomHour: 'Hora', zoomDay: 'Día', zoomShift: 'Turno', zoomWeek: 'Semana',
        noResources: 'Sin recursos',
        statusTentative: 'Provisional', statusCancelled: 'Cancelado', statusDone: 'Completado',
        noEvents: 'Sin eventos',
        emptyHintIntro: 'Esta línea de tiempo muestra los eventos de sus datos, una fila por recurso.',
        emptyHintCreate: 'Añadir un evento: arrastre sobre un tramo vacío de una fila de recurso.',
        emptyHintBind: 'Los eventos provienen del enlace de datos — active «selectable» + «builtInEditor» para añadirlos aquí.',
        exportCsv: 'Exportar eventos a CSV',
        previousMonth: 'Mes anterior', nextMonth: 'Mes siguiente',
        newEvent: 'Nuevo evento', editEvent: 'Editar evento',
        thisEvent: 'Este evento', allEvents: 'Todos los eventos',
        title: 'Título', eventTitle: 'Título del evento',
        resource: 'Recurso',
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
        today: 'Vandaag',
        followNow: 'Live',
        previous: 'Vorige', next: 'Volgende',
        zoomHour: 'Uur', zoomDay: 'Dag', zoomShift: 'Ploeg', zoomWeek: 'Week',
        noResources: 'Geen resources',
        statusTentative: 'Voorlopig', statusCancelled: 'Geannuleerd', statusDone: 'Afgerond',
        noEvents: 'Geen evenementen',
        emptyHintIntro: 'Deze tijdlijn toont de evenementen uit zijn data, één rij per resource.',
        emptyHintCreate: 'Evenement toevoegen: sleep over een leeg stuk van een resource-rij.',
        emptyHintBind: 'Evenementen komen uit de databinding — zet "selectable" + "builtInEditor" aan om ze hier toe te voegen.',
        exportCsv: 'Evenementen exporteren als CSV',
        previousMonth: 'Vorige maand', nextMonth: 'Volgende maand',
        newEvent: 'Nieuw evenement', editEvent: 'Evenement bewerken',
        thisEvent: 'Dit evenement', allEvents: 'Alle evenementen',
        title: 'Titel', eventTitle: 'Titel van het evenement',
        resource: 'Resource',
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
        today: 'Oggi',
        followNow: 'In diretta',
        previous: 'Precedente', next: 'Successivo',
        zoomHour: 'Ora', zoomDay: 'Giorno', zoomShift: 'Turno', zoomWeek: 'Settimana',
        noResources: 'Nessuna risorsa',
        statusTentative: 'Provvisorio', statusCancelled: 'Annullato', statusDone: 'Completato',
        noEvents: 'Nessun evento',
        emptyHintIntro: 'Questa timeline mostra gli eventi dei suoi dati, una riga per risorsa.',
        emptyHintCreate: 'Aggiungi un evento: trascina su un tratto vuoto di una riga risorsa.',
        emptyHintBind: 'Gli eventi provengono dal binding dei dati — attiva "selectable" + "builtInEditor" per aggiungerli qui.',
        exportCsv: 'Esporta eventi in CSV',
        previousMonth: 'Mese precedente', nextMonth: 'Mese successivo',
        newEvent: 'Nuovo evento', editEvent: 'Modifica evento',
        thisEvent: 'Questo evento', allEvents: 'Tutti gli eventi',
        title: 'Titolo', eventTitle: "Titolo dell'evento",
        resource: 'Risorsa',
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
        today: 'Hoje',
        followNow: 'Ao vivo',
        previous: 'Anterior', next: 'Seguinte',
        zoomHour: 'Hora', zoomDay: 'Dia', zoomShift: 'Turno', zoomWeek: 'Semana',
        noResources: 'Sem recursos',
        statusTentative: 'Provisório', statusCancelled: 'Cancelado', statusDone: 'Concluído',
        noEvents: 'Sem eventos',
        emptyHintIntro: 'Esta linha do tempo mostra os eventos dos seus dados, uma linha por recurso.',
        emptyHintCreate: 'Adicionar um evento: arraste sobre um trecho vazio de uma linha de recurso.',
        emptyHintBind: 'Os eventos vêm da ligação de dados — ative "selectable" + "builtInEditor" para os adicionar aqui.',
        exportCsv: 'Exportar eventos para CSV',
        previousMonth: 'Mês anterior', nextMonth: 'Mês seguinte',
        newEvent: 'Novo evento', editEvent: 'Editar evento',
        thisEvent: 'Este evento', allEvents: 'Todos os eventos',
        title: 'Título', eventTitle: 'Título do evento',
        resource: 'Recurso',
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

/** The timeline's default label set for a locale (English when not bundled). */
export function timelineLabelBase(locale: string): TimelineLabels {
    return TIMELINE_PACKS[primaryLang(locale)] || EN_TIMELINE_LABELS;
}
