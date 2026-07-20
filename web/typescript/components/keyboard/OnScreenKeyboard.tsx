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
import { KeypadKeys } from './KeypadKeys';
import { KeyboardProps, mapKeyboardProps } from './keyboardProps';

// Must match Keyboard.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.input.keyboard';

interface KeyboardState {
    /** The draft string while the user is typing (null = show the committed value). */
    draft: string | null;
}

/**
 * On-Screen Keyboard — a touch numeric keypad whose value display is a <div>,
 * NOT an <input>, so tapping it does NOT summon the OS on-screen keyboard (the
 * "double-keyboard" problem Perspective's native entry fields have on touch).
 *
 * CONTROLLED, read-from-value: `value.value` is the bound truth. Tapping keys
 * builds a local draft; Enter parses + (optionally) clamps it, writes value.value
 * and fires onCommit. All editing rules are pure functions in keyboardLogic.
 * This milestone ships the numeric keypad; QWERTY layouts and popover mode follow.
 */
export class OnScreenKeyboard extends Component<ComponentProps<KeyboardProps>, KeyboardState> {

    constructor(props: ComponentProps<KeyboardProps>) {
        super(props);
        this.state = { draft: null };
    }

    componentDidMount(): void {
        this.emitOutputs(this.props.props.value, null);
    }

    componentDidUpdate(prev: ComponentProps<KeyboardProps>): void {
        const p = this.props.props;
        if (p.value !== prev.props.value) {
            // An external rebind supersedes an in-progress edit.
            this.setState({ draft: null });
            this.emitOutputs(p.value, null);
        } else if (p.decimals !== prev.props.decimals || p.units !== prev.props.units
            || p.enforceRange !== prev.props.enforceRange || p.min !== prev.props.min || p.max !== prev.props.max) {
            this.emitOutputs(p.value, this.state.draft);
        }
    }

    // --- value / outputs ----------------------------------------------------

    private isEditing(): boolean {
        return this.state.draft !== null;
    }

    /** The value the draft/bound state currently represents, UNclamped (so the
     *  out-of-range badge can warn before Enter clamps on commit). */
    private rawValue(): number {
        const p = this.props.props;
        const parsed = this.isEditing() ? parseDraft(this.state.draft as string) : p.value;
        return parsed === null ? p.value : parsed;
    }

    private validOf(value: number): boolean {
        const p = this.props.props;
        return p.enforceRange ? inRange(value, p.min, p.max) : true;
    }

    private emitOutputs(value: number, draft: string | null): void {
        const p = this.props.props;
        const w = this.props.store.props;
        // Write output.value LAST: authors commonly bind to it and read the
        // sibling output.* in a transform, so the others must already be settled.
        w.write('output.text', formatValue(value, p.decimals, p.units));
        w.write('output.isValid', this.validOf(value));
        w.write('output.draft', draft || '');
        w.write('output.value', value);
    }

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    private editable(): boolean {
        return this.props.props.enabled;
    }

    // --- key handling -------------------------------------------------------

    private onKey = (key: KeypadKey): void => {
        if (!this.editable()) {
            return;
        }
        const p = this.props.props;
        // First key when not editing starts a FRESH entry (setpoint semantics):
        // backspace instead seeds from the current value so it can be trimmed.
        const base = this.isEditing()
            ? (this.state.draft as string)
            : (key === 'backspace' ? valueToDraft(p.value, p.decimals) : '');
        const draft = applyKey(base, key, { decimals: p.decimals, allowNegative: p.allowNegative });
        this.setState({ draft });

        const parsed = parseDraft(draft);
        this.props.store.props.write('output.draft', draft);
        this.fireEvent('onChange', { draft, value: parsed });
        if (p.liveUpdate && parsed !== null) {
            const v = p.enforceRange ? clampValue(parsed, p.min, p.max) : parsed;
            this.props.store.props.write('value.value', v);
        }
    };

    private onEnter = (): void => {
        if (!this.editable() || !this.isEditing()) {
            return;
        }
        const p = this.props.props;
        const parsed = parseDraft(this.state.draft as string);
        if (parsed === null) {
            this.setState({ draft: null }); // nothing typed — just leave edit mode
            return;
        }
        const value = p.enforceRange ? clampValue(parsed, p.min, p.max) : parsed;
        this.props.store.props.write('value.value', value);
        this.emitOutputs(value, null);
        this.fireEvent('onCommit', {
            value,
            text: formatValue(value, p.decimals, p.units),
            isValid: this.validOf(value)
        });
        this.setState({ draft: null });
    };

    // --- render -------------------------------------------------------------

    private displayText(): string {
        const p = this.props.props;
        if (this.isEditing()) {
            const d = this.state.draft as string;
            return p.units ? `${d} ${p.units}` : d;
        }
        return formatValue(p.value, p.decimals, p.units);
    }

    render() {
        const p = this.props.props;
        const outOfRange = p.enforceRange && !this.validOf(this.rawValue());
        const classes = ['mustry-keyboard', 'mustry-kbd--numpad'];
        if (!p.enabled) {
            classes.push('mustry-kbd--disabled');
        }

        return (
            <div {...this.props.emit({ classes })}>
                {p.showValue && (
                    <div
                        className={'mustry-kbd-display' + (outOfRange ? ' mustry-kbd-display--invalid' : '')}
                        role="textbox"
                        aria-readonly="true"
                        aria-label={this.displayText()}
                    >
                        <span className="mustry-kbd-value">{this.displayText()}</span>
                        {outOfRange && <span className="mustry-kbd-range">{p.labels.outOfRange}</span>}
                    </div>
                )}
                <KeypadKeys
                    labels={p.labels}
                    enabled={p.enabled}
                    allowDecimal={p.decimals > 0}
                    allowNegative={p.allowNegative}
                    onKey={this.onKey}
                    onEnter={this.onEnter}
                />
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
        return { width: 240, height: 320 };
    }

    getPropsReducer(tree: PropertyTree): KeyboardProps {
        return mapKeyboardProps(tree);
    }
}
