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
    applyKey, clampValue, formatValue, inRange, KeypadKey, parseDraft, valueToDraft
} from './keyboardLogic';
import { appendChar, backspaceText, getRows, KeyDef, KeyLayer, TextLayout } from './keyboardLayouts';
import { KeypadKeys } from './KeypadKeys';
import { KeyboardKeys } from './KeyboardKeys';
import { KeyboardProps, mapKeyboardProps } from './keyboardProps';

// Must match Keyboard.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.ingots.input.keyboard';

const POPOVER_MAX_NUM = 260;
const POPOVER_MAX_TEXT = 540;

interface KeyboardState {
    /** Draft string while typing (null = show the committed value). Numeric OR text. */
    draft: string | null;
    /** Text keyboard: active key layer. */
    layer: KeyLayer;
    /** Text keyboard: shift active (one-shot — resets after a letter). */
    shift: boolean;
    /** Popover mode: whether the keyboard panel is open. */
    open: boolean;
    panelTop: number;
    panelLeft: number;
}

/**
 * On-Screen Keyboard — a touch keyboard whose value display is a <div>, NOT an
 * <input>, so tapping it never summons the OS on-screen keyboard (the
 * "double-keyboard" problem Perspective's native entry fields have on touch).
 *
 * Layouts: 'numpad' (numeric keypad editing value.value) or 'text'/'email'/'url'
 * (QWERTY editing value.text). Mode: 'inline' shows the keyboard in place;
 * 'popover' shows a field trigger that opens the keyboard in a portalled panel
 * (Enter commits + closes; outside-click / Escape discards). All editing rules
 * are pure (keyboardLogic / keyboardLayouts); this is the shell.
 */
export class OnScreenKeyboard extends Component<ComponentProps<KeyboardProps>, KeyboardState> {

    private triggerEl: HTMLElement | null = null;
    private panelEl: HTMLElement | null = null;

    constructor(props: ComponentProps<KeyboardProps>) {
        super(props);
        this.state = { draft: null, layer: 'letters', shift: false, open: false, panelTop: 0, panelLeft: 0 };
    }

    componentDidMount(): void {
        this.emitOutputs(null);
    }

    componentWillUnmount(): void {
        this.removeWindowListeners();
    }

