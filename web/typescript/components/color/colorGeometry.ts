// Pure pointer→value geometry for the picker's draggable surfaces (no DOM: the
// caller passes a plain rect, so this stays node-tested). The saturation/value
// area maps X→saturation and Y→value (inverted); the hue and alpha bars are
// horizontal. Thumb *positions* are pure percentages done in the view, so they
// need no geometry here.
import { clamp } from './colorLogic';

/** The bits of a DOMRect this module needs (kept minimal so tests pass plain objects). */
export interface Rect { left: number; top: number; width: number; height: number; }

/** Fraction 0..1 of clientX across the rect's width (clamped). */
export function fracX(rect: Rect, clientX: number): number {
    if (rect.width <= 0) {
        return 0;
    }
    return clamp((clientX - rect.left) / rect.width, 0, 1);
}

/** Fraction 0..1 of clientY down the rect's height (clamped). */
export function fracY(rect: Rect, clientY: number): number {
    if (rect.height <= 0) {
        return 0;
    }
    return clamp((clientY - rect.top) / rect.height, 0, 1);
}

/** SV area: X→saturation (0..100), Y→value (100 at top, 0 at bottom). */
export function svFromPointer(rect: Rect, clientX: number, clientY: number): { s: number; v: number } {
    return { s: fracX(rect, clientX) * 100, v: (1 - fracY(rect, clientY)) * 100 };
}

/** Horizontal hue bar: X→hue 0..360. */
export function hueFromPointer(rect: Rect, clientX: number): number {
    return fracX(rect, clientX) * 360;
}

/** Horizontal alpha bar: X→alpha 0..1. */
export function alphaFromPointer(rect: Rect, clientX: number): number {
    return fracX(rect, clientX);
}
