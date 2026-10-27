import {
    canonicalColor, clampAlpha, formatColor, formatHex, formatHsl, formatRgb, hslToRgb, hsvToRgb,
    isLight, normalizeHue, parseColor, parseHex, rgbToHsl, rgbToHsv, rgbToHsvNear, round, Color,
    ColorFormat
} from '../color/colorLogic';

const c = (r: number, g: number, b: number, alpha = 1): Color => ({ rgb: { r, g, b }, alpha });

describe('parseHex', () => {
    it('parses 6-digit hex with or without #', () => {
        expect(parseHex('#ff8800')).toEqual(c(255, 136, 0));
        expect(parseHex('ff8800')).toEqual(c(255, 136, 0));
    });

    it('expands 3- and 4-digit shorthand', () => {
        expect(parseHex('#f80')).toEqual(c(255, 136, 0));
        expect(parseHex('#f808')).toEqual(c(255, 136, 0, 136 / 255));
    });

    it('reads the alpha byte from 8-digit hex', () => {
        expect(parseHex('#ff880080')).toEqual(c(255, 136, 0, 128 / 255));
        expect(parseHex('#ff8800ff')).toEqual(c(255, 136, 0, 1));
    });

    it('is case-insensitive', () => {
        expect(parseHex('#AABBCC')).toEqual(parseHex('#aabbcc'));
    });

    it('rejects malformed hex (5/7 digits, non-hex, empty)', () => {
        expect(parseHex('#12345')).toBeNull();
        expect(parseHex('#1234567')).toBeNull();
        expect(parseHex('#ggg')).toBeNull();
        expect(parseHex('')).toBeNull();
    });
});

describe('parseColor', () => {
    it('parses rgb() and rgba()', () => {
        expect(parseColor('rgb(255, 136, 0)')).toEqual(c(255, 136, 0));
        expect(parseColor('rgba(255,136,0,0.5)')).toEqual(c(255, 136, 0, 0.5));
    });

    it('parses hsl() and hsla() into rgb', () => {
        expect(parseColor('hsl(0, 100%, 50%)')).toEqual(c(255, 0, 0));
        const grey = parseColor('hsl(0, 0%, 50%)');
        expect(grey!.rgb).toEqual({ r: 128, g: 128, b: 128 });
        expect(parseColor('hsla(120, 100%, 50%, 0.25)')).toEqual(c(0, 255, 0, 0.25));
    });

    it('clamps out-of-range channels and alpha', () => {
        expect(parseColor('rgb(300, -10, 0)')).toEqual(c(255, 0, 0));
        expect(parseColor('rgba(0,0,0,5)')).toEqual(c(0, 0, 0, 1));
    });

    it('returns null for garbage, null and empty', () => {
        expect(parseColor('not-a-color')).toBeNull();
        expect(parseColor('')).toBeNull();
        expect(parseColor(null as unknown as string)).toBeNull();
    });
});

describe('formatting', () => {
    it('formats hex, adding the alpha byte only when < 1 and enabled', () => {
        expect(formatHex(c(255, 136, 0), true)).toBe('#ff8800');
        expect(formatHex(c(255, 136, 0, 0.5), true)).toBe('#ff880080');
        expect(formatHex(c(255, 136, 0, 0.5), false)).toBe('#ff8800');
    });

    it('formats rgb/rgba and hsl/hsla', () => {
        expect(formatRgb(c(255, 136, 0), true)).toBe('rgb(255, 136, 0)');
        expect(formatRgb(c(255, 136, 0, 0.5), true)).toBe('rgba(255, 136, 0, 0.5)');
        expect(formatHsl(c(255, 0, 0), true)).toBe('hsl(0, 100%, 50%)');
        expect(formatHsl(c(0, 255, 0, 0.25), true)).toBe('hsla(120, 100%, 50%, 0.25)');
    });

    it('formatColor dispatches on format', () => {
        const col = c(255, 136, 0, 0.5);
        expect(formatColor(col, 'hex', true)).toBe('#ff880080');
        expect(formatColor(col, 'rgb', true)).toBe('rgba(255, 136, 0, 0.5)');
        expect(formatColor(col, 'hsl', true)).toBe(formatHsl(col, true));
    });
});

describe('formatted strings round-trip (#154)', () => {
    const FORMATS: ColorFormat[] = ['hex', 'rgb', 'hsl'];

    it('hsl keeps the default swatch #12b886 (whole numbers gave #12ba87)', () => {
        const green = parseHex('#12b886')!;
        const value = formatColor(green, 'hsl', true);
        expect(formatHex(parseColor(value)!, true)).toBe('#12b886');
    });

    it('every format round-trips a dense sample of 8-bit colours', () => {
        // The full 16.7M cube was checked once offline (1 decimal is the
        // minimum for hsl); a stride of 5 plus the greys keeps jest fast.
        const levels: number[] = [];
        for (let v = 0; v < 256; v += 5) {
            levels.push(v);
        }
        const failures: string[] = [];
        const check = (r: number, g: number, b: number): void => {
            FORMATS.forEach((f) => {
                const value = formatColor(c(r, g, b), f, true);
                const back = parseColor(value)!.rgb;
                if (back.r !== r || back.g !== g || back.b !== b) {
                    failures.push(`${f} ${r},${g},${b} -> ${value}`);
                }
            });
        };
        levels.forEach((r) => levels.forEach((g) => levels.forEach((b) => check(r, g, b))));
        for (let v = 0; v < 256; v++) {
            check(v, v, v);
        }
        expect(failures).toEqual([]);
    });

    it('every 8-bit alpha survives rgba() and hsla() (2 decimals shifted 155 of 256)', () => {
        const shifted: string[] = [];
        for (let n = 0; n < 255; n++) {
            FORMATS.forEach((f) => {
                const value = formatColor(c(18, 184, 134, n / 255), f, true);
                if (Math.round(parseColor(value)!.alpha * 255) !== n) {
                    shifted.push(`${f} ${n} -> ${value}`);
                }
            });
        }
        expect(shifted).toEqual([]);
    });
});

