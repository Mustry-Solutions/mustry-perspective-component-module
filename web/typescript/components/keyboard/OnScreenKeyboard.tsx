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
    applyKey, clampValue, formatValue, inRange, KeypadKey, parseDraft, valueToDraft
} from './keyboardLogic';
import { appendChar, backspaceText, getRows, KeyDef, KeyLayer, TextLayout } from './keyboardLayouts';
import { KeypadKeys } from './KeypadKeys';
import { KeyboardKeys } from './KeyboardKeys';
import { KeyboardProps, mapKeyboardProps } from './keyboardProps';

// Must match Keyboard.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.input.keyboard';

interface KeyboardState {
    /** Draft string while typing (null = show the committed value). Numeric OR text. */
    draft: string | null;
    /** Text keyboard: active key layer. */
    layer: KeyLayer;
    /** Text keyboard: shift active (one-shot — resets after a letter). */
    shift: boolean;
}

/**
 * On-Screen Keyboard — a touch keyboard whose value display is a <div>, NOT an
 * <input>, so tapping it never summons the OS on-screen keyboard (the
 * "double-keyboard" problem Perspective's native entry fields have on touch).
 *
 * Two families of layout share one controlled shell:
 *  - 'numpad' — a numeric keypad editing value.value (number): min/max clamp,
 *    decimals, units. Enter fires onCommit {value, text, isValid}.
 *  - 'text' / 'email' / 'url' — a QWERTY keyboard editing value.text (string),
 *    with shift + a symbols layer. Enter fires onCommit {value, text, isValid}
 *    (value is the string here).
 * All editing rules are pure (keyboardLogic / keyboardLayouts); this is the shell.
 */
export class OnScreenKeyboard extends Component<ComponentProps<KeyboardProps>, KeyboardState> {

    constructor(props: ComponentProps<KeyboardProps>) {
        super(props);
        this.state = { draft: null, layer: 'letters', shift: false };
    }

    componentDidMount(): void {
        this.emitOutputs(null);
    }

    componentDidUpdate(prev: ComponentProps<KeyboardProps>): void {
        const p = this.props.props;
        const q = prev.props;
        const boundChanged = this.isNumeric() ? p.value !== q.value : p.text !== q.text;
        if (boundChanged || p.layout !== q.layout) {
            // An external rebind (or a layout switch) supersedes an in-progress edit.
            this.setState({ draft: null });
            this.emitOutputs(null);
        } else if (p.decimals !== q.decimals || p.units !== q.units || p.enforceRange !== q.enforceRange
            || p.min !== q.min || p.max !== q.max || p.maxLength !== q.maxLength) {
            this.emitOutputs(this.state.draft);
        }
    }

    // --- mode helpers -------------------------------------------------------

    private isNumeric(): boolean {
        return this.props.props.layout === 'numpad';
    }

    private isEditing(): boolean {
        return this.state.draft !== null;
    }

    private editable(): boolean {
        return this.props.props.enabled;
    }

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    // --- outputs ------------------------------------------------------------

    /** Emit output.* for whichever mode is active. Draft is the in-progress string. */
    private emitOutputs(draft: string | null): void {
        const p = this.props.props;
        const w = this.props.store.props;
        // output.value is written LAST so a transform bound to it reads settled siblings.
        if (this.isNumeric()) {
            const value = this.committedNumber();
            w.write('output.text', formatValue(value, p.decimals, p.units));
            w.write('output.isValid', this.numberValid(value));
            w.write('output.length', String(value).length);
            w.write('output.draft', draft || '');
            w.write('output.value', value);
        } else {
            const text = p.text;
            const asNum = text.trim() !== '' && isFinite(Number(text)) ? Number(text) : 0;
            w.write('output.text', text);
            w.write('output.isValid', p.maxLength <= 0 || text.length <= p.maxLength);
            w.write('output.length', text.length);
            w.write('output.draft', draft || '');
            w.write('output.value', asNum);
        }
    }

    // --- numeric mode -------------------------------------------------------

    private committedNumber(): number {
        const p = this.props.props;
        return p.enforceRange ? clampValue(p.value, p.min, p.max) : p.value;
    }

    private numberValid(value: number): boolean {
        const p = this.props.props;
        return p.enforceRange ? inRange(value, p.min, p.max) : true;
    }

    /** Unclamped value the numeric draft/bound state represents (for the badge). */
    private rawNumber(): number {
        const p = this.props.props;
        const parsed = this.isEditing() ? parseDraft(this.state.draft as string) : p.value;
        return parsed === null ? p.value : parsed;
    }

    private onKeypadKey = (key: KeypadKey): void => {
        if (!this.editable()) {
            return;
        }
        const p = this.props.props;
        // First key starts a FRESH entry (setpoint semantics); backspace instead
        // seeds from the current value so it can be trimmed.
        const base = this.isEditing()
            ? (this.state.draft as string)
            : (key === 'backspace' ? valueToDraft(p.value, p.decimals) : '');
        const draft = applyKey(base, key, { decimals: p.decimals, allowNegative: p.allowNegative });
        this.setState({ draft });

        const parsed = parseDraft(draft);
        this.props.store.props.write('output.draft', draft);
        this.fireEvent('onChange', { draft, value: parsed });
        if (p.liveUpdate && parsed !== null) {
            this.props.store.props.write('value.value', p.enforceRange ? clampValue(parsed, p.min, p.max) : parsed);
        }
    };

