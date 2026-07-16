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

// --- data grid ------------------------------------------------------------------

export interface GridLabels {
    noRows: string;                   // localized empty-badge text (the emptyMessage default follows it)
    search: string;                   // quick-filter input placeholder
    exportCsv: string;                // export button tooltip / accessible label
    selected: string;                 // selection-count badge, '{n}' = how many
    columns: string;                  // column-chooser button tooltip / accessible label
    addRow: string;                   // toolbar add-row button
    deleteRows: string;               // toolbar delete button, '{n}' = selected count
    errRequired: string;              // cell validation messages
    errNumber: string;
    errMin: string;                   // '{min}'
    errMax: string;                   // '{max}'
    errPattern: string;
    errOption: string;
    unsaved: string;                  // batch mode: dirty badge, '{n}' = count
    save: string;                     // batch mode: save button
    discard: string;                  // batch mode: discard button tooltip
}

export const EN_GRID_LABELS: GridLabels = {
    noRows: 'No rows',
    search: 'Search',
    exportCsv: 'Export rows to CSV',
    selected: '{n} selected',
    columns: 'Columns',
    addRow: 'Add row',
    deleteRows: 'Delete {n} row(s)',
    errRequired: 'A value is required',
    errNumber: 'Must be a number',
    errMin: 'Must be at least {min}',
    errMax: 'Must be at most {max}',
    errPattern: 'Does not match the required format',
    errOption: 'Pick one of the list options',
    unsaved: '{n} unsaved',
    save: 'Save',
    discard: 'Discard changes',
};

const GRID_PACKS: { [lang: string]: GridLabels } = {
    fr: { noRows: 'Aucune ligne', search: 'Rechercher', exportCsv: 'Exporter les lignes en CSV', selected: '{n} sélectionnée(s)', columns: 'Colonnes', addRow: 'Ajouter une ligne', deleteRows: 'Supprimer {n} ligne(s)', errRequired: 'Une valeur est requise', errNumber: 'Doit être un nombre', errMin: 'Doit être au moins {min}', errMax: 'Doit être au plus {max}', errPattern: 'Ne correspond pas au format requis', errOption: 'Choisissez une option de la liste', unsaved: '{n} non enregistrée(s)', save: 'Enregistrer', discard: 'Annuler les modifications' },
    de: { noRows: 'Keine Zeilen', search: 'Suchen', exportCsv: 'Zeilen als CSV exportieren', selected: '{n} ausgewählt', columns: 'Spalten', addRow: 'Zeile hinzufügen', deleteRows: '{n} Zeile(n) löschen', errRequired: 'Ein Wert ist erforderlich', errNumber: 'Muss eine Zahl sein', errMin: 'Muss mindestens {min} sein', errMax: 'Darf höchstens {max} sein', errPattern: 'Entspricht nicht dem geforderten Format', errOption: 'Wählen Sie eine Option aus der Liste', unsaved: '{n} ungespeichert', save: 'Speichern', discard: 'Änderungen verwerfen' },
    es: { noRows: 'Sin filas', search: 'Buscar', exportCsv: 'Exportar filas a CSV', selected: '{n} seleccionada(s)', columns: 'Columnas', addRow: 'Añadir fila', deleteRows: 'Eliminar {n} fila(s)', errRequired: 'Se requiere un valor', errNumber: 'Debe ser un número', errMin: 'Debe ser al menos {min}', errMax: 'Debe ser como máximo {max}', errPattern: 'No coincide con el formato requerido', errOption: 'Elija una opción de la lista', unsaved: '{n} sin guardar', save: 'Guardar', discard: 'Descartar cambios' },
    nl: { noRows: 'Geen rijen', search: 'Zoeken', exportCsv: 'Rijen exporteren naar CSV', selected: '{n} geselecteerd', columns: 'Kolommen', addRow: 'Rij toevoegen', deleteRows: '{n} rij(en) verwijderen', errRequired: 'Een waarde is vereist', errNumber: 'Moet een getal zijn', errMin: 'Moet minstens {min} zijn', errMax: 'Mag hoogstens {max} zijn', errPattern: 'Voldoet niet aan het vereiste formaat', errOption: 'Kies een optie uit de lijst', unsaved: '{n} niet opgeslagen', save: 'Opslaan', discard: 'Wijzigingen verwerpen' },
    it: { noRows: 'Nessuna riga', search: 'Cerca', exportCsv: 'Esporta righe in CSV', selected: '{n} selezionate', columns: 'Colonne', addRow: 'Aggiungi riga', deleteRows: 'Elimina {n} riga/e', errRequired: 'È richiesto un valore', errNumber: 'Deve essere un numero', errMin: 'Deve essere almeno {min}', errMax: 'Deve essere al massimo {max}', errPattern: 'Non corrisponde al formato richiesto', errOption: "Scegli un'opzione dall'elenco", unsaved: '{n} non salvate', save: 'Salva', discard: 'Annulla le modifiche' },
    pt: { noRows: 'Sem linhas', search: 'Pesquisar', exportCsv: 'Exportar linhas para CSV', selected: '{n} selecionada(s)', columns: 'Colunas', addRow: 'Adicionar linha', deleteRows: 'Excluir {n} linha(s)', errRequired: 'Um valor é obrigatório', errNumber: 'Deve ser um número', errMin: 'Deve ser pelo menos {min}', errMax: 'Deve ser no máximo {max}', errPattern: 'Não corresponde ao formato exigido', errOption: 'Escolha uma opção da lista', unsaved: '{n} não salva(s)', save: 'Salvar', discard: 'Descartar alterações' },
};

/** The grid label pack for a locale (primary subtag; unknown -> English). */
export function gridLabelBase(locale: string): GridLabels {
    return GRID_PACKS[primaryLang(locale)] || EN_GRID_LABELS;
}