describe('canonicalColor', () => {
    it('returns the committed string and the colour it parses back to', () => {
        const { value, color } = canonicalColor(parseHex('#12b886')!, 'hsl', true);
        expect(value).toBe(formatHsl(parseHex('#12b886')!, true));
        expect(color).toEqual(parseColor(value));
        expect(formatHex(color, true)).toBe('#12b886');
    });

    it('quantises a free slider alpha the same way the string does', () => {
        // The alpha bar yields any 0..1 number; the hex byte of the raw value
        // (0.0019 * 255 = 0.48 -> 00) and of the written rgba (0.002 -> 01)
        // differ, so the payload must come from the parsed string.
        const { value, color } = canonicalColor(c(10, 20, 30, 0.0019), 'rgb', true);
        expect(value).toBe('rgba(10, 20, 30, 0.002)');
        expect(formatHex(color, true)).toBe(formatHex(parseColor(value)!, true));
    });

    it('drops alpha from the colour when the format omits it', () => {
        const { value, color } = canonicalColor(c(10, 20, 30, 0.5), 'hex', false);
        expect(value).toBe('#0a141e');
        expect(color).toEqual(c(10, 20, 30));
    });
});

describe('rgbToHsvNear', () => {
    it('keeps the previous hue for a grey (fresh derivation says hue 0)', () => {
        const prev = { h: 200, s: 60, v: 70 };
        expect(rgbToHsvNear({ r: 128, g: 128, b: 128 }, prev)).toEqual({ h: 200, s: 0, v: rgbToHsv({ r: 128, g: 128, b: 128 }).v });
    });

    it('keeps the previous hue and saturation for black', () => {
        expect(rgbToHsvNear({ r: 0, g: 0, b: 0 }, { h: 200, s: 60, v: 70 })).toEqual({ h: 200, s: 60, v: 0 });
    });

    it('keeps the previous HSV untouched when it already renders to the colour', () => {
        // A drag released on a grey: the committed colour is exactly what the
        // working copy showed, so no slider may move.
        const prev = { h: 213.5, s: 0, v: 41.7 };
        expect(rgbToHsvNear(hsvToRgb(prev), prev)).toEqual(prev);
    });

    it('derives fresh HSV for a chromatic colour or without a previous value', () => {
        const red = { r: 255, g: 0, b: 0 };
        expect(rgbToHsvNear(red, { h: 200, s: 60, v: 70 })).toEqual(rgbToHsv(red));
        expect(rgbToHsvNear({ r: 0, g: 0, b: 0 }, null)).toEqual(rgbToHsv({ r: 0, g: 0, b: 0 }));
    });
});

describe('conversions round-trip', () => {
    const samples: Array<[number, number, number]> = [
        [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 136, 0],
        [18, 52, 86], [128, 128, 128], [0, 0, 0], [255, 255, 255], [10, 200, 90]
    ];

    it('rgb -> hsv -> rgb is identity (integers)', () => {
        samples.forEach(([r, g, b]) => {
            expect(hsvToRgb(rgbToHsv({ r, g, b }))).toEqual({ r, g, b });
        });
    });

    it('rgb -> hsl -> rgb is identity (integers)', () => {
        samples.forEach(([r, g, b]) => {
            expect(hslToRgb(rgbToHsl({ r, g, b }))).toEqual({ r, g, b });
        });
    });
});

describe('helpers', () => {
    it('normalizeHue wraps into [0,360)', () => {
        expect(normalizeHue(-30)).toBe(330);
        expect(normalizeHue(360)).toBe(0);
        expect(normalizeHue(725)).toBe(5);
        expect(normalizeHue(NaN)).toBe(0);
    });

    it('clampAlpha bounds to 0..1 and defends against NaN', () => {
        expect(clampAlpha(-1)).toBe(0);
        expect(clampAlpha(2)).toBe(1);
        expect(clampAlpha(0.4)).toBe(0.4);
        expect(clampAlpha(NaN)).toBe(1);
    });

    it('round trims to dp', () => {
        expect(round(0.12345, 2)).toBe(0.12);
        expect(round(1, 2)).toBe(1);
    });

    it('isLight separates white from black', () => {
        expect(isLight({ r: 255, g: 255, b: 255 })).toBe(true);
        expect(isLight({ r: 0, g: 0, b: 0 })).toBe(false);
    });
});