    private onNumericEnter = (): void => {
        if (!this.editable() || !this.isEditing()) {
            return;
        }
        const p = this.props.props;
        const parsed = parseDraft(this.state.draft as string);
        if (parsed === null) {
            this.setState({ draft: null });
            return;
        }
        const value = p.enforceRange ? clampValue(parsed, p.min, p.max) : parsed;
        this.props.store.props.write('value.value', value);
        this.setState({ draft: null }, () => this.emitOutputs(null));
        this.fireEvent('onCommit', { value, text: formatValue(value, p.decimals, p.units), isValid: this.numberValid(value) });
    };

    // --- text mode ----------------------------------------------------------

    private textLayout(): TextLayout {
        const l = this.props.props.layout;
        return l === 'email' || l === 'url' ? l : 'text';
    }

    private onTextKey = (k: KeyDef): void => {
        if (!this.editable()) {
            return;
        }
        if (k.action === 'shift') {
            this.setState((s) => ({ shift: !s.shift }));
            return;
        }
        if (k.action === 'layer') {
            this.setState({ layer: k.layer || 'letters', shift: false });
            return;
        }
        if (k.action === 'enter') {
            this.onTextEnter();
            return;
        }
        const p = this.props.props;
        const base = this.isEditing() ? (this.state.draft as string) : p.text;
        let draft = base;
        if (k.action === 'backspace') {
            draft = backspaceText(base);
        } else if ((k.action === 'char' || k.action === 'space') && k.value !== undefined) {
            draft = appendChar(base, k.value, p.maxLength);
        }
        // One-shot shift: a letter press consumes shift.
        const resetShift = this.state.shift && k.action === 'char';
        this.setState({ draft, shift: resetShift ? false : this.state.shift });

        this.props.store.props.write('output.draft', draft);
        this.fireEvent('onChange', { draft, value: draft });
        if (p.liveUpdate) {
            this.props.store.props.write('value.text', draft);
        }
    };

    private onTextEnter(): void {
        if (!this.editable() || !this.isEditing()) {
            return;
        }
        const p = this.props.props;
        const text = this.state.draft as string;
        this.props.store.props.write('value.text', text);
        this.setState({ draft: null }, () => this.emitOutputs(null));
        this.fireEvent('onCommit', {
            value: text,
            text,
            isValid: p.maxLength <= 0 || text.length <= p.maxLength
        });
    }

    // --- render -------------------------------------------------------------

    private numericDisplay(): string {
        const p = this.props.props;
        if (this.isEditing()) {
            const d = this.state.draft as string;
            return p.units ? `${d} ${p.units}` : d;
        }
        return formatValue(p.value, p.decimals, p.units);
    }

    private textDisplay(): string {
        return this.isEditing() ? (this.state.draft as string) : this.props.props.text;
    }

    render() {
        const p = this.props.props;
        const numeric = this.isNumeric();
        const outOfRange = numeric && p.enforceRange && !this.numberValid(this.rawNumber());
        const display = numeric ? this.numericDisplay() : this.textDisplay();

        const classes = ['mustry-keyboard', numeric ? 'mustry-kbd--numpad' : 'mustry-kbd--text'];
        if (!p.enabled) {
            classes.push('mustry-kbd--disabled');
        }

        return (
            <div {...this.props.emit({ classes })}>
                {p.showValue && (
                    <div
                        className={'mustry-kbd-display'
                            + (numeric ? '' : ' mustry-kbd-display--left')
                            + (outOfRange ? ' mustry-kbd-display--invalid' : '')}
                        role="textbox"
                        aria-readonly="true"
                        aria-label={display}
                    >
                        <span className="mustry-kbd-value">{display}</span>
                        {outOfRange && <span className="mustry-kbd-range">{p.labels.outOfRange}</span>}
                    </div>
                )}
                {numeric ? (
                    <KeypadKeys
                        labels={p.labels}
                        enabled={p.enabled}
                        allowDecimal={p.decimals > 0}
                        allowNegative={p.allowNegative}
                        onKey={this.onKeypadKey}
                        onEnter={this.onNumericEnter}
                    />
                ) : (
                    <KeyboardKeys
                        rows={getRows(this.textLayout(), this.state.layer, this.state.shift, p.labels.enter)}
                        shiftActive={this.state.shift}
                        enabled={p.enabled}
                        onKey={this.onTextKey}
                    />
                )}
            </div>
        );
    }
}

export class OnScreenKeyboardMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return OnScreenKeyboard as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        // Numpad default; text layouts want a wider box (authors resize).
        return { width: 240, height: 320 };
    }

    getPropsReducer(tree: PropertyTree): KeyboardProps {
        return mapKeyboardProps(tree);
    }
}
