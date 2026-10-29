// Where the Halo mode's rings sit. Shared by the shader (gl/halo.ts) and the
// DOM labels in IdleGuard.tsx so the two always agree. Pure; node-tested.

/** Inner and outer ring radius as a fraction of min(viewport width, height). */
export const HALO_INNER = 0.2;
export const HALO_OUTER = 0.47;
/** The largest gap between rings, so two lines do not float far apart. */
export const HALO_MAX_STEP = 0.055;

/** How far the whole halo drifts (burn-in care), in viewport fractions per axis. */
export const HALO_DRIFT = { x: 0.04, y: 0.03 };

/** Ring radii (fraction of min(w, h)) for n lines, innermost first. */
export function haloRadii(n: number): number[] {
    if (n <= 0) {
        return [];
    }
    if (n === 1) {
        return [HALO_INNER + 0.06];
    }
    const step = Math.min(HALO_MAX_STEP, (HALO_OUTER - HALO_INNER) / (n - 1));
    return Array.from({ length: n }, (_, i) => HALO_INNER + step * i);
}

/** The angle (radians, counter-clockwise from 3 o'clock) at which each ring's label sits. */
export const HALO_LABEL_ANGLE = (3 * Math.PI) / 4;
