// Built-in UI-text pack for the Roster Manager (admin family). `config.locale`
// picks the default language (primary subtag, English fallback);
// `config.labels.*` overrides any single key. Re-exported through
// shared/labelPacks.ts.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; the
// per-key overrides exist so deployments can correct or rebrand them.

import { primaryLang } from './common';
import { CommitLabels, commitLabelBase } from './commit';
import { RowMenuLabels, rowMenuLabelBase } from './rowmenu';

export interface RosterManagerLabels extends CommitLabels, RowMenuLabels {
    listHeader: string;      // roster list rail heading
    noRosters: string;       // empty-list placeholder
    noSelection: string;     // detail placeholder when nothing is selected
    newRoster: string;       // create button
    name: string;            // name input placeholder (create flow)
    nameRequired: string;    // validation: empty name
    nameTaken: string;       // validation: duplicate name
    addUser: string;         // opens the directory picker
    searchUsers: string;     // picker search placeholder
    noMatches: string;       // picker empty state
    emptyRoster: string;     // detail hint when the roster has no users
    removeUser: string;      // per-row remove tooltip
    noContact: string;       // per-row warning: user has no contact info
    contactN: string;        // row ordinal template ({n} substituted)
    dragToReorder: string;   // drag-handle tooltip
    delete: string;          // delete-roster button
    confirmDelete: string;   // second-step delete confirmation
    unknownUser: string;     // row badge: username not in data.availableUsers
}

type OwnLabels = Omit<RosterManagerLabels, keyof CommitLabels | keyof RowMenuLabels>;

const PACKS: { [lang: string]: OwnLabels } = {
    en: {
        listHeader: 'Rosters', noRosters: 'No rosters', noSelection: 'Select a roster',
        newRoster: 'New roster', name: 'Name', nameRequired: 'Name required', nameTaken: 'Name already in use',
        addUser: 'Add user', searchUsers: 'Search users…', noMatches: 'No matching users',
        emptyRoster: 'No users — pipelines using this roster notify no one',
        removeUser: 'Remove', noContact: 'No contact info', contactN: 'Contact {n}',
        dragToReorder: 'Drag to reorder', delete: 'Delete', confirmDelete: 'Confirm delete?',
        unknownUser: 'Unknown user'
    },
    fr: {
        listHeader: 'Listes d’appel', noRosters: 'Aucune liste', noSelection: 'Sélectionnez une liste',
        newRoster: 'Nouvelle liste', name: 'Nom', nameRequired: 'Nom requis', nameTaken: 'Nom déjà utilisé',
        addUser: 'Ajouter un utilisateur', searchUsers: 'Rechercher…', noMatches: 'Aucun utilisateur trouvé',
        emptyRoster: 'Aucun utilisateur — les pipelines utilisant cette liste ne notifient personne',
        removeUser: 'Retirer', noContact: 'Aucune coordonnée', contactN: 'Contact {n}',
        dragToReorder: 'Glisser pour réordonner', delete: 'Supprimer', confirmDelete: 'Confirmer la suppression ?',
        unknownUser: 'Utilisateur inconnu'
    },
    de: {
        listHeader: 'Bereitschaftslisten', noRosters: 'Keine Listen', noSelection: 'Liste auswählen',
        newRoster: 'Neue Liste', name: 'Name', nameRequired: 'Name erforderlich', nameTaken: 'Name bereits vergeben',
        addUser: 'Benutzer hinzufügen', searchUsers: 'Benutzer suchen…', noMatches: 'Keine Treffer',
        emptyRoster: 'Keine Benutzer — Pipelines mit dieser Liste benachrichtigen niemanden',
        removeUser: 'Entfernen', noContact: 'Keine Kontaktdaten', contactN: 'Kontakt {n}',
        dragToReorder: 'Ziehen zum Umordnen', delete: 'Löschen', confirmDelete: 'Löschen bestätigen?',
        unknownUser: 'Unbekannter Benutzer'
    },
    es: {
        listHeader: 'Listas de guardia', noRosters: 'Sin listas', noSelection: 'Seleccione una lista',
        newRoster: 'Nueva lista', name: 'Nombre', nameRequired: 'Nombre obligatorio', nameTaken: 'Nombre ya en uso',
        addUser: 'Añadir usuario', searchUsers: 'Buscar usuarios…', noMatches: 'Sin coincidencias',
        emptyRoster: 'Sin usuarios — las canalizaciones que usan esta lista no notifican a nadie',
        removeUser: 'Quitar', noContact: 'Sin datos de contacto', contactN: 'Contacto {n}',
        dragToReorder: 'Arrastrar para reordenar', delete: 'Eliminar', confirmDelete: '¿Confirmar eliminación?',
        unknownUser: 'Usuario desconocido'
    },
    nl: {
        listHeader: 'Oproeplijsten', noRosters: 'Geen lijsten', noSelection: 'Selecteer een lijst',
        newRoster: 'Nieuwe lijst', name: 'Naam', nameRequired: 'Naam vereist', nameTaken: 'Naam al in gebruik',
        addUser: 'Gebruiker toevoegen', searchUsers: 'Gebruikers zoeken…', noMatches: 'Geen resultaten',
        emptyRoster: 'Geen gebruikers — pipelines met deze lijst melden aan niemand',
        removeUser: 'Verwijderen', noContact: 'Geen contactgegevens', contactN: 'Contact {n}',
        dragToReorder: 'Sleep om te herordenen', delete: 'Verwijderen', confirmDelete: 'Verwijderen bevestigen?',
        unknownUser: 'Onbekende gebruiker'
    },
    it: {
        listHeader: 'Turni di reperibilità', noRosters: 'Nessuna lista', noSelection: 'Seleziona una lista',
        newRoster: 'Nuova lista', name: 'Nome', nameRequired: 'Nome obbligatorio', nameTaken: 'Nome già in uso',
        addUser: 'Aggiungi utente', searchUsers: 'Cerca utenti…', noMatches: 'Nessun utente trovato',
        emptyRoster: 'Nessun utente — le pipeline che usano questa lista non notificano nessuno',
        removeUser: 'Rimuovi', noContact: 'Nessun contatto', contactN: 'Contatto {n}',
        dragToReorder: 'Trascina per riordinare', delete: 'Elimina', confirmDelete: 'Confermare l’eliminazione?',
        unknownUser: 'Utente sconosciuto'
    },
    pt: {
        listHeader: 'Escalas de plantão', noRosters: 'Sem escalas', noSelection: 'Selecione uma escala',
        newRoster: 'Nova escala', name: 'Nome', nameRequired: 'Nome obrigatório', nameTaken: 'Nome já em uso',
        addUser: 'Adicionar usuário', searchUsers: 'Buscar usuários…', noMatches: 'Nenhum usuário encontrado',
        emptyRoster: 'Sem usuários — pipelines que usam esta escala não notificam ninguém',
        removeUser: 'Remover', noContact: 'Sem dados de contato', contactN: 'Contato {n}',
        dragToReorder: 'Arraste para reordenar', delete: 'Excluir', confirmDelete: 'Confirmar exclusão?',
        unknownUser: 'Usuário desconhecido'
    }
};

/** The Roster Manager's default label set for a locale (English when not
 *  bundled) — the shared commit strings (Save / Discard / unsaved) merged in. */
export function rosterLabelBase(locale: string): RosterManagerLabels {
    return { ...commitLabelBase(locale), ...rowMenuLabelBase(locale), ...(PACKS[primaryLang(locale)] || PACKS.en) };
}

export const EN_ROSTER_LABELS: RosterManagerLabels = rosterLabelBase('en');
