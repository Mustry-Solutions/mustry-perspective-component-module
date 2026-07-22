// Built-in UI-text pack for the User Manager (admin family). `config.locale`
// picks the default language (primary subtag, English fallback);
// `config.labels.*` overrides any single key. Re-exported through
// shared/labelPacks.ts.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; the
// per-key overrides exist so deployments can correct or rebrand them.

import { primaryLang } from './common';
import { CommitLabels, commitLabelBase } from './commit';

export interface UserManagerLabels extends CommitLabels {
    listHeader: string;        // user list rail heading
    filterPlaceholder: string; // rail filter input
    noUsers: string;           // empty-list placeholder
    noSelection: string;       // detail placeholder
    newUser: string;           // create button
    username: string;          // username input (create flow)
    usernameRequired: string;  // validation
    usernameTaken: string;     // validation
    firstName: string;
    lastName: string;
    schedule: string;
    language: string;
    notes: string;
    roles: string;             // roles section heading
    noRoles: string;           // no roles defined on the source
    contact: string;           // contact section heading
    addContact: string;        // add-contact-row button
    removeContact: string;     // per-row remove tooltip
    password: string;          // password input label/placeholder
    passwordPending: string;   // hint while a password is staged
    delete: string;
    confirmDelete: string;
}

type OwnLabels = Omit<UserManagerLabels, keyof CommitLabels>;

const PACKS: { [lang: string]: OwnLabels } = {
    en: {
        listHeader: 'Users', filterPlaceholder: 'Filter users…', noUsers: 'No users',
        noSelection: 'Select a user', newUser: 'New user', username: 'Username',
        usernameRequired: 'Username required', usernameTaken: 'Username already in use',
        firstName: 'First name', lastName: 'Last name', schedule: 'Schedule', language: 'Language',
        notes: 'Notes', roles: 'Roles', noRoles: 'No roles defined', contact: 'Contact info',
        addContact: 'Add contact', removeContact: 'Remove', password: 'New password',
        passwordPending: 'Password will be set on Save', delete: 'Delete', confirmDelete: 'Confirm delete?'
    },
    fr: {
        listHeader: 'Utilisateurs', filterPlaceholder: 'Filtrer…', noUsers: 'Aucun utilisateur',
        noSelection: 'Sélectionnez un utilisateur', newUser: 'Nouvel utilisateur', username: 'Nom d’utilisateur',
        usernameRequired: 'Nom d’utilisateur requis', usernameTaken: 'Nom déjà utilisé',
        firstName: 'Prénom', lastName: 'Nom', schedule: 'Horaire', language: 'Langue',
        notes: 'Notes', roles: 'Rôles', noRoles: 'Aucun rôle défini', contact: 'Coordonnées',
        addContact: 'Ajouter un contact', removeContact: 'Retirer', password: 'Nouveau mot de passe',
        passwordPending: 'Le mot de passe sera défini à l’enregistrement', delete: 'Supprimer', confirmDelete: 'Confirmer la suppression ?'
    },
    de: {
        listHeader: 'Benutzer', filterPlaceholder: 'Benutzer filtern…', noUsers: 'Keine Benutzer',
        noSelection: 'Benutzer auswählen', newUser: 'Neuer Benutzer', username: 'Benutzername',
        usernameRequired: 'Benutzername erforderlich', usernameTaken: 'Benutzername bereits vergeben',
        firstName: 'Vorname', lastName: 'Nachname', schedule: 'Zeitplan', language: 'Sprache',
        notes: 'Notizen', roles: 'Rollen', noRoles: 'Keine Rollen definiert', contact: 'Kontaktdaten',
        addContact: 'Kontakt hinzufügen', removeContact: 'Entfernen', password: 'Neues Passwort',
        passwordPending: 'Passwort wird beim Speichern gesetzt', delete: 'Löschen', confirmDelete: 'Löschen bestätigen?'
    },
    es: {
        listHeader: 'Usuarios', filterPlaceholder: 'Filtrar usuarios…', noUsers: 'Sin usuarios',
        noSelection: 'Seleccione un usuario', newUser: 'Nuevo usuario', username: 'Nombre de usuario',
        usernameRequired: 'Nombre de usuario obligatorio', usernameTaken: 'Nombre ya en uso',
        firstName: 'Nombre', lastName: 'Apellidos', schedule: 'Horario', language: 'Idioma',
        notes: 'Notas', roles: 'Roles', noRoles: 'Sin roles definidos', contact: 'Datos de contacto',
        addContact: 'Añadir contacto', removeContact: 'Quitar', password: 'Nueva contraseña',
        passwordPending: 'La contraseña se establecerá al guardar', delete: 'Eliminar', confirmDelete: '¿Confirmar eliminación?'
    },
    nl: {
        listHeader: 'Gebruikers', filterPlaceholder: 'Gebruikers filteren…', noUsers: 'Geen gebruikers',
        noSelection: 'Selecteer een gebruiker', newUser: 'Nieuwe gebruiker', username: 'Gebruikersnaam',
        usernameRequired: 'Gebruikersnaam vereist', usernameTaken: 'Gebruikersnaam al in gebruik',
        firstName: 'Voornaam', lastName: 'Achternaam', schedule: 'Rooster', language: 'Taal',
        notes: 'Notities', roles: 'Rollen', noRoles: 'Geen rollen gedefinieerd', contact: 'Contactgegevens',
        addContact: 'Contact toevoegen', removeContact: 'Verwijderen', password: 'Nieuw wachtwoord',
        passwordPending: 'Wachtwoord wordt ingesteld bij opslaan', delete: 'Verwijderen', confirmDelete: 'Verwijderen bevestigen?'
    },
    it: {
        listHeader: 'Utenti', filterPlaceholder: 'Filtra utenti…', noUsers: 'Nessun utente',
        noSelection: 'Seleziona un utente', newUser: 'Nuovo utente', username: 'Nome utente',
        usernameRequired: 'Nome utente obbligatorio', usernameTaken: 'Nome utente già in uso',
        firstName: 'Nome', lastName: 'Cognome', schedule: 'Orario', language: 'Lingua',
        notes: 'Note', roles: 'Ruoli', noRoles: 'Nessun ruolo definito', contact: 'Contatti',
        addContact: 'Aggiungi contatto', removeContact: 'Rimuovi', password: 'Nuova password',
        passwordPending: 'La password sarà impostata al salvataggio', delete: 'Elimina', confirmDelete: 'Confermare l’eliminazione?'
    },
    pt: {
        listHeader: 'Usuários', filterPlaceholder: 'Filtrar usuários…', noUsers: 'Sem usuários',
        noSelection: 'Selecione um usuário', newUser: 'Novo usuário', username: 'Nome de usuário',
        usernameRequired: 'Nome de usuário obrigatório', usernameTaken: 'Nome já em uso',
        firstName: 'Nome', lastName: 'Sobrenome', schedule: 'Horário', language: 'Idioma',
        notes: 'Notas', roles: 'Funções', noRoles: 'Nenhuma função definida', contact: 'Contato',
        addContact: 'Adicionar contato', removeContact: 'Remover', password: 'Nova senha',
        passwordPending: 'A senha será definida ao salvar', delete: 'Excluir', confirmDelete: 'Confirmar exclusão?'
    }
};

/** The User Manager's default label set for a locale (English when not
 *  bundled) — the shared commit strings (Save / Discard / unsaved) merged in. */
export function userLabelBase(locale: string): UserManagerLabels {
    return { ...commitLabelBase(locale), ...(PACKS[primaryLang(locale)] || PACKS.en) };
}

export const EN_USER_LABELS: UserManagerLabels = userLabelBase('en');
