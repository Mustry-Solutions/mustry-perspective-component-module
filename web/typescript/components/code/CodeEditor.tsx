import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { CodeController } from './codeController';
import { formatJson, lineCountOf, validateJson } from './codeLogic';
import { CodeProps, mapCodeProps } from './codeProps';
import { CodeToolbar } from './CodeToolbar';

// Must match CodeEditor.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.input.codeeditor';

interface CodeEditorState {
    dirty: boolean;
    /** Live JSON validity of the DRAFT (edit feedback; outputs track the bound doc). */
    draftValid: boolean;
}

/**
 * Code / JSON editor. CONTROLLED, read-from-data: `data.code` is the bound
 * truth. Edits stay a local draft (dirty badge) until Save fires `onSave`
 * {code, isValid} — the author's script persists it and rebinds data.code; a
 * rebind matching the draft clears the dirty state (grid batch semantics).
 * `mode: 'display'` renders read-only with folding — a structured-data viewer.
 * JSON gets live parse validation: lint markers in the gutter, a toolbar
 * badge, and output.isValid/errorMessage for bindings to react to.
 */
export class CodeEditor extends Component<ComponentProps<CodeProps>, CodeEditorState> {

    private hostRef = React.createRef<HTMLDivElement>();
    private ctrl: CodeController | null = null;
    // The draft the last Save emitted: an incoming prop equal to it is our own
    // write-back landing (clears dirty); anything else is external truth.
    private lastSaved: string | null = null;
    private lastOutputSig = '';
    // isDirty is reconciled independently of the content signature (see
    // writeDirty): a net-zero edit cycle must still clear it on Save.
    private lastDirtyWritten = false;
    // Toolbar re-render key: validity + undo/redo depth folded into one string.
    private lastToolbarSig = '';

    constructor(props: ComponentProps<CodeProps>) {
        super(props);
        this.state = { dirty: false, draftValid: true };
    }

    componentDidMount(): void {
        this.createEditor();
        this.syncOutputs(this.props.props.code, false);
    }

    componentWillUnmount(): void {
        this.disposeEditor();
    }

    componentDidUpdate(prev: ComponentProps<CodeProps>): void {
        const p = this.props.props;
        const q = prev.props;
        // Config changes RECONFIGURE the editor in place (compartments) — no
        // teardown, so the undo history, cursor and scroll survive a lineWrapping
        // or language toggle mid-edit.
        if (this.ctrl && (p.language !== q.language || p.mode !== q.mode || p.enabled !== q.enabled
            || p.lineNumbers !== q.lineNumbers || p.lineWrapping !== q.lineWrapping
            || p.tabSize !== q.tabSize || p.placeholder !== q.placeholder)) {
            this.ctrl.reconfigure({
                editable: this.editable(),
                language: p.language,
                lineNumbers: p.lineNumbers,
                lineWrapping: p.lineWrapping,
                tabSize: p.tabSize,
                placeholder: p.placeholder
            });
        }
        if (p.code !== q.code && this.ctrl) {
            if (p.code === (this.lastSaved !== null ? this.lastSaved : this.ctrl.getCode())) {
                // Our own save round-tripped through the binding: now clean.
                this.lastSaved = null;
                if (this.state.dirty) {
                    this.setState({ dirty: false });
                }
                this.syncOutputs(p.code, false);
            } else if (!this.state.dirty) {
                // External change while clean: follow the bound truth.
                this.ctrl.setCode(p.code);
                this.syncOutputs(p.code, false);
            } else {
                // External change while dirty: keep the draft, but outputs still
                // describe the (now-changed) BOUND document per the schema.
                this.syncOutputs(p.code, true);
            }
        }
    }

    private editable(): boolean {
        return this.props.props.mode === 'edit' && this.props.props.enabled;
    }

    private createEditor(code?: string): void {
        if (!this.hostRef.current) {
            return;
        }
        const p = this.props.props;
        const doc = code !== undefined ? code : p.code;
        this.ctrl = new CodeController({
            element: this.hostRef.current,
            code: doc,
            editable: this.editable(),
            language: p.language,
            lineNumbers: p.lineNumbers,
            lineWrapping: p.lineWrapping,
            tabSize: p.tabSize,
            placeholder: p.placeholder,
            onUpdate: this.onUserEdit,
            onStateChange: this.onEditorStateChange
        });
        this.setState({ draftValid: p.language !== 'json' || validateJson(doc).valid });
    }

