import * as React from 'react';
import {
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { ControlledDraftHost } from '../../shared/controlledDraftHost';
import { CodeController } from './codeController';
import { formatJson, lineCountOf, validateJson } from './codeLogic';
import { CodeProps, mapCodeProps } from './codeProps';
import { CodeToolbar } from './CodeToolbar';

// Must match CodeEditor.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.ingots.input.codeeditor';

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
export class CodeEditor extends ControlledDraftHost<CodeProps, CodeEditorState> {

    private hostRef = React.createRef<HTMLDivElement>();
    private ctrl: CodeController | null = null;
    // Toolbar re-render key: validity + undo/redo depth folded into one string.
    private lastToolbarSig = '';

    constructor(props: ComponentProps<CodeProps>) {
        super(props);
        this.state = { dirty: false, draftValid: true };
    }

    componentDidMount(): void {
        this.createEditor();
        this.emitOutputs(this.props.props.code, false);
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
                editable: this.isEditable(),
                language: p.language,
                lineNumbers: p.lineNumbers,
                lineWrapping: p.lineWrapping,
                tabSize: p.tabSize,
                placeholder: p.placeholder
            });
        }
        // The controlled bound-document round-trip lives in the base.
        this.reconcileBoundDoc(prev.props);
    }

    // --- ControlledDraftHost contract ---------------------------------------
    protected readBoundDoc(props: CodeProps): string { return props.code; }
    protected getDraftDoc(): string { return this.ctrl ? this.ctrl.getCode() : ''; }
    protected hasEditor(): boolean { return this.ctrl !== null; }
    protected setEditorDoc(doc: string): void { this.ctrl?.setCode(doc); }

    protected deriveOutputs(code: string): Record<string, unknown> {
        const v = this.props.props.language === 'json' ? validateJson(code) : { valid: true, message: '' };
        return { isValid: v.valid, errorMessage: v.message, lineCount: lineCountOf(code) };
    }

    protected buildSavePayload(code: string): object {
        const v = this.props.props.language === 'json' ? validateJson(code) : { valid: true, message: '' };
        return { code, isValid: v.valid, errorMessage: v.message };
    }

    protected onAfterCommit(doc: string): void {
        this.setState({ draftValid: this.props.props.language !== 'json' || validateJson(doc).valid });
    }

    private isEditable(): boolean {
        return this.props.props.mode === 'edit' && this.props.props.enabled;
    }

    private createEditor(): void {
        if (!this.hostRef.current) {
            return;
        }
        const p = this.props.props;
        this.ctrl = new CodeController({
            element: this.hostRef.current,
            code: p.code,
            editable: this.isEditable(),
            language: p.language,
            lineNumbers: p.lineNumbers,
            lineWrapping: p.lineWrapping,
            tabSize: p.tabSize,
            placeholder: p.placeholder,
            onUpdate: this.onUserEdit,
            onStateChange: this.onEditorStateChange
        });
        this.setState({ draftValid: p.language !== 'json' || validateJson(p.code).valid });
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

    private onUserEdit = (): void => {
        this.markDirty();
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
        this.commitSave('onSave');
    };

    private discard = (): void => {
        this.commitDiscard();
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