    componentDidUpdate(prev: ComponentProps<KeyboardProps>): void {
        const p = this.props.props;
        const q = prev.props;
        const boundChanged = this.isNumeric() ? p.value !== q.value : p.text !== q.text;
        if (boundChanged || p.layout !== q.layout) {
            this.setState({ draft: null });
            this.emitOutputs(null);
        } else if (p.decimals !== q.decimals || p.units !== q.units || p.enforceRange !== q.enforceRange
            || p.min !== q.min || p.max !== q.max || p.maxLength !== q.maxLength) {
            this.emitOutputs(this.state.draft);
        }
        if (this.state.open) {
            this.adjustPanelPosition();
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

    private emitOutputs(draft: string | null): void {
        const p = this.props.props;
        const w = this.props.store.props;
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
            this.closeIfPopover();
            return;
        }
        const value = p.enforceRange ? clampValue(parsed, p.min, p.max) : parsed;
        this.props.store.props.write('value.value', value);
        this.setState({ draft: null }, () => this.emitOutputs(null));
        this.fireEvent('onCommit', { value, text: formatValue(value, p.decimals, p.units), isValid: this.numberValid(value) });
        this.closeIfPopover();
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
            this.closeIfPopover();
            return;
        }
        const p = this.props.props;
        const text = this.state.draft as string;
        this.props.store.props.write('value.text', text);
        this.setState({ draft: null }, () => this.emitOutputs(null));
        this.fireEvent('onCommit', { value: text, text, isValid: p.maxLength <= 0 || text.length <= p.maxLength });
        this.closeIfPopover();
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

    /** Close the panel, discarding any in-progress draft. */
    private closePanel(): void {
        if (!this.state.open) {
            return;
        }
        this.removeWindowListeners();
        this.setState({ open: false, draft: null });
    }

    private closeIfPopover(): void {
        if (this.props.props.mode === 'popover' && this.state.open) {
            this.removeWindowListeners();
            this.setState({ open: false });
        }
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

    private panelWidth(): number {
        const desired = this.isNumeric() ? POPOVER_MAX_NUM : POPOVER_MAX_TEXT;
        return Math.min(desired, window.innerWidth - 16);
    }

    private computeBasePosition(): void {
        const el = this.triggerEl;
        if (!el) {
            return;
        }
        const rect = el.getBoundingClientRect();
        const width = this.panelWidth();
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
        const width = this.panelWidth();
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        let top = rect.bottom + gap;
        if (top + h > window.innerHeight && rect.top - gap - h >= 0) {
            top = rect.top - gap - h;
        }
        if (top !== this.state.panelTop || left !== this.state.panelLeft) {
            this.setState({ panelTop: top, panelLeft: left });
        }
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

    /** The committed value shown on the popover trigger (never the live draft). */
    private triggerText(): string {
        const p = this.props.props;
        return this.isNumeric() ? formatValue(this.committedNumber(), p.decimals, p.units) : p.text;
    }

    /** The display + keys — reused by inline and inside the popover panel. */
    private renderBody(): React.ReactNode {
        const p = this.props.props;
        const numeric = this.isNumeric();
        const outOfRange = numeric && p.enforceRange && !this.numberValid(this.rawNumber());
        const display = numeric ? this.numericDisplay() : this.textDisplay();
        return (
            <React.Fragment>
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
            </React.Fragment>
        );
    }

    private renderTrigger(): JSX.Element {
        const p = this.props.props;
        const text = this.triggerText();
        const empty = text === '';
        return (
            <div
                className={'mustry-kbd-trigger' + (empty ? ' mustry-kbd-trigger--empty' : '')}
                ref={this.setTriggerEl}
                role="button"
                tabIndex={p.enabled ? 0 : -1}
                aria-haspopup="dialog"
                aria-expanded={this.state.open}
                onClick={this.togglePanel}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.togglePanel(); } }}
            >
                <span className="mustry-kbd-trigger-text">{empty ? p.placeholder : text}</span>
                <svg className="mustry-kbd-trigger-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>
                    <path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 13.5h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
            </div>
        );
    }

    private renderPopover(): React.ReactNode {
        const layoutClass = this.isNumeric() ? 'mustry-kbd--numpad' : 'mustry-kbd--text';
        const style: React.CSSProperties = {
            position: 'fixed', top: this.state.panelTop, left: this.state.panelLeft, width: this.panelWidth()
        };
        // The panel carries `mustry-keyboard` so the --kbd-* theme vars resolve
        // even though it is portalled to <body>, outside the component root.
        return ReactDOM.createPortal(
            <div className={`mustry-keyboard ${layoutClass} mustry-kbd-popover`} ref={this.setPanelEl} style={style} role="dialog">
                {this.renderBody()}
            </div>,
            document.body
        );
    }

    render() {
        const p = this.props.props;
        const numeric = this.isNumeric();

        if (p.mode === 'popover') {
            const rootClasses = ['mustry-kbd-trigger-root'];
            if (!p.enabled) {
                rootClasses.push('mustry-kbd--disabled');
            }
            return (
                <div {...this.props.emit({ classes: rootClasses })}>
                    {this.renderTrigger()}
                    {this.state.open && this.renderPopover()}
                </div>
            );
        }

        const classes = ['mustry-keyboard', numeric ? 'mustry-kbd--numpad' : 'mustry-kbd--text'];
        if (!p.enabled) {
            classes.push('mustry-kbd--disabled');
        }
        return <div {...this.props.emit({ classes })}>{this.renderBody()}</div>;
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
        // Numpad inline default; text layouts + popover triggers resize.
        return { width: 240, height: 320 };
    }

    getPropsReducer(tree: PropertyTree): KeyboardProps {
        return mapKeyboardProps(tree);
    }
}
