import * as React from 'react';
import * as ReactDOM from 'react-dom';
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
    parseColorOr, rgbToHsl, rgbToHsv, round
} from './colorLogic';
import { alphaFromPointer, hueFromPointer, svFromPointer } from './colorGeometry';
import { ColorDragController, ColorDragHost, ColorDragKind } from './colorDragController';
import { ColorPanel } from './ColorPanel';
import { ColorPickerProps, mapColorProps } from './colorProps';

// Must match ColorPicker.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.input.colorpicker';

const BLACK: Color = { rgb: { r: 0, g: 0, b: 0 }, alpha: 1 };
const FORMATS: ColorFormat[] = ['hex', 'rgb', 'hsl'];
const RECENT_MAX = 8;
const POPOVER_WIDTH = 248;

interface ColorPickerState {
    /** The text field's live buffer while typing (null = mirror the bound value). */
    editing: string | null;
    /** Whether `editing` currently parses (drives the invalid affordance). */
    editValid: boolean;
    /** Live working copy while a surface is being dragged (null = mirror value). */
    work: { hsv: HSV; alpha: number } | null;
    /** Runtime display/output format (seeded from config.format, user-togglable). */
    fmt: ColorFormat;
    /** Popover open (popover mode only). */
    open: boolean;
    panelTop: number;
    panelLeft: number;
    /** Recently committed colours (canonical hex), most-recent first. */
    recent: string[];
}

/**
 * Colour picker. CONTROLLED, read-from-value: `value.color` is the bound truth.
 * The HSV area + hue/alpha bars edit a live local working copy (so hue survives
 * passing through greys/black); releasing a drag — or clicking a swatch, using
 * the eyedropper, or committing the text field — writes the canonical string
 * back to `value.color`, fires `onChange`, and refreshes `output.*`.
 *
 * Inline mode renders the panel in place; popover mode renders a trigger and
 * portals the panel to <body> (mirrors DateTimeRangePicker's popover). All
 * colour maths lives in the pure colorLogic/colorGeometry; the continuous drag
 * in colorDragController. This class is the shell.
 */
