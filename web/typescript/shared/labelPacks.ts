// Built-in UI-text packs for the module's components. `config.locale` picks the
// default language (matched on the primary subtag: 'fr-BE' -> 'fr'; unknown ->
// English), and `config.labels.*` still overrides any individual key on top.
// Date, weekday and month names are NOT here — they come from Intl via the same
// locale. The label-set interfaces live here too so the shared layer has no
// dependency on any component.
//
// The packs live per component under shared/labels/; this barrel keeps the
// historical import path stable.
export * from './labels/common';
export * from './labels/calendar';
export * from './labels/picker';
export * from './labels/timeline';
export * from './labels/grid';
export * from './labels/panzoom';
export * from './labels/richtext';
export * from './labels/code';
