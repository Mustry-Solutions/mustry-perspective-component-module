import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import {
    Color, ColorFormat, formatColor, formatHex, HSV, hsvToRgb, isLight, parseColor,
    rgbToHsl, rgbToHsv, round
} from './colorLogic';
import { alphaFromPointer, hueFromPointer, svFromPointer } from './colorGeometry';
import { ColorDragController, ColorDragHost, ColorDragKind } from './colorDragController';
import { ColorPanel } from './ColorPanel';
import { ColorPickerProps, mapColorProps } from './colorProps';

// Must match ColorPicker.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.input.colorpicker';

const BLACK: Color = { rgb: { r: 0, g: 0, b: 0 }, alpha: 1 };
const FORMATS: ColorFormat[] = ['hex', 'rgb', 'hsl'];

interface ColorPickerState {
    /** The text field's live buffer while typing (null = mirror the bound value). */
    editing: string | null;
    /** Whether `editing` currently parses (drives the invalid affordance). */
    editValid: boolean;
    /** Live working copy while a surface is being dragged (null = mirror value). */
    work: { hsv: HSV; alpha: number } | null;
    /** Runtime display/output format (seeded from config.format, user-togglable). */
    fmt: ColorFormat;
}

/**
 * Colour picker. CONTROLLED, read-from-value: `value.color` is the bound truth.
 * The HSV area + hue/alpha bars edit a live local working copy (so hue survives
 * passing through greys/black); releasing a drag — or committing the text field
 * — writes the canonical string back to `value.color`, fires `onChange`, and
 * refreshes the read-only `output.*` values.
 *
 * All colour maths lives in the pure, node-tested colorLogic/colorGeometry; the
 * continuous drag lives in the thin colorDragController. This class is the shell.
 */
