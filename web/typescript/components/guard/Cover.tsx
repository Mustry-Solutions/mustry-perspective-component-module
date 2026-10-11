// What the Idle Guard puts over the page while idle: the mode (canvas or
// DOM), its text (clock, legend, halo labels, caption), the alarm banner, the
// wake hint and the night dimming. Pure rendering from props; the guard owns
// the state and decides when this is mounted.
import * as React from 'react';
import { CanvasMode } from './CanvasMode';
import { CANVAS_MODES, GuardProps, MAX_LINES, Mode } from './guardProps';
import { fillLabel } from '../../shared/labels/common';
import { AlarmFeed, AlarmVerdict, countsText, dimLevel, drift, PRIORITIES } from './idleLogic';
import { MAX_CURTAINS } from './modes/gl/aurora';
import { HALO_DRIFT, HALO_LABEL_ANGLE, haloRadii } from './modes/haloLayout';
import { Shown } from './modes/modeToShow';
import { pipeColor } from './modes/pipesSim';

export interface CoverProps {
    props: GuardProps;
    feed: AlarmFeed | null;
    verdict: AlarmVerdict | null;
    /** Wall-clock time of the guard's last render tick. */
    now: number;
    /** Fading out after a wake. */
    fading: boolean;
    /** What to show (modeToShow: night, shuffle and reduced motion applied). */
    shown: Shown;
    /** The viewer wants less motion (browser preference or config.reduceMotion): no fades or glides either. */
    reduceMotion: boolean;
}

/** The clock's time and date in config.locale ('' or an unknown tag: the browser's). */
function clockText(now: number, seconds: boolean, locale: string): [string, string] {
    const date = new Date(now);
    const time: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined };
    const day: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
    try {
        return [date.toLocaleTimeString(locale || [], time), date.toLocaleDateString(locale || [], day)];
    } catch (e) {
        return [date.toLocaleTimeString([], time), date.toLocaleDateString([], day)];
    }
}

/** A line's name, or the locale's fallback ('Line 3'). */
function lineName(guard: GuardProps, label: string, i: number): string {
    return label || fillLabel(guard.config.labels.line, { n: i + 1 });
}

function Clock({ guard, now, style }: { guard: GuardProps; now: number; style: React.CSSProperties }) {
    const c = guard.modes.clock;
    const [time, day] = clockText(now, c.showSeconds, guard.config.locale);
    return (
        <div className="mustry-idle-clock" style={style}>
            <div className="mustry-idle-clock__time">{time}</div>
            <div className="mustry-idle-clock__date">{day}</div>
            {c.title.trim() !== '' && <div className="mustry-idle-clock__title">{c.title}</div>}
        </div>
    );
}

function Legend({ guard, mode, style }: { guard: GuardProps; mode: Mode; style: React.CSSProperties }) {
    const lines = mode === 'aurora' ? guard.lines.slice(0, MAX_CURTAINS) : guard.lines;
    return (
        <ul className="mustry-idle-legend" style={style}>
            {lines.map((line, i) => (
                <li key={i} className="mustry-idle-legend__item">
                    <span className="mustry-idle-legend__dot" style={{ background: pipeColor(line.state, line.color) }} />
                    <span className="mustry-idle-legend__label">{lineName(guard, line.label, i)}</span>
                    <span className="mustry-idle-legend__state">{line.state}</span>
                </li>
            ))}
        </ul>
    );
}

