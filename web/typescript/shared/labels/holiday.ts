// Built-in UI-text pack for the Holiday Manager (admin family). `config.locale`
// picks the default language (primary subtag, English fallback);
// `config.labels.*` overrides any single key. Re-exported through
// shared/labelPacks.ts.

import { primaryLang } from './common';
import { CommitLabels, commitLabelBase } from './commit';
import { RowMenuLabels, rowMenuLabelBase } from './rowmenu';

export interface HolidayManagerLabels extends CommitLabels, RowMenuLabels {
    listHeader: string;     // holiday list rail heading
    noHolidays: string;     // empty-list placeholder
    noSelection: string;    // detail placeholder
    newHoliday: string;     // create button
    name: string;           // name input placeholder
    nameRequired: string;   // validation
    nameTaken: string;      // validation
    date: string;           // date input label
    dateInvalid: string;    // validation: unparseable/missing date
    repeatAnnually: string; // repeat toggle
    repeats: string;        // rail badge: repeats annually
    past: string;           // rail badge: non-repeating and already passed
    nextOn: string;         // detail line template ({date} substituted)
    neverAgain: string;     // detail line for past non-repeating holidays
    observedBy: string;     // hint: which schedules care ({n} substituted)
    delete: string;
    confirmDelete: string;
}

type OwnLabels = Omit<HolidayManagerLabels, keyof CommitLabels | keyof RowMenuLabels>;

const PACKS: { [lang: string]: OwnLabels } = {
    en: {
        listHeader: 'Holidays', noHolidays: 'No holidays', noSelection: 'Select a holiday',
        newHoliday: 'New holiday', name: 'Name', nameRequired: 'Name required', nameTaken: 'Name already in use',
        date: 'Date', dateInvalid: 'Valid date required', repeatAnnually: 'Repeats annually',
        repeats: 'annual', past: 'past', nextOn: 'Next observed: {date}', neverAgain: 'Will not occur again',
        observedBy: 'Observed by schedules with "Observes holidays" enabled',
        delete: 'Delete', confirmDelete: 'Confirm delete?'
    },
    fr: {
        listHeader: 'Jours fériés', noHolidays: 'Aucun jour férié', noSelection: 'Sélectionnez un jour férié',
        newHoliday: 'Nouveau jour férié', name: 'Nom', nameRequired: 'Nom requis', nameTaken: 'Nom déjà utilisé',
        date: 'Date', dateInvalid: 'Date valide requise', repeatAnnually: 'Se répète chaque année',
        repeats: 'annuel', past: 'passé', nextOn: 'Prochaine observation : {date}', neverAgain: 'Ne se reproduira plus',
        observedBy: 'Observé par les horaires avec « Respecte les jours fériés » activé',
        delete: 'Supprimer', confirmDelete: 'Confirmer la suppression ?'
    },
    de: {
        listHeader: 'Feiertage', noHolidays: 'Keine Feiertage', noSelection: 'Feiertag auswählen',
        newHoliday: 'Neuer Feiertag', name: 'Name', nameRequired: 'Name erforderlich', nameTaken: 'Name bereits vergeben',
        date: 'Datum', dateInvalid: 'Gültiges Datum erforderlich', repeatAnnually: 'Wiederholt sich jährlich',
        repeats: 'jährlich', past: 'vergangen', nextOn: 'Nächste Beobachtung: {date}', neverAgain: 'Tritt nicht mehr auf',
        observedBy: 'Beachtet von Zeitplänen mit aktivierter Feiertagsoption',
        delete: 'Löschen', confirmDelete: 'Löschen bestätigen?'
    },
    es: {
        listHeader: 'Festivos', noHolidays: 'Sin festivos', noSelection: 'Seleccione un festivo',
        newHoliday: 'Nuevo festivo', name: 'Nombre', nameRequired: 'Nombre obligatorio', nameTaken: 'Nombre ya en uso',
        date: 'Fecha', dateInvalid: 'Se requiere una fecha válida', repeatAnnually: 'Se repite anualmente',
        repeats: 'anual', past: 'pasado', nextOn: 'Próxima observación: {date}', neverAgain: 'No volverá a ocurrir',
        observedBy: 'Observado por horarios con «Respeta los festivos» activado',
        delete: 'Eliminar', confirmDelete: '¿Confirmar eliminación?'
    },
    nl: {
        listHeader: 'Feestdagen', noHolidays: 'Geen feestdagen', noSelection: 'Selecteer een feestdag',
        newHoliday: 'Nieuwe feestdag', name: 'Naam', nameRequired: 'Naam vereist', nameTaken: 'Naam al in gebruik',
        date: 'Datum', dateInvalid: 'Geldige datum vereist', repeatAnnually: 'Herhaalt jaarlijks',
        repeats: 'jaarlijks', past: 'voorbij', nextOn: 'Volgende keer: {date}', neverAgain: 'Komt niet meer voor',
        observedBy: 'Gevolgd door roosters met "Volgt feestdagen" aan',
        delete: 'Verwijderen', confirmDelete: 'Verwijderen bevestigen?'
    },
    it: {
        listHeader: 'Festività', noHolidays: 'Nessuna festività', noSelection: 'Seleziona una festività',
        newHoliday: 'Nuova festività', name: 'Nome', nameRequired: 'Nome obbligatorio', nameTaken: 'Nome già in uso',
        date: 'Data', dateInvalid: 'Data valida obbligatoria', repeatAnnually: 'Si ripete ogni anno',
        repeats: 'annuale', past: 'passata', nextOn: 'Prossima osservazione: {date}', neverAgain: 'Non si ripeterà',
        observedBy: 'Osservata dagli orari con «Osserva le festività» attivo',
        delete: 'Elimina', confirmDelete: 'Confermare l’eliminazione?'
    },
    pt: {
        listHeader: 'Feriados', noHolidays: 'Sem feriados', noSelection: 'Selecione um feriado',
        newHoliday: 'Novo feriado', name: 'Nome', nameRequired: 'Nome obrigatório', nameTaken: 'Nome já em uso',
        date: 'Data', dateInvalid: 'Data válida obrigatória', repeatAnnually: 'Repete anualmente',
        repeats: 'anual', past: 'passado', nextOn: 'Próxima observação: {date}', neverAgain: 'Não ocorrerá novamente',
        observedBy: 'Observado por horários com "Observa feriados" ativado',
        delete: 'Excluir', confirmDelete: 'Confirmar exclusão?'
    }
};

/** The Holiday Manager's default label set for a locale (English when not
 *  bundled) — the shared commit strings (Save / Discard / unsaved) merged in. */
export function holidayLabelBase(locale: string): HolidayManagerLabels {
    return { ...commitLabelBase(locale), ...rowMenuLabelBase(locale), ...(PACKS[primaryLang(locale)] || PACKS.en) };
}

export const EN_HOLIDAY_LABELS: HolidayManagerLabels = holidayLabelBase('en');