export class ColorPicker extends Component<ComponentProps<ColorPickerProps>, ColorPickerState>
    implements ColorDragHost {

    private drag = new ColorDragController(this);

    constructor(props: ComponentProps<ColorPickerProps>) {
        super(props);
        this.state = { editing: null, editValid: true, work: null, fmt: props.props.format };
    }

    componentDidMount(): void {
        this.emitOutputs(this.props.props.color);
    }

    componentWillUnmount(): void {
        this.drag.dispose();
    }

    componentDidUpdate(prev: ComponentProps<ColorPickerProps>): void {
        const p = this.props.props;
        if (p.color !== prev.props.color || p.showAlpha !== prev.props.showAlpha) {
            this.emitOutputs(p.color);
        }
        if (p.color !== prev.props.color) {
            // An external rebind supersedes any in-progress edit or drag.
            const reset: Partial<ColorPickerState> = { work: null };
            if (this.state.editing !== null) {
                reset.editing = null;
                reset.editValid = true;
            }
            this.setState(reset as ColorPickerState);
        }
        // The author changing config.format re-seeds the runtime format.
        if (p.format !== prev.props.format) {
            this.setState({ fmt: p.format });
        }
    }

    // --- current colour -----------------------------------------------------

    /** The bound colour, parsed; opaque black when unset/invalid. */
    private bound(): Color {
        return parseColor(this.props.props.color) || BLACK;
    }

    /** The colour to DISPLAY: the live drag working copy if any, else the bound value. */
    private displayColor(): Color {
        if (this.state.work) {
            return { rgb: hsvToRgb(this.state.work.hsv), alpha: this.state.work.alpha };
        }
        return this.bound();
    }

    /** The HSV+alpha the panel thumbs read from (working copy, else derived from value). */
    private working(): { hsv: HSV; alpha: number } {
        if (this.state.work) {
            return this.state.work;
        }
        const c = this.bound();
        return { hsv: rgbToHsv(c.rgb), alpha: c.alpha };
    }

    // --- outputs & events ---------------------------------------------------

    private emitOutputs(raw: string): void {
        const parsed = parseColor(raw);
        const color = parsed || BLACK;
        const w = this.props.store.props;
        w.write('output.hex', formatHex(color, this.props.props.showAlpha));
        w.write('output.rgb', { ...color.rgb });
        w.write('output.hsl', this.hslOut(color));
        w.write('output.alpha', round(color.alpha, 3));
        w.write('output.isValid', parsed !== null);
    }

    private hslOut(color: Color): { h: number; s: number; l: number } {
        const hsl = rgbToHsl(color.rgb);
        return { h: Math.round(hsl.h), s: Math.round(hsl.s), l: Math.round(hsl.l) };
    }

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    /** Commit a picked colour: write the canonical value back and notify. */
    private commit(color: Color): void {
        const value = formatColor(color, this.state.fmt, this.props.props.showAlpha);
        this.props.store.props.write('value.color', value);
        this.emitOutputs(value);
        this.fireEvent('onChange', {
            value,
            hex: formatHex(color, this.props.props.showAlpha),
            rgb: { ...color.rgb },
            hsl: this.hslOut(color),
            alpha: round(color.alpha, 3)
        });
    }

    private editable(): boolean {
        return this.props.props.enabled;
    }

    // --- drag surfaces (ColorDragHost) --------------------------------------

    private onSurfacePointerDown = (kind: ColorDragKind, e: React.PointerEvent): void => {
        if (!this.editable()) {
            return;
        }
        this.drag.begin(kind, e.currentTarget as HTMLElement, e);
    };

    onDrag(kind: ColorDragKind, clientX: number, clientY: number, rect: DOMRect): void {
        const w = this.working();
        let next: { hsv: HSV; alpha: number };
        if (kind === 'sv') {
            next = { hsv: { ...w.hsv, ...svFromPointer(rect, clientX, clientY) }, alpha: w.alpha };
        } else if (kind === 'hue') {
            next = { hsv: { ...w.hsv, h: hueFromPointer(rect, clientX) }, alpha: w.alpha };
        } else {
            next = { hsv: w.hsv, alpha: alphaFromPointer(rect, clientX) };
        }
        // Live local update only — no store write / event until the drag ends.
        this.setState({ work: next });
    }

    onDragEnd(): void {
        if (this.state.work) {
            this.commit({ rgb: hsvToRgb(this.state.work.hsv), alpha: this.state.work.alpha });
            // Keep `work` so the thumbs stay put (avoids hue-loss on rederive).
        }
    }

    // --- text field ---------------------------------------------------------

    private onInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const text = e.target.value;
        this.setState({ editing: text, editValid: text.trim() === '' || parseColor(text) !== null });
    };

    private onInputCommit = (): void => {
        const text = this.state.editing;
        if (text === null) {
            return;
        }
        const parsed = parseColor(text);
        if (parsed) {
            this.setState({ work: null }); // typed value wins over any stale thumb copy
            this.commit(parsed);
        }
        this.setState({ editing: null, editValid: true });
    };

    private onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.onInputCommit();
        } else if (e.key === 'Escape') {
            this.setState({ editing: null, editValid: true });
        }
    };

    private setFmt(fmt: ColorFormat): void {
        // Display/output format only — doesn't rewrite value.color until the next pick.
        this.setState({ fmt, editing: null, editValid: true });
    }

    private displayText(): string {
        if (this.state.editing !== null) {
            return this.state.editing;
        }
        if (this.props.props.color.trim() === '' && !this.state.work) {
            return '';
        }
        return formatColor(this.displayColor(), this.state.fmt, this.props.props.showAlpha);
    }

    // --- render -------------------------------------------------------------

    private renderControl(unset: boolean): JSX.Element {
        const p = this.props.props;
        const swatchStyle = {
            ['--cp-swatch-color']: unset ? 'transparent' : formatHex(this.displayColor(), true)
        } as React.CSSProperties;
        return (
            <div className="mustry-cp-control">
                <span
                    className={'mustry-cp-swatch' + (unset ? ' mustry-cp-swatch--empty' : '')}
                    style={swatchStyle}
                    aria-label={this.displayText() || p.labels.clear}
                />
                {p.showInput && (
                    <input
                        className={'mustry-cp-input' + (this.state.editValid ? '' : ' mustry-cp-input--invalid')}
                        type="text"
                        value={this.displayText()}
                        disabled={!this.editable()}
                        spellCheck={false}
                        placeholder={p.labels[this.state.fmt]}
                        onChange={this.onInputChange}
                        onBlur={this.onInputCommit}
                        onKeyDown={this.onInputKeyDown}
                    />
                )}
            </div>
        );
    }

    private renderFormatToggle(): JSX.Element {
        const p = this.props.props;
        return (
            <div className="mustry-cp-fmt" role="group" aria-label="format">
                {FORMATS.map((f) => (
                    <button
                        key={f}
                        type="button"
                        className={'mustry-cp-fmt-btn' + (this.state.fmt === f ? ' is-active' : '')}
                        disabled={!this.editable()}
                        onClick={() => this.setFmt(f)}
                    >
                        {p.labels[f]}
                    </button>
                ))}
            </div>
        );
    }

    render() {
        const p = this.props.props;
        const unset = p.color.trim() === '' && !this.state.work;
        const display = this.displayColor();
        const classes = ['mustry-colorpicker'];
        classes.push(p.mode === 'inline' ? 'mustry-cp--inline' : 'mustry-cp--popover');
        if (!p.enabled) {
            classes.push('mustry-cp--disabled');
        }
        if (!unset && isLight(display.rgb)) {
            classes.push('mustry-cp--light');
        }

        // Popover mode still renders just the trigger control this milestone;
        // the panel opens on click in M2. Inline mode shows the full panel now.
        if (p.mode !== 'inline') {
            return <div {...this.props.emit({ classes })}>{this.renderControl(unset)}</div>;
        }

        const w = this.working();
        return (
            <div {...this.props.emit({ classes })}>
                <div className="mustry-cp-body">
                    <ColorPanel
                        hsv={w.hsv}
                        alpha={w.alpha}
                        showAlpha={p.showAlpha}
                        labels={p.labels}
                        onSurfacePointerDown={this.onSurfacePointerDown}
                    />
                    <div className="mustry-cp-footer">
                        {this.renderFormatToggle()}
                        {this.renderControl(unset)}
                    </div>
                </div>
            </div>
        );
    }
}

export class ColorPickerMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return ColorPicker as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        // Matches the default (popover) mode's trigger; inline instances resize up.
        return { width: 224, height: 40 };
    }

    getPropsReducer(tree: PropertyTree): ColorPickerProps {
        return mapColorProps(tree);
    }
}
