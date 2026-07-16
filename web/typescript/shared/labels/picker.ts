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
    dialogLabel: string;           // accessible name of the popover dialog panel
}

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
    presetTooLong: 'Exceeds the {n}-day maximum',
    dialogLabel: 'Choose date range'
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
        presetTooLong: 'Dépasse le maximum de {n} jour(s)',
        dialogLabel: 'Choisissez une plage de dates'
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
        presetTooLong: 'Überschreitet das Maximum von {n} Tag(en)',
        dialogLabel: 'Zeitraum auswählen'
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
        presetTooLong: 'Supera el máximo de {n} día(s)',
        dialogLabel: 'Elija un rango de fechas'
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
        presetTooLong: 'Langer dan het maximum van {n} dag(en)',
        dialogLabel: 'Kies een periode'
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
        presetTooLong: 'Supera il massimo di {n} giorno/i',
        dialogLabel: 'Scegli un intervallo di date'
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
        presetTooLong: 'Excede o máximo de {n} dia(s)',
        dialogLabel: 'Escolha um intervalo de datas'
    }
};

/** The picker's default label set for a locale (English when not bundled). */
export function pickerLabelBase(locale: string): LabelConfig {
    return PICKER_PACKS[primaryLang(locale)] || EN_PICKER_LABELS;
}
