import * as React from 'react';
import { ColorLabels } from '../../shared/labels/color';
import { ColorDragKind } from './colorDragController';
import { formatHex, HSV, hsvToRgb, isLight } from './colorLogic';

export interface ColorPanelProps {
    hsv: HSV;
    alpha: number;
    showAlpha: boolean;
    labels: ColorLabels;
    /** Parent maps this to a drag: it reads e.currentTarget as the surface. */
    onSurfacePointerDown: (kind: ColorDragKind, e: React.PointerEvent) => void;
}

/**
 * The picker's visual selection surfaces: the saturation/value area, the hue
 * bar and (optionally) the alpha bar. Purely presentational — geometry and
 * state live in the parent + colorGeometry/colorDragController. Thumb positions
 * are plain percentages, so no measurement happens here.
 */
export function ColorPanel(props: ColorPanelProps): JSX.Element {
    const { hsv, alpha, showAlpha, labels, onSurfacePointerDown } = props;
    const pureHue = formatHex({ rgb: hsvToRgb({ h: hsv.h, s: 100, v: 100 }), alpha: 1 }, false);
    const opaque = formatHex({ rgb: hsvToRgb(hsv), alpha: 1 }, false);
    const thumbClass = (rgbLight: boolean): string =>
        'mustry-cp-thumb' + (rgbLight ? ' mustry-cp-thumb--on-light' : '');

    const svThumb: React.CSSProperties = { left: `${hsv.s}%`, top: `${100 - hsv.v}%` };
    const hueThumb: React.CSSProperties = { left: `${(hsv.h / 360) * 100}%` };
    const alphaThumb: React.CSSProperties = { left: `${alpha * 100}%` };

    return (
        <div className="mustry-cp-panel">
            <div
                className="mustry-cp-sv"
                role="slider"
                aria-label={labels.saturation}
                aria-valuetext={`S ${Math.round(hsv.s)}%, V ${Math.round(hsv.v)}%`}
                style={{ backgroundColor: pureHue }}
                onPointerDown={(e) => onSurfacePointerDown('sv', e)}
            >
                <div className="mustry-cp-sv-white" />
                <div className="mustry-cp-sv-black" />
                <span
                    className={thumbClass(isLight(hsvToRgb(hsv)))}
                    style={svThumb}
                />
            </div>

            <div
                className="mustry-cp-hue"
                role="slider"
                aria-label={labels.hue}
                aria-valuenow={Math.round(hsv.h)}
                aria-valuemin={0}
                aria-valuemax={360}
                onPointerDown={(e) => onSurfacePointerDown('hue', e)}
            >
                <span className={thumbClass(true)} style={hueThumb} />
            </div>

            {showAlpha && (
                <div
                    className="mustry-cp-alpha"
                    role="slider"
                    aria-label={labels.alpha}
                    aria-valuenow={Math.round(alpha * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    onPointerDown={(e) => onSurfacePointerDown('alpha', e)}
                >
                    <div
                        className="mustry-cp-alpha-fill"
                        style={{ background: `linear-gradient(to right, transparent, ${opaque})` }}
                    />
                    <span className={thumbClass(true)} style={alphaThumb} />
                </div>
            )}
        </div>
    );
}
