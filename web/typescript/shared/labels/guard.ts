// Built-in UI-text pack for the Idle Guard. `config.locale` picks the default
// language (primary subtag, English fallback) and `config.labels.*` overrides
// any single key on top. See labelPacks.ts for the barrel re-export. The clock's
// time and date come from Intl via the same locale.
//
// The operator-facing text: the wake hint, the alarm banner and the fallback
// line names; and the defaults of the playful mode texts (bounce badge, pong
// names), which are overridden by their own props (config.modes.bounce.text,
// config.modes.pong.left/right) rather than config.labels.*. The ducks' slogans stay
// English.
//
// Translations are pragmatic industrial-UI register, not native-reviewed; the
// per-key overrides exist precisely so deployments can correct or rebrand them.

import { primaryLang } from './common';

export interface GuardLabels {
    wakeHint: string;      // shown on the idle screen
    activeAlarm: string;   // banner count for one alarm
    activeAlarms: string;  // banner count, '{n}' = number of alarms
    line: string;          // fallback name of an unnamed line, '{n}' = its number
    diagnostic: string;    // alarm priority names, used in the banner detail
    low: string;
    medium: string;
    high: string;
    critical: string;
    bounce: string;        // the bouncing badge, unless config.modes.bounce.text is set
    pongLeft: string;      // pong's left player, unless config.modes.pong.left is set
    pongRight: string;     // pong's right player, unless config.modes.pong.right is set
}

/** Pack keys overridden by a mode prop of their own, not by config.labels.*. */
export const GUARD_MODE_TEXT_KEYS: readonly (keyof GuardLabels)[] = ['bounce', 'pongLeft', 'pongRight'];

const PACKS: { [lang: string]: GuardLabels } = {
    en: { wakeHint: 'Touch, click or press a key to wake', activeAlarm: '1 active alarm', activeAlarms: '{n} active alarms', line: 'Line {n}', diagnostic: 'Diagnostic', low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical', bounce: 'IDLE', pongLeft: 'DAY SHIFT', pongRight: 'NIGHT SHIFT' },
    fr: { wakeHint: 'Touchez, cliquez ou appuyez sur une touche pour réveiller', activeAlarm: '1 alarme active', activeAlarms: '{n} alarmes actives', line: 'Ligne {n}', diagnostic: 'Diagnostic', low: 'Basse', medium: 'Moyenne', high: 'Haute', critical: 'Critique', bounce: 'EN VEILLE', pongLeft: 'ÉQUIPE DE JOUR', pongRight: 'ÉQUIPE DE NUIT' },
    de: { wakeHint: 'Zum Aufwecken berühren, klicken oder eine Taste drücken', activeAlarm: '1 aktiver Alarm', activeAlarms: '{n} aktive Alarme', line: 'Linie {n}', diagnostic: 'Diagnose', low: 'Niedrig', medium: 'Mittel', high: 'Hoch', critical: 'Kritisch', bounce: 'STANDBY', pongLeft: 'TAGSCHICHT', pongRight: 'NACHTSCHICHT' },
    es: { wakeHint: 'Toque, haga clic o pulse una tecla para activar', activeAlarm: '1 alarma activa', activeAlarms: '{n} alarmas activas', line: 'Línea {n}', diagnostic: 'Diagnóstico', low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica', bounce: 'EN ESPERA', pongLeft: 'TURNO DE DÍA', pongRight: 'TURNO DE NOCHE' },
    nl: { wakeHint: 'Aanraken, klikken of een toets indrukken om te wekken', activeAlarm: '1 actief alarm', activeAlarms: '{n} actieve alarmen', line: 'Lijn {n}', diagnostic: 'Diagnose', low: 'Laag', medium: 'Middel', high: 'Hoog', critical: 'Kritiek', bounce: 'STAND-BY', pongLeft: 'DAGDIENST', pongRight: 'NACHTDIENST' },
    it: { wakeHint: 'Tocca, fai clic o premi un tasto per riattivare', activeAlarm: '1 allarme attivo', activeAlarms: '{n} allarmi attivi', line: 'Linea {n}', diagnostic: 'Diagnostica', low: 'Bassa', medium: 'Media', high: 'Alta', critical: 'Critica', bounce: 'IN ATTESA', pongLeft: 'TURNO DI GIORNO', pongRight: 'TURNO DI NOTTE' },
    pt: { wakeHint: 'Toque, clique ou prima uma tecla para ativar', activeAlarm: '1 alarme ativo', activeAlarms: '{n} alarmes ativos', line: 'Linha {n}', diagnostic: 'Diagnóstico', low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica', bounce: 'EM ESPERA', pongLeft: 'TURNO DO DIA', pongRight: 'TURNO DA NOITE' }
};

export const EN_GUARD_LABELS: GuardLabels = PACKS.en;

/** The Idle Guard's default label set for a locale (English when not bundled). */
export function guardLabelBase(locale: string): GuardLabels {
    return PACKS[primaryLang(locale)] || PACKS.en;
}
