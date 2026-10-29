// Reads the Perspective PropertyTree into the typed props the Idle Guard uses.
import { NightConfig, normNightMode, normReduceMotion, priorityIndex, ReduceMotionSetting } from './idleLogic';
import { normQuality, QualitySetting } from './modes/quality';
import { GUARD_MODE_TEXT_KEYS, GuardLabels, guardLabelBase } from '../../shared/labels/guard';

/** The PropertyTree readers we use, kept structural so the mapper is node-testable. */
export interface PropReader {
    readString(path: string, defaultValue?: string): string;
    readBoolean(path: string, defaultValue?: boolean): boolean;
    readNumber<T>(path: string, defaultValue: T): T;
    readArray(path: string, defaultValue?: never[]): unknown[];
    readLength(path: string): number;
}

export const MODES = [
    'pipes', 'aurora', 'halo', 'starfield',          // driven by the plant
    'synthwave', 'lava', 'tunnel', 'flow',           // showpieces
    'bounce', 'pong', 'ducks',                       // funny
    'shuffle', 'clock', 'blank', 'external'
] as const;
export type Mode = typeof MODES[number];

export function normMode(value: string): Mode {
    const v = (value || '').trim().toLowerCase();
    return (MODES as readonly string[]).includes(v) ? v as Mode : 'clock';
}

/** Modes drawn on a canvas by a renderer (the rest are plain DOM). Also what shuffle picks from. */
export const CANVAS_MODES: readonly Mode[] = [
    'pipes', 'aurora', 'halo', 'starfield', 'synthwave', 'lava', 'tunnel', 'flow', 'bounce', 'pong', 'ducks'
];

/** Canvas modes with a WebGL2 renderer; the others are 2D only (and run everywhere). */
export const GL_MODES: readonly Mode[] = ['pipes', 'aurora', 'halo', 'starfield', 'synthwave', 'lava', 'tunnel', 'flow'];

/** Modes that draw one element per entry of `lines`. */
export const LINE_MODES: readonly Mode[] = ['pipes', 'aurora', 'halo'];

/** One production line (or utility, or unit) as the line-driven modes show it. */
export interface LineSpec {
    label: string;
    state: string;
    flow: number;
    color: string;
}

export interface GuardProps {
    config: {
        enabled: boolean;
        timeoutSec: number;
        mode: Mode;
        wakeOnMove: boolean;
        moveThresholdPx: number;
        wakeLock: boolean;
        quality: QualitySetting;
        reduceMotion: ReduceMotionSetting;
        /** UI-text language and the clock's Intl locale; '' follows the browser. */
        locale: string;
        /** The locale pack with config.labels.* overrides applied. */
        labels: GuardLabels;
    };
    alarm: {
        wakePriority: number;
        pinPriority: number;
        includeAcked: boolean;
        sources: string[];
        staleAfterSec: number;
    };
    burnIn: {
        drift: boolean;
        night: NightConfig;
    };
    lines: LineSpec[];
    modes: {
        legend: boolean;
        clock: { title: string; showSeconds: boolean };
        starfield: { speed: number; color: string; density: number; caption: string };
        pipes: { resetAfterSec: number; orbit: boolean };
        bounce: { text: string };
        pong: { left: string; right: string };
        shuffle: { modes: Mode[]; minutes: number };
    };
}

/**
 * The demo set, so a freshly dropped guard in a line mode shows something.
 * No labels: unnamed lines take the locale's config.labels.line ('Line 3').
 */
export const DEFAULT_LINES: LineSpec[] = [
    { label: '', state: 'running', flow: 0.8, color: '' },
    { label: '', state: 'running', flow: 0.5, color: '' },
    { label: '', state: 'idle', flow: 0.2, color: '' },
    { label: '', state: 'warning', flow: 0.6, color: '' }
];

/** At most this many lines are drawn; more only crowd the screen. */
export const MAX_LINES = 12;

/** `lines`, item by item. Empty means the demo set: a line mode without lines is a black screen. */
function readLines(tree: PropReader): LineSpec[] {
    const n = Math.min(tree.readLength('lines'), MAX_LINES);
    if (n === 0) {
        return DEFAULT_LINES;
    }
    const out: LineSpec[] = [];
    for (let i = 0; i < n; i++) {
        const p = `lines[${i}]`;
        out.push({
            label: tree.readString(`${p}.label`, ''),
            state: tree.readString(`${p}.state`, 'running'),
            flow: Number(tree.readNumber(`${p}.flow`, 0.5)),
            color: tree.readString(`${p}.color`, '')
        });
    }
    return out;
}