    private disposeEditor(): void {
        if (this.ctrl) {
            this.ctrl.dispose();
            this.ctrl = null;
        }
        if (this.hostRef.current) {
            this.hostRef.current.innerHTML = '';
        }
    }

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    /** Reconcile output.isDirty independently of the content signature — a
     *  net-zero edit cycle (edit + revert + Save) must still clear it. */
    private writeDirty(dirty: boolean): void {
        if (dirty !== this.lastDirtyWritten) {
            this.lastDirtyWritten = dirty;
            this.props.store.props.write('output.isDirty', dirty);
        }
    }

    /** Outputs describe the BOUND/saved document (not the mid-edit draft) and are
     *  written on mount, save, discard and bound-content changes — not per keystroke. */
    private syncOutputs(code: string, dirty: boolean): void {
        this.writeDirty(dirty);
        const p = this.props.props;
        const v = p.language === 'json' ? validateJson(code) : { valid: true, message: '' };
        const lines = lineCountOf(code);
        const sig = `${v.valid}|${v.message}|${lines}|${code.length}`;
        if (sig === this.lastOutputSig) {
            return;
        }
        this.lastOutputSig = sig;
        const w = this.props.store.props;
        w.write('output.isValid', v.valid);
        w.write('output.errorMessage', v.message);
        w.write('output.lineCount', lines);
    }

    private onUserEdit = (): void => {
        if (!this.state.dirty) {
            this.setState({ dirty: true });
            this.writeDirty(true);
        }
    };

    /** Toolbar refresh on real document changes: validity badge + undo/redo
     *  enabled state. Fires only on docChanged (not caret moves), so the JSON
     *  parse here is at most once per edit, never per cursor step. */
    private onEditorStateChange = (): void => {
        if (!this.ctrl) {
            return;
        }
        const valid = this.props.props.language !== 'json' || validateJson(this.ctrl.getCode()).valid;
        const sig = `${valid}|${this.ctrl.canUndo()}|${this.ctrl.canRedo()}`;
        if (sig !== this.lastToolbarSig) {
            this.lastToolbarSig = sig;
            this.setState({ draftValid: valid });
        }
    };

    private save = (): void => {
        if (!this.ctrl) {
            return;
        }
        const code = this.ctrl.getCode();
        const p = this.props.props;
        const v = p.language === 'json' ? validateJson(code) : { valid: true, message: '' };
        this.lastSaved = code;
        this.setState({ dirty: false });
        this.syncOutputs(code, false);
        this.fireEvent('onSave', { code, isValid: v.valid, errorMessage: v.message });
    };

    private discard = (): void => {
        if (!this.ctrl) {
            return;
        }
        this.ctrl.setCode(this.props.props.code);
        this.lastSaved = null;
        this.setState({ dirty: false, draftValid: this.props.props.language !== 'json' || validateJson(this.props.props.code).valid });
        this.syncOutputs(this.props.props.code, false);
    };

    private format = (): void => {
        if (!this.ctrl) {
            return;
        }
        const pretty = formatJson(this.ctrl.getCode(), this.props.props.tabSize);
        if (pretty !== null && pretty !== this.ctrl.getCode()) {
            // Format is a USER action: an undoable edit (the update listener
            // marks the draft dirty on its own).
            this.ctrl.applyUserEdit(pretty);
            this.setState({ draftValid: true });
        }
    };

    render() {
        const p = this.props.props;
        const editing = p.mode === 'edit';
        const classes = ['mustry-code'];
        if (!editing) {
            classes.push('mustry-code--display');
        }
        if (!p.enabled) {
            classes.push('is-disabled');
        }
        return (
            <div {...this.props.emit({ classes })}>
                {editing && p.showToolbar && (
                    <CodeToolbar
                        labels={p.labels}
                        enabled={p.enabled}
                        dirty={this.state.dirty}
                        canUndo={this.ctrl ? this.ctrl.canUndo() : false}
                        canRedo={this.ctrl ? this.ctrl.canRedo() : false}
                        isJson={p.language === 'json'}
                        jsonValid={this.state.draftValid}
                        canFormat={this.state.draftValid}
                        onUndo={() => this.ctrl && this.ctrl.undo()}
                        onRedo={() => this.ctrl && this.ctrl.redo()}
                        onFormat={this.format}
                        onSave={this.save}
                        onDiscard={this.discard}
                    />
                )}
                <div className="mustry-code-content" ref={this.hostRef} />
            </div>
        );
    }
}

export class CodeEditorMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        // PComponent is typed over PlainObject props; getPropsReducer below is
        // what actually guarantees the shape this class receives.
        return CodeEditor as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        return { width: 560, height: 320 };
    }

    getPropsReducer(tree: PropertyTree): CodeProps {
        return mapCodeProps(tree);
    }
}
