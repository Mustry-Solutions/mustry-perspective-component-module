// Built-in UI-text pack for the User Manager (admin family). `config.locale`
// picks the default language (primary subtag, English fallback);
// `config.labels.*` overrides any single key. Re-exported through
// shared/labelPacks.ts.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; the
// per-key overrides exist so deployments can correct or rebrand them.

import { primaryLang } from './common';
import { CommitLabels, commitLabelBase } from './commit';
import { RowMenuLabels, rowMenuLabelBase } from './rowmenu';

export interface UserManagerLabels extends CommitLabels, RowMenuLabels {
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
    manageRoles: string;       // enters role-catalog manage mode
    doneManaging: string;      // leaves manage mode
    addRole: string;           // add-role button
    roleName: string;          // role name input placeholder
    roleRequired: string;      // validation: empty role name
    roleTaken: string;         // validation: duplicate role name
    renameRole: string;        // per-role rename tooltip
    deleteRole: string;        // per-role delete tooltip
    roleWarning: string;       // manage-mode hint: policies reference roles by name
    adjustments: string;       // availability-adjustments section heading
    addAdjustment: string;     // add-adjustment-row button
    adjStart: string;          // start instant label
    adjEnd: string;            // end instant label
    adjAvailable: string;      // available toggle (unchecked = time off)
    adjNote: string;           // note input placeholder
    adjInvalid: string;        // row validation message
    adjHint: string;           // section hint
}

type OwnLabels = Omit<UserManagerLabels, keyof CommitLabels | keyof RowMenuLabels>;

