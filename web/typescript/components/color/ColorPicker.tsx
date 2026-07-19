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
    Color, formatColor, formatHex, isLight, parseColor, rgbToHsl, round
} from './colorLogic';
import { ColorPickerProps, mapColorProps } from './colorProps';

// Must match ColorPicker.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.input.colorpicker';

interface ColorPickerState {
    /** The text field's live buffer while typing (null = mirror the bound value). */
    editing: string | null;
    /** Whether `editing` currently parses (drives the invalid affordance). */
    editValid: boolean;
}

/**
 * Colour picker. CONTROLLED, read-from-value: `value.color` is the bound truth.
 * User picks (this milestone: typing a hex/rgb/hsl string; the HSV panel and
 * popover arrive in later milestones) write the canonical string back to
 * `value.color`, fire `onChange`, and refresh the read-only `output.*` values.
 *
 * All colour maths lives in the pure, node-tested colorLogic.ts; this class is
 * the thin DOM/Perspective shell around it.
 */
export class ColorPicker extends Component<ComponentProps<ColorPickerProps>, ColorPickerState> {

    constructor(props: ComponentProps<ColorPickerProps>) {
        super(props);
        this.state = { editing: null, editValid: true };
    }

    componentDidMount(): void {
        this.emitOutputs(this.props.props.color);
    }

    componentDidUpdate(prev: ComponentProps<ColorPickerProps>): void {
        const p = this.props.props;
        if (p.color !== prev.props.color || p.format !== prev.props.format || p.showAlpha !== prev.props.showAlpha) {
            this.emitOutputs(p.color);
            // An external rebind supersedes whatever the user was mid-typing.
            if (p.color !== prev.props.color && this.state.editing !== null) {
                this.setState({ editing: null, editValid: true });
            }
        }
    }

    // --- outputs & events ---------------------------------------------------

    /** The current bound colour, parsed; opaque black when unset/invalid. */
    private current(): Color {
        return parseColor(this.props.props.color) || { rgb: { r: 0, g: 0, b: 0 }, alpha: 1 };
    }

    private emitOutputs(raw: string): void {
        const parsed = parseColor(raw);
        const color = parsed || { rgb: { r: 0, g: 0, b: 0 }, alpha: 1 };
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
        const p = this.props.props;
        const value = formatColor(color, p.format, p.showAlpha);
        this.props.store.props.write('value.color', value);
        this.emitOutputs(value);
        this.fireEvent('onChange', {
            value,
            hex: formatHex(color, p.showAlpha),
            rgb: { ...color.rgb },
            hsl: this.hslOut(color),
            alpha: round(color.alpha, 3)
        });
    }

    private editable(): boolean {
        return this.props.props.enabled;
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
            this.commit(parsed);
        }
        // Snap back to the canonical rendering (valid or not, stop editing).
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

    private displayText(): string {
        if (this.state.editing !== null) {
            return this.state.editing;
        }
        if (this.props.props.color.trim() === '') {
            return '';
        }
        return formatColor(this.current(), this.props.props.format, this.props.props.showAlpha);
    }

    render() {
        const p = this.props.props;
        const color = this.current();
        const unset = p.color.trim() === '';
        // Drive the swatch overlay colour through a CSS custom property so the
        // checkerboard base (scss) shows through partial alpha.
        const swatchStyle = {
            ['--cp-swatch-color']: unset ? 'transparent' : formatHex(color, true)
        } as React.CSSProperties;
        const classes = ['mustry-colorpicker'];
        classes.push(p.mode === 'inline' ? 'mustry-cp--inline' : 'mustry-cp--popover');
        if (!p.enabled) {
            classes.push('mustry-cp--disabled');
        }
        if (!unset && isLight(color.rgb)) {
            classes.push('mustry-cp--light');
        }

        return (
            <div {...this.props.emit({ classes })}>
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
                            placeholder={p.labels.hex}
                            onChange={this.onInputChange}
                            onBlur={this.onInputCommit}
                            onKeyDown={this.onInputKeyDown}
                        />
                    )}
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
        return { width: 220, height: 40 };
    }

    getPropsReducer(tree: PropertyTree): ColorPickerProps {
        return mapColorProps(tree);
    }
}