export class ColorPicker extends Component<ComponentProps<ColorPickerProps>, ColorPickerState>
    implements ColorDragHost {

    private drag = new ColorDragController(this);
    private triggerEl: HTMLElement | null = null;
    private panelEl: HTMLElement | null = null;

    constructor(props: ComponentProps<ColorPickerProps>) {
        super(props);
        this.state = {
            editing: null, editValid: true, work: null, fmt: props.props.format,
            open: false, panelTop: 0, panelLeft: 0, recent: []
        };
    }

    componentDidMount(): void {
        this.emitOutputs(this.props.props.color);
    }

    componentWillUnmount(): void {
        this.drag.dispose();
        this.removeWindowListeners();
    }

    componentDidUpdate(prev: ComponentProps<ColorPickerProps>): void {
        const p = this.props.props;
        if (p.color !== prev.props.color || p.showAlpha !== prev.props.showAlpha) {
            this.emitOutputs(p.color);
        }
        if (p.color !== prev.props.color) {
            const reset: Partial<ColorPickerState> = { work: null };
            if (this.state.editing !== null) {
                reset.editing = null;
                reset.editValid = true;
            }
            this.setState(reset as ColorPickerState);
        }
        if (p.format !== prev.props.format) {
            this.setState({ fmt: p.format });
        }
        // A popover measured after opening flips above the trigger if needed.
        if (this.state.open) {
            this.adjustPanelPosition();
        }
    }

    // --- current colour -----------------------------------------------------

    private bound(): Color {
        return parseColor(this.props.props.color) || BLACK;
    }

    private displayColor(): Color {
        if (this.state.work) {
            return { rgb: hsvToRgb(this.state.work.hsv), alpha: this.state.work.alpha };
        }
        return this.bound();
    }

    private working(): { hsv: HSV; alpha: number } {
        if (this.state.work) {
            return this.state.work;
        }
        const c = this.bound();
        return { hsv: rgbToHsv(c.rgb), alpha: c.alpha };
    }

    private isUnset(): boolean {
        return this.props.props.color.trim() === '' && !this.state.work;
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

    /** Commit a picked colour: write the canonical value back, remember it, notify. */
    private commit(color: Color): void {
        const value = formatColor(color, this.state.fmt, this.props.props.showAlpha);
        this.props.store.props.write('value.color', value);
        this.emitOutputs(value);
        this.pushRecent(formatHex(color, this.props.props.showAlpha));
        this.fireEvent('onChange', {
            value,
            hex: formatHex(color, this.props.props.showAlpha),
            rgb: { ...color.rgb },
            hsl: this.hslOut(color),
            alpha: round(color.alpha, 3)
        });
    }

    private pushRecent(hex: string): void {
        this.setState((s) => ({
            recent: [hex, ...s.recent.filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, RECENT_MAX)
        }));
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
        this.setState({ work: next });
    }

    onDragEnd(): void {
        if (this.state.work) {
            this.commit({ rgb: hsvToRgb(this.state.work.hsv), alpha: this.state.work.alpha });
        }
    }

    // --- quick picks (swatches / recent / eyedropper) -----------------------

    private pickColor(raw: string): void {
        const parsed = parseColor(raw);
        if (parsed) {
            this.setState({ work: null, editing: null, editValid: true });
            this.commit(parsed);
        }
    }

    private eyedropperAvailable(): boolean {
        return typeof (window as unknown as { EyeDropper?: unknown }).EyeDropper === 'function';
    }

    private openEyedropper = (): void => {
        const Ctor = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
        if (!Ctor) {
            return;
        }
        new Ctor().open().then(
            (res) => this.pickColor(res.sRGBHex),
            () => { /* user cancelled — no-op */ }
        );
    };

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
            this.setState({ work: null });
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
        this.setState({ fmt, editing: null, editValid: true });
    }

    private displayText(): string {
        if (this.state.editing !== null) {
            return this.state.editing;
        }
        if (this.isUnset()) {
            return '';
        }
        return formatColor(this.displayColor(), this.state.fmt, this.props.props.showAlpha);
    }

    // --- popover ------------------------------------------------------------

    private setTriggerEl = (el: HTMLElement | null): void => { this.triggerEl = el; };
    private setPanelEl = (el: HTMLElement | null): void => { this.panelEl = el; };

    private addWindowListeners(): void {
        window.addEventListener('mousedown', this.onOutsidePointer, true);
        window.addEventListener('keydown', this.onKeyDown, true);
        window.addEventListener('resize', this.reposition, true);
        window.addEventListener('scroll', this.reposition, true);
    }

    private removeWindowListeners(): void {
        window.removeEventListener('mousedown', this.onOutsidePointer, true);
        window.removeEventListener('keydown', this.onKeyDown, true);
        window.removeEventListener('resize', this.reposition, true);
        window.removeEventListener('scroll', this.reposition, true);
    }

    private togglePanel = (): void => {
        if (!this.editable()) {
            return;
        }
        if (this.state.open) {
            this.closePanel();
        } else {
            this.computeBasePosition();
            this.setState({ open: true });
            this.addWindowListeners();
        }
    };

    private closePanel(): void {
        if (!this.state.open) {
            return;
        }
        this.removeWindowListeners();
        this.setState({ open: false });
    }

    private onOutsidePointer = (e: MouseEvent): void => {
        const t = e.target as Node;
        if ((this.panelEl && this.panelEl.contains(t)) || (this.triggerEl && this.triggerEl.contains(t))) {
            return;
        }
        this.closePanel();
    };

    private onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            this.closePanel();
        }
    };

    private reposition = (): void => {
        if (this.state.open) {
            this.adjustPanelPosition();
        }
    };

    private popoverWidth(): number {
        return Math.min(POPOVER_WIDTH, window.innerWidth - 16);
    }

    private computeBasePosition(): void {
        const el = this.triggerEl;
        if (!el) {
            return;
        }
        const rect = el.getBoundingClientRect();
        const width = this.popoverWidth();
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        this.setState({ panelTop: rect.bottom + 4, panelLeft: left });
    }

    private adjustPanelPosition(): void {
        const trigger = this.triggerEl;
        const panel = this.panelEl;
        if (!trigger || !panel) {
            return;
        }
        const rect = trigger.getBoundingClientRect();
        const h = panel.getBoundingClientRect().height;
        const gap = 4;
        const width = this.popoverWidth();
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        let top = rect.bottom + gap;
        if (top + h > window.innerHeight && rect.top - gap - h >= 0) {
            top = rect.top - gap - h;
        }
        if (top !== this.state.panelTop || left !== this.state.panelLeft) {
            this.setState({ panelTop: top, panelLeft: left });
        }
    }

    // --- render helpers -----------------------------------------------------

    private renderControl(asTrigger: boolean): JSX.Element {
        const p = this.props.props;
        const unset = this.isUnset();
        const swatchStyle = {
            ['--cp-swatch-color']: unset ? 'transparent' : formatHex(this.displayColor(), true)
        } as React.CSSProperties;
        const rootProps = asTrigger ? { ref: this.setTriggerEl } : {};
        return (
            <div className={'mustry-cp-control' + (asTrigger ? ' mustry-cp-control--trigger' : '')} {...rootProps}>
                <button
                    type="button"
                    className={'mustry-cp-swatch' + (unset ? ' mustry-cp-swatch--empty' : '')
                        + (asTrigger ? ' mustry-cp-swatch--trigger' : '')}
                    style={swatchStyle}
                    disabled={!this.editable()}
                    aria-label={this.displayText() || p.labels.clear}
                    aria-haspopup={asTrigger ? 'dialog' : undefined}
                    aria-expanded={asTrigger ? this.state.open : undefined}
                    onClick={asTrigger ? this.togglePanel : undefined}
                >
                    {asTrigger && (
                        // A picker glyph over the colour signals the swatch is a
                        // control that opens the panel (the colour stays the
                        // background). Contrast is handled in scss via the light class.
                        <svg className="mustry-cp-swatch-pick" viewBox="0 0 16 16" aria-hidden="true">
                            <path fill="currentColor" d="M11.4 1.6a2 2 0 0 1 2.9 2.8l-1.6 1.6.5.5-1 1-.6-.6-4.7 4.7c-.2.2-.4.3-.6.3l-2.4.5.5-2.4c0-.2.1-.4.3-.6l4.7-4.7-.6-.6 1-1 .5.5 1.6-1.6z"/>
                        </svg>
                    )}
                </button>
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

    private renderEyedropper(): JSX.Element {
        return (
            <button
                type="button"
                className="mustry-cp-eyedropper"
                disabled={!this.editable()}
                title={this.props.props.labels.eyedropper}
                aria-label={this.props.props.labels.eyedropper}
                onClick={this.openEyedropper}
            >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path fill="currentColor" d="M11.4 1.6a2 2 0 0 1 2.9 2.8l-1.6 1.6 0.5 0.5-1 1-0.6-0.6-4.7 4.7c-0.2 0.2-0.4 0.3-0.6 0.3l-2.4 0.5 0.5-2.4c0-0.2 0.1-0.4 0.3-0.6l4.7-4.7-0.6-0.6 1-1 0.5 0.5 1.6-1.6z"/>
                </svg>
            </button>
        );
    }

    private renderSwatchRow(label: string, colors: string[]): JSX.Element {
        return (
            <div className="mustry-cp-swatches">
                <div className="mustry-cp-swatches-label">{label}</div>
                <div className="mustry-cp-swatches-grid">
                    {colors.map((c, i) => {
                        const chipStyle = {
                            ['--cp-chip-color']: formatHex(parseColorOr(c), true)
                        } as React.CSSProperties;
                        return (
                            <button
                                key={`${c}-${i}`}
                                type="button"
                                className="mustry-cp-chip"
                                style={chipStyle}
                                title={c}
                                aria-label={c}
                                disabled={!this.editable()}
                                onClick={() => this.pickColor(c)}
                            />
                        );
                    })}
                </div>
            </div>
        );
    }

    /** The full picker body — reused inline and inside the popover portal. */
    private renderBody(): JSX.Element {
        const p = this.props.props;
        const w = this.working();
        const showEyedropper = p.showEyedropper && this.eyedropperAvailable();
        return (
            <div className="mustry-cp-body">
                <ColorPanel
                    hsv={w.hsv}
                    alpha={w.alpha}
                    showAlpha={p.showAlpha}
                    labels={p.labels}
                    onSurfacePointerDown={this.onSurfacePointerDown}
                />
                <div className="mustry-cp-footer">
                    <div className="mustry-cp-row">
                        {this.renderFormatToggle()}
                        {showEyedropper && this.renderEyedropper()}
                    </div>
                    {this.renderControl(false)}
                    {p.showSwatches && p.swatches.length > 0 && this.renderSwatchRow(p.labels.swatches, p.swatches)}
                    {p.showRecent && this.state.recent.length > 0 && this.renderSwatchRow(p.labels.recent, this.state.recent)}
                </div>
            </div>
        );
    }

    private renderPopover(): React.ReactNode {
        const style: React.CSSProperties = {
            position: 'fixed',
            top: this.state.panelTop,
            left: this.state.panelLeft,
            width: this.popoverWidth()
        };
        return ReactDOM.createPortal(
            <div className="mustry-cp-popover" ref={this.setPanelEl} style={style} role="dialog">
                {this.renderBody()}
            </div>,
            document.body
        );
    }

    render() {
        const p = this.props.props;
        const unset = this.isUnset();
        const display = this.displayColor();
        const classes = ['mustry-colorpicker'];
        classes.push(p.mode === 'inline' ? 'mustry-cp--inline' : 'mustry-cp--popover');
        if (!p.enabled) {
            classes.push('mustry-cp--disabled');
        }
        if (!unset && isLight(display.rgb)) {
            classes.push('mustry-cp--light');
        }

        if (p.mode === 'inline') {
            return <div {...this.props.emit({ classes })}>{this.renderBody()}</div>;
        }
        return (
            <div {...this.props.emit({ classes })}>
                {this.renderControl(true)}
                {this.state.open && this.renderPopover()}
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