const PACKS: { [lang: string]: OwnLabels } = {
    en: {
        listHeader: 'Users', filterPlaceholder: 'Filter users…', noUsers: 'No users',
        noSelection: 'Select a user', newUser: 'New user', username: 'Username',
        usernameRequired: 'Username required', usernameTaken: 'Username already in use',
        firstName: 'First name', lastName: 'Last name', schedule: 'Schedule', language: 'Language',
        notes: 'Notes', roles: 'Roles', noRoles: 'No roles defined', contact: 'Contact info',
        addContact: 'Add contact', removeContact: 'Remove', password: 'New password',
        passwordPending: 'Password will be set on Save',
        adjustments: 'Availability adjustments', addAdjustment: 'Add adjustment', adjStart: 'From', adjEnd: 'Until',
        adjAvailable: 'Available', adjNote: 'Note', adjInvalid: 'Both instants required, end after start',
        adjHint: 'Overrides the schedule between the two instants — untick Available for time off (vacation), tick it for extra cover.',
        manageRoles: 'Manage roles', doneManaging: 'Done', addRole: 'Add role', roleName: 'Role name',
        roleRequired: 'Role name required', roleTaken: 'Role already exists', renameRole: 'Rename',
        deleteRole: 'Delete role', roleWarning: 'Security policies reference roles by name — renames and deletes ripple.', delete: 'Delete', confirmDelete: 'Confirm delete?'
    },
    fr: {
        listHeader: 'Utilisateurs', filterPlaceholder: 'Filtrer…', noUsers: 'Aucun utilisateur',
        noSelection: 'Sélectionnez un utilisateur', newUser: 'Nouvel utilisateur', username: 'Nom d’utilisateur',
        usernameRequired: 'Nom d’utilisateur requis', usernameTaken: 'Nom déjà utilisé',
        firstName: 'Prénom', lastName: 'Nom', schedule: 'Horaire', language: 'Langue',
        notes: 'Notes', roles: 'Rôles', noRoles: 'Aucun rôle défini', contact: 'Coordonnées',
        addContact: 'Ajouter un contact', removeContact: 'Retirer', password: 'Nouveau mot de passe',
        passwordPending: 'Le mot de passe sera défini à l’enregistrement',
        adjustments: 'Ajustements de disponibilité', addAdjustment: 'Ajouter un ajustement', adjStart: 'Du', adjEnd: 'Au',
        adjAvailable: 'Disponible', adjNote: 'Note', adjInvalid: 'Deux instants requis, fin après début',
        adjHint: 'Remplace l’horaire entre les deux instants — décochez Disponible pour un congé, cochez pour un renfort.',
        manageRoles: 'Gérer les rôles', doneManaging: 'Terminé', addRole: 'Ajouter un rôle', roleName: 'Nom du rôle',
        roleRequired: 'Nom du rôle requis', roleTaken: 'Rôle déjà existant', renameRole: 'Renommer',
        deleteRole: 'Supprimer le rôle', roleWarning: 'Les politiques de sécurité référencent les rôles par leur nom — renommages et suppressions se propagent.', delete: 'Supprimer', confirmDelete: 'Confirmer la suppression ?'
    },
    de: {
        listHeader: 'Benutzer', filterPlaceholder: 'Benutzer filtern…', noUsers: 'Keine Benutzer',
        noSelection: 'Benutzer auswählen', newUser: 'Neuer Benutzer', username: 'Benutzername',
        usernameRequired: 'Benutzername erforderlich', usernameTaken: 'Benutzername bereits vergeben',
        firstName: 'Vorname', lastName: 'Nachname', schedule: 'Zeitplan', language: 'Sprache',
        notes: 'Notizen', roles: 'Rollen', noRoles: 'Keine Rollen definiert', contact: 'Kontaktdaten',
        addContact: 'Kontakt hinzufügen', removeContact: 'Entfernen', password: 'Neues Passwort',
        passwordPending: 'Passwort wird beim Speichern gesetzt',
        adjustments: 'Verfügbarkeitsanpassungen', addAdjustment: 'Anpassung hinzufügen', adjStart: 'Von', adjEnd: 'Bis',
        adjAvailable: 'Verfügbar', adjNote: 'Notiz', adjInvalid: 'Beide Zeitpunkte erforderlich, Ende nach Beginn',
        adjHint: 'Überschreibt den Zeitplan zwischen den beiden Zeitpunkten — Verfügbar abwählen für Abwesenheit, anwählen für Zusatzdienst.',
        manageRoles: 'Rollen verwalten', doneManaging: 'Fertig', addRole: 'Rolle hinzufügen', roleName: 'Rollenname',
        roleRequired: 'Rollenname erforderlich', roleTaken: 'Rolle existiert bereits', renameRole: 'Umbenennen',
        deleteRole: 'Rolle löschen', roleWarning: 'Sicherheitsrichtlinien referenzieren Rollen über den Namen — Umbenennen und Löschen wirken sich aus.', delete: 'Löschen', confirmDelete: 'Löschen bestätigen?'
    },
    es: {
        listHeader: 'Usuarios', filterPlaceholder: 'Filtrar usuarios…', noUsers: 'Sin usuarios',
        noSelection: 'Seleccione un usuario', newUser: 'Nuevo usuario', username: 'Nombre de usuario',
        usernameRequired: 'Nombre de usuario obligatorio', usernameTaken: 'Nombre ya en uso',
        firstName: 'Nombre', lastName: 'Apellidos', schedule: 'Horario', language: 'Idioma',
        notes: 'Notas', roles: 'Roles', noRoles: 'Sin roles definidos', contact: 'Datos de contacto',
        addContact: 'Añadir contacto', removeContact: 'Quitar', password: 'Nueva contraseña',
        passwordPending: 'La contraseña se establecerá al guardar',
        adjustments: 'Ajustes de disponibilidad', addAdjustment: 'Añadir ajuste', adjStart: 'Desde', adjEnd: 'Hasta',
        adjAvailable: 'Disponible', adjNote: 'Nota', adjInvalid: 'Ambos instantes requeridos, fin posterior al inicio',
        adjHint: 'Anula el horario entre los dos instantes — desmarque Disponible para ausencias, márquelo para refuerzos.',
        manageRoles: 'Gestionar roles', doneManaging: 'Hecho', addRole: 'Añadir rol', roleName: 'Nombre del rol',
        roleRequired: 'Nombre del rol obligatorio', roleTaken: 'El rol ya existe', renameRole: 'Renombrar',
        deleteRole: 'Eliminar rol', roleWarning: 'Las políticas de seguridad referencian los roles por nombre — renombrar y eliminar repercute.', delete: 'Eliminar', confirmDelete: '¿Confirmar eliminación?'
    },
    nl: {
        listHeader: 'Gebruikers', filterPlaceholder: 'Gebruikers filteren…', noUsers: 'Geen gebruikers',
        noSelection: 'Selecteer een gebruiker', newUser: 'Nieuwe gebruiker', username: 'Gebruikersnaam',
        usernameRequired: 'Gebruikersnaam vereist', usernameTaken: 'Gebruikersnaam al in gebruik',
        firstName: 'Voornaam', lastName: 'Achternaam', schedule: 'Rooster', language: 'Taal',
        notes: 'Notities', roles: 'Rollen', noRoles: 'Geen rollen gedefinieerd', contact: 'Contactgegevens',
        addContact: 'Contact toevoegen', removeContact: 'Verwijderen', password: 'Nieuw wachtwoord',
        passwordPending: 'Wachtwoord wordt ingesteld bij opslaan',
        adjustments: 'Beschikbaarheidsaanpassingen', addAdjustment: 'Aanpassing toevoegen', adjStart: 'Van', adjEnd: 'Tot',
        adjAvailable: 'Beschikbaar', adjNote: 'Notitie', adjInvalid: 'Beide tijdstippen vereist, einde na begin',
        adjHint: 'Overschrijft het rooster tussen de twee tijdstippen — vink Beschikbaar uit voor verlof, aan voor extra dekking.',
        manageRoles: 'Rollen beheren', doneManaging: 'Klaar', addRole: 'Rol toevoegen', roleName: 'Rolnaam',
        roleRequired: 'Rolnaam vereist', roleTaken: 'Rol bestaat al', renameRole: 'Hernoemen',
        deleteRole: 'Rol verwijderen', roleWarning: 'Beveiligingsbeleid verwijst naar rollen op naam — hernoemen en verwijderen werkt door.', delete: 'Verwijderen', confirmDelete: 'Verwijderen bevestigen?'
    },
    it: {
        listHeader: 'Utenti', filterPlaceholder: 'Filtra utenti…', noUsers: 'Nessun utente',
        noSelection: 'Seleziona un utente', newUser: 'Nuovo utente', username: 'Nome utente',
        usernameRequired: 'Nome utente obbligatorio', usernameTaken: 'Nome utente già in uso',
        firstName: 'Nome', lastName: 'Cognome', schedule: 'Orario', language: 'Lingua',
        notes: 'Note', roles: 'Ruoli', noRoles: 'Nessun ruolo definito', contact: 'Contatti',
        addContact: 'Aggiungi contatto', removeContact: 'Rimuovi', password: 'Nuova password',
        passwordPending: 'La password sarà impostata al salvataggio',
        adjustments: 'Regolazioni di disponibilità', addAdjustment: 'Aggiungi regolazione', adjStart: 'Dal', adjEnd: 'Al',
        adjAvailable: 'Disponibile', adjNote: 'Nota', adjInvalid: 'Entrambi gli istanti richiesti, fine dopo inizio',
        adjHint: 'Sostituisce l’orario tra i due istanti — deseleziona Disponibile per le ferie, seleziona per copertura extra.',
        manageRoles: 'Gestisci ruoli', doneManaging: 'Fatto', addRole: 'Aggiungi ruolo', roleName: 'Nome del ruolo',
        roleRequired: 'Nome del ruolo obbligatorio', roleTaken: 'Ruolo già esistente', renameRole: 'Rinomina',
        deleteRole: 'Elimina ruolo', roleWarning: 'Le politiche di sicurezza referenziano i ruoli per nome — rinomine ed eliminazioni si propagano.', delete: 'Elimina', confirmDelete: 'Confermare l’eliminazione?'
    },
    pt: {
        listHeader: 'Usuários', filterPlaceholder: 'Filtrar usuários…', noUsers: 'Sem usuários',
        noSelection: 'Selecione um usuário', newUser: 'Novo usuário', username: 'Nome de usuário',
        usernameRequired: 'Nome de usuário obrigatório', usernameTaken: 'Nome já em uso',
        firstName: 'Nome', lastName: 'Sobrenome', schedule: 'Horário', language: 'Idioma',
        notes: 'Notas', roles: 'Funções', noRoles: 'Nenhuma função definida', contact: 'Contato',
        addContact: 'Adicionar contato', removeContact: 'Remover', password: 'Nova senha',
        passwordPending: 'A senha será definida ao salvar',
        adjustments: 'Ajustes de disponibilidade', addAdjustment: 'Adicionar ajuste', adjStart: 'De', adjEnd: 'Até',
        adjAvailable: 'Disponível', adjNote: 'Nota', adjInvalid: 'Ambos os instantes obrigatórios, fim após início',
        adjHint: 'Substitui o horário entre os dois instantes — desmarque Disponível para folga, marque para cobertura extra.',
        manageRoles: 'Gerenciar funções', doneManaging: 'Concluído', addRole: 'Adicionar função', roleName: 'Nome da função',
        roleRequired: 'Nome da função obrigatório', roleTaken: 'Função já existe', renameRole: 'Renomear',
        deleteRole: 'Excluir função', roleWarning: 'Políticas de segurança referenciam funções pelo nome — renomear e excluir repercute.', delete: 'Excluir', confirmDelete: 'Confirmar exclusão?'
    }
};

/** The User Manager's default label set for a locale (English when not
 *  bundled) — the shared commit strings (Save / Discard / unsaved) merged in. */
export function userLabelBase(locale: string): UserManagerLabels {
    return { ...commitLabelBase(locale), ...rowMenuLabelBase(locale), ...(PACKS[primaryLang(locale)] || PACKS.en) };
}

export const EN_USER_LABELS: UserManagerLabels = userLabelBase('en');
