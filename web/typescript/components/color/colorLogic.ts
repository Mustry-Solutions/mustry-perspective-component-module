// Pure colour math for the Color Picker — no DOM, no React (node-tested).
// The picker's single source of truth is an { rgb, alpha } pair; every input
// format (hex / rgb() / hsl()) parses into it and every output format renders
// back out of it. HSV is the interaction model (saturation/value area + hue
// slider); HSL and RGB are display/output formats. Keeping all of this pure
// and exhaustively tested is the whole reason this component is a good fit for
// the module (see the three-layer architecture note in CLAUDE.md).

export interface RGB { r: number; g: number; b: number; } // each 0..255 (integer)
export interface HSL { h: number; s: number; l: number; } // h 0..360, s/l 0..100
export interface HSV { h: number; s: number; v: number; } // h 0..360, s/v 0..100

/** A parsed colour: integer RGB channels plus a separate 0..1 alpha. */
export interface Color { rgb: RGB; alpha: number; }

export type ColorFormat = 'hex' | 'rgb' | 'hsl';

export function clamp(n: number, lo: number, hi: number): number {
    return n < lo ? lo : n > hi ? hi : n;
}

/** Round-to-int with clamping — channels never leave 0..255. */
function chan(n: number): number {
    return clamp(Math.round(n), 0, 255);
}

export function clampAlpha(a: number): number {
    if (!isFinite(a)) {
        return 1;
    }
    return clamp(a, 0, 1);
}

/** Wrap a hue into [0, 360). */
export function normalizeHue(h: number): number {
    if (!isFinite(h)) {
        return 0;
    }
    const m = h % 360;
    return m < 0 ? m + 360 : m;
}

// --- conversions ----------------------------------------------------------

export function rgbToHsv({ r, g, b }: RGB): HSV {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === rr) {
            h = ((gg - bb) / d) % 6;
        } else if (max === gg) {
            h = (bb - rr) / d + 2;
        } else {
            h = (rr - gg) / d + 4;
        }
        h *= 60;
    }
    return { h: normalizeHue(h), s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
    const hh = normalizeHue(h);
    const ss = clamp(s, 0, 100) / 100;
    const vv = clamp(v, 0, 100) / 100;
    const c = vv * ss;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = vv - c;
    let rp = 0, gp = 0, bp = 0;
    if (hh < 60) { rp = c; gp = x; }
    else if (hh < 120) { rp = x; gp = c; }
    else if (hh < 180) { gp = c; bp = x; }
    else if (hh < 240) { gp = x; bp = c; }
    else if (hh < 300) { rp = x; bp = c; }
    else { rp = c; bp = x; }
    return { r: chan((rp + m) * 255), g: chan((gp + m) * 255), b: chan((bp + m) * 255) };
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const d = max - min;
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1));
        if (max === rr) {
            h = ((gg - bb) / d) % 6;
        } else if (max === gg) {
            h = (bb - rr) / d + 2;
        } else {
            h = (rr - gg) / d + 4;
        }
        h *= 60;
    }
    return { h: normalizeHue(h), s: clamp(s * 100, 0, 100), l: clamp(l * 100, 0, 100) };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
    const hh = normalizeHue(h);
    const ss = clamp(s, 0, 100) / 100;
    const ll = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * ll - 1)) * ss;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = ll - c / 2;
    let rp = 0, gp = 0, bp = 0;
    if (hh < 60) { rp = c; gp = x; }
    else if (hh < 120) { rp = x; gp = c; }
    else if (hh < 180) { gp = c; bp = x; }
    else if (hh < 240) { gp = x; bp = c; }
    else if (hh < 300) { rp = x; bp = c; }
    else { rp = c; bp = x; }
    return { r: chan((rp + m) * 255), g: chan((gp + m) * 255), b: chan((bp + m) * 255) };
}

// --- parsing --------------------------------------------------------------

const HEX_RE = /^#?([0-9a-f]{3,8})$/i;

/** Parse a #hex string (3/4/6/8 digits, leading # optional). null if invalid. */
export function parseHex(input: string): Color | null {
    const m = HEX_RE.exec(input.trim());
    if (!m) {
        return null;
    }
    const h = m[1];
    const expand = (s: string): number => parseInt(s.length === 1 ? s + s : s, 16);
    if (h.length === 3 || h.length === 4) {
        const a = h.length === 4 ? expand(h[3]) / 255 : 1;
        return { rgb: { r: expand(h[0]), g: expand(h[1]), b: expand(h[2]) }, alpha: a };
    }
    if (h.length === 6 || h.length === 8) {
        const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
        return {
            rgb: { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) },
            alpha: a
        };
    }
    return null; // 5 or 7 digits — not a valid hex colour
}

