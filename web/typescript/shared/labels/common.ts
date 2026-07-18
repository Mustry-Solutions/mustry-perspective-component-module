// Built-in UI-text packs for the module's components. `config.locale` picks the
// default language (matched on the primary subtag: 'fr-BE' -> 'fr'; unknown ->
// English), and `config.labels.*` still overrides any individual key on top.
// Date, weekday and month names are NOT here — they come from Intl via the same
// locale. The label-set interfaces live here too so the shared layer has no
// dependency on any component.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; per-key
// overrides exist precisely so deployments can correct or rebrand them.

/** Primary language subtag of a BCP-47/underscore locale ('fr-BE' / 'fr_BE' -> 'fr'). */
export function primaryLang(locale: string): string {
    return (locale || '').toLowerCase().split(/[-_]/)[0];
}

/** Substitute '{name}' placeholders in a label template; unknown ones are left
 *  untouched. The one home for what picker and richtext each used to define. */
export function fillLabel(tpl: string, vars: { [k: string]: string | number }): string {
    return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** The empty-badge text: the schema default ('No events') counts as "unset" so it
 *  follows the locale pack's noEvents; any other value (including '' = hide the
 *  badge) is an explicit author choice. */
export function emptyMessageText(configured: string, localized: string, englishDefault: string = 'No events'): string {
    return configured === englishDefault ? localized : configured;
}