/** Halo's DOM half: the clock in the middle and a label beside each ring, drifting with the shader's centre. */
function HaloText({ guard, now }: { guard: GuardProps; now: number }) {
    const d = guard.burnIn.drift ? drift(now) : { x: 0, y: 0 };
    const [time, day] = clockText(now, false, guard.config.locale);
    const title = guard.modes.clock.title;
    const lines = guard.lines.slice(0, MAX_LINES);
    const radii = haloRadii(lines.length);
    const cos = Math.cos(HALO_LABEL_ANGLE);
    const sin = Math.sin(HALO_LABEL_ANGLE);
    return (
        <div
            className="mustry-idle-halo"
            style={{ transform: `translate(${(d.x * HALO_DRIFT.x * 100).toFixed(3)}vw, ${(d.y * HALO_DRIFT.y * 100).toFixed(3)}vh)` }}
        >
            <div className="mustry-idle-halo__clock">
                <div className="mustry-idle-halo__time">{time}</div>
                <div className="mustry-idle-halo__date">{day}</div>
                {title.trim() !== '' && <div className="mustry-idle-halo__title">{title}</div>}
            </div>
            {lines.map((line, i) => {
                const r = radii[i] * 100;
                return (
                    <div
                        key={i}
                        className="mustry-idle-halo__label"
                        style={{ left: `calc(50% + ${(cos * r).toFixed(2)}vmin)`, top: `calc(50% - ${(sin * r).toFixed(2)}vmin)` }}
                    >
                        <span className="mustry-idle-halo__name">{lineName(guard, line.label, i)}</span>
                        <span className="mustry-idle-halo__state" style={{ color: pipeColor(line.state, line.color) }}>{line.state}</span>
                    </div>
                );
            })}
        </div>
    );
}

function Banner({ guard, verdict, feed, style }: { guard: GuardProps; verdict: AlarmVerdict; feed: AlarmFeed | null; style: React.CSSProperties }) {
    const total = PRIORITIES.reduce((n, pr, i) => (i >= guard.alarm.pinPriority ? n + verdict.counted[pr] : n), 0);
    const first = feed && feed.top.length > 0 ? feed.top[0] : null;
    const labels = guard.config.labels;
    return (
        <div className={`mustry-idle-banner mustry-idle-banner--${PRIORITIES[Math.max(0, verdict.highest)]}`} style={style} role="alert">
            <span className="mustry-idle-banner__count">{total === 1 ? labels.activeAlarm : fillLabel(labels.activeAlarms, { n: total })}</span>
            <span className="mustry-idle-banner__detail">{countsText(verdict.counted, guard.alarm.pinPriority, labels)}</span>
            {first && <span className="mustry-idle-banner__first">{first.label || first.displayPath}</span>}
        </div>
    );
}

export function Cover(c: CoverProps) {
    const p = c.props;
    const shown = c.shown;
    const mode = shown.mode;
    const pinned = c.verdict !== null && c.verdict.pin;
    const dim = dimLevel(p.burnIn.night, new Date(c.now), pinned);
    const dimLayer = dim < 1 ? <div className="mustry-idle-dim" style={{ opacity: (1 - dim).toFixed(3) }} /> : null;
    if (mode === 'external') {
        return dimLayer;
    }
    const d = p.burnIn.drift ? drift(c.now) : { x: 0, y: 0 };
    const driftStyle = { transform: `translate(${(d.x * 18).toFixed(2)}vw, ${(d.y * 14).toFixed(2)}vh)` };
    return (
        <div
            className={`mustry-idle-overlay mustry-idle-overlay--${mode}${c.fading ? ' mustry-idle-overlay--fading' : ''}${c.reduceMotion ? ' mustry-idle-overlay--still' : ''}`}
            data-mode={mode}
            data-reason={shown.reason}
            data-shuffle={shown.reason === 'shuffle' ? 'true' : undefined}
            role="presentation"
        >
            {CANVAS_MODES.includes(mode) && <CanvasMode mode={mode} props={p} />}
            {mode === 'clock' && <Clock guard={p} now={c.now} style={driftStyle} />}
            {mode === 'halo' && <HaloText guard={p} now={c.now} />}
            {(mode === 'pipes' || mode === 'aurora') && p.modes.legend && <Legend guard={p} mode={mode} style={driftStyle} />}
            {mode === 'starfield' && p.modes.starfield.caption.trim() !== '' && (
                <div className="mustry-idle-caption" style={driftStyle}>{p.modes.starfield.caption}</div>
            )}
            {pinned && c.verdict && <Banner guard={p} verdict={c.verdict} feed={c.feed} style={driftStyle} />}
            {mode !== 'blank' && <div className="mustry-idle-hint" style={driftStyle}>{p.config.labels.wakeHint}</div>}
            {dimLayer}
        </div>
    );
}