const NUM = '\\s*(-?\\d*\\.?\\d+)\\s*';
const RGB_RE = new RegExp(`^rgba?\\(${NUM},${NUM},${NUM}(?:[,/]${NUM})?\\)$`, 'i');
const HSL_RE = new RegExp(`^hsla?\\(${NUM},${NUM}%?,${NUM}%?(?:[,/]${NUM})?\\)$`, 'i');

/** Parse any accepted colour string: #hex, rgb()/rgba(), hsl()/hsla(). null if invalid. */
export function parseColor(input: string): Color | null {
    if (input == null) {
        return null;
    }
    const s = String(input).trim();
    if (s === '') {
        return null;
    }
    const hex = parseHex(s);
    if (hex) {
        return hex;
    }
    const rgb = RGB_RE.exec(s);
    if (rgb) {
        return {
            rgb: { r: chan(+rgb[1]), g: chan(+rgb[2]), b: chan(+rgb[3]) },
            alpha: rgb[4] !== undefined ? clampAlpha(+rgb[4]) : 1
        };
    }
    const hsl = HSL_RE.exec(s);
    if (hsl) {
        return {
            rgb: hslToRgb({ h: +hsl[1], s: +hsl[2], l: +hsl[3] }),
            alpha: hsl[4] !== undefined ? clampAlpha(+hsl[4]) : 1
        };
    }
    return null;
}

// --- formatting -----------------------------------------------------------

function hex2(n: number): string {
    return chan(n).toString(16).padStart(2, '0');
}

/** #RRGGBB, or #RRGGBBAA when withAlpha and alpha < 1. Always lower-case. */
export function formatHex(color: Color, withAlpha: boolean): string {
    const { rgb, alpha } = color;
    const base = `#${hex2(rgb.r)}${hex2(rgb.g)}${hex2(rgb.b)}`;
    if (withAlpha && alpha < 1) {
        return base + hex2(alpha * 255);
    }
    return base;
}

/** rgb(r, g, b) or rgba(r, g, b, a) when withAlpha and alpha < 1. */
export function formatRgb(color: Color, withAlpha: boolean): string {
    const { rgb, alpha } = color;
    if (withAlpha && alpha < 1) {
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${round(alpha, 2)})`;
    }
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

/** hsl(h, s%, l%) or hsla(...) when withAlpha and alpha < 1. */
export function formatHsl(color: Color, withAlpha: boolean): string {
    const { h, s, l } = rgbToHsl(color.rgb);
    const hh = Math.round(h), ss = Math.round(s), ll = Math.round(l);
    if (withAlpha && color.alpha < 1) {
        return `hsla(${hh}, ${ss}%, ${ll}%, ${round(color.alpha, 2)})`;
    }
    return `hsl(${hh}, ${ss}%, ${ll}%)`;
}

/** Render a colour in the requested format. `withAlpha` gates the alpha channel. */
export function formatColor(color: Color, format: ColorFormat, withAlpha: boolean): string {
    switch (format) {
        case 'rgb': return formatRgb(color, withAlpha);
        case 'hsl': return formatHsl(color, withAlpha);
        default: return formatHex(color, withAlpha);
    }
}

export function round(n: number, dp: number): number {
    const f = Math.pow(10, dp);
    return Math.round(n * f) / f;
}

/** Relative luminance (WCAG) 0..1 — used to pick a readable thumb/checker contrast. */
export function luminance({ r, g, b }: RGB): number {
    const lin = (c: number): number => {
        const cs = c / 255;
        return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** True when a colour is light enough that dark UI chrome reads better on top. */
export function isLight(rgb: RGB): boolean {
    return luminance(rgb) > 0.5;
}

const DEFAULT: Color = { rgb: { r: 0, g: 0, b: 0 }, alpha: 1 };

/** Parse, or fall back to the given default (or opaque black) — never returns null. */
export function parseColorOr(input: string, fallback: Color = DEFAULT): Color {
    return parseColor(input) || fallback;
}