/** The locale's pack, with every non-empty config.labels.* key on top (the mode texts have props of their own). */
function readLabels(tree: PropReader, locale: string): GuardLabels {
    const base = guardLabelBase(locale);
    const out = { ...base };
    (Object.keys(base) as (keyof GuardLabels)[]).filter((k) => !GUARD_MODE_TEXT_KEYS.includes(k)).forEach((k) => {
        const v = tree.readString(`config.labels.${k}`, '');
        if (v !== '') {
            out[k] = v;
        }
    });
    return out;
}

/**
 * The mouse jitter threshold in px: NaN or garbage takes the default 8 (NaN
 * would make every distance check false, so movement would never wake),
 * negatives clamp to 0.
 */
export function moveThreshold(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : 8;
}

/** A mode text prop: its own value when set, else the locale pack's (labels-style override, no schema default). */
function modeText(tree: PropReader, path: string, fallback: string): string {
    const v = tree.readString(path, '').trim();
    return v !== '' ? v : fallback;
}

export function mapGuardProps(tree: PropReader): GuardProps {
    const wake = priorityIndex(tree.readString('alarm.wakePriority', 'High'), 3);
    const locale = tree.readString('config.locale', '');
    const labels = readLabels(tree, locale);
    return {
        config: {
            enabled: tree.readBoolean('config.enabled', true),
            timeoutSec: Number(tree.readNumber('config.timeoutSec', 600)),
            mode: normMode(tree.readString('config.mode', 'clock')),
            wakeOnMove: tree.readBoolean('config.wakeOnMove', true),
            moveThresholdPx: moveThreshold(tree.readNumber('config.moveThresholdPx', 8)),
            wakeLock: tree.readBoolean('config.wakeLock', false),
            quality: normQuality(tree.readString('config.quality', 'auto')),
            reduceMotion: normReduceMotion(tree.readString('config.reduceMotion', 'auto')),
            locale,
            labels
        },
        alarm: {
            wakePriority: wake,
            pinPriority: priorityIndex(tree.readString('alarm.pinPriority', 'Medium'), 2),
            includeAcked: tree.readBoolean('alarm.includeAcked', true),
            sources: (tree.readArray('alarm.sources', []) || []).filter((s): s is string => typeof s === 'string' && s.trim() !== ''),
            staleAfterSec: Number(tree.readNumber('alarm.staleAfterSec', 8))
        },
        burnIn: {
            drift: tree.readBoolean('burnIn.drift', true),
            night: {
                enabled: tree.readBoolean('burnIn.night.enabled', true),
                from: tree.readString('burnIn.night.from', '22:00'),
                to: tree.readString('burnIn.night.to', '06:00'),
                mode: normNightMode(tree.readString('burnIn.night.mode', 'clock')),
                level: Number(tree.readNumber('burnIn.night.level', 0.4))
            }
        },
        lines: readLines(tree),
        modes: {
            legend: tree.readBoolean('modes.legend', true),
            clock: {
                title: tree.readString('modes.clock.title', ''),
                showSeconds: tree.readBoolean('modes.clock.showSeconds', false)
            },
            starfield: {
                speed: Number(tree.readNumber('modes.starfield.speed', 1)),
                color: tree.readString('modes.starfield.color', ''),
                density: Number(tree.readNumber('modes.starfield.density', 400)),
                caption: tree.readString('modes.starfield.caption', '')
            },
            pipes: {
                resetAfterSec: Number(tree.readNumber('modes.pipes.resetAfterSec', 120)),
                orbit: tree.readBoolean('modes.pipes.orbit', true)
            },
            bounce: { text: modeText(tree, 'modes.bounce.text', labels.bounce) },
            pong: {
                left: modeText(tree, 'modes.pong.left', labels.pongLeft),
                right: modeText(tree, 'modes.pong.right', labels.pongRight)
            },
            shuffle: {
                modes: (tree.readArray('modes.shuffle.modes', []) || [])
                    .map((m) => (typeof m === 'string' ? m.trim().toLowerCase() : ''))
                    .filter((m): m is Mode => (CANVAS_MODES as readonly string[]).includes(m)),
                minutes: Number(tree.readNumber('modes.shuffle.minutes', 5))
            }
        }
    };
}
