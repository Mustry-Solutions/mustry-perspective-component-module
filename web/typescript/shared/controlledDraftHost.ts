// The controlled-document lifecycle shared by every editor component (rich
// text, code, …): a bound document is the source of truth (data.content /
// data.code), user edits are a local draft with a dirty flag, Save fires an
// event, and the author's write-back round-trips through the binding to clear
// the dirty state. This was ~100 near-identical lines duplicated per editor
// (and a shared bug — output.isDirty could stick `true` — lived in both copies).
// The base owns the state machine and the output-writing; subclasses supply
// only how to talk to their editor and what their outputs/payload look like.
//
// Modelled on shared/dragGestureController: pull up what is genuinely identical,
// leave the DOM/library-specific lifecycle (refs, controller creation, render)
// in the subclass. Documents are strings in every editor, so no doc-type generic.
import { Component, ComponentProps, PlainObject } from '@inductiveautomation/perspective-client';

export interface DraftHostState {
    dirty: boolean;
}

export abstract class ControlledDraftHost<P extends PlainObject, S extends DraftHostState>
    extends Component<ComponentProps<P>, S> {

    /** The draft the last Save emitted: an incoming prop equal to it is our own
     *  write-back landing (clears dirty); anything else is external truth. */
    protected lastSaved: string | null = null;
    private lastOutputSig = '';
    // isDirty is reconciled independently of the content signature — a net-zero
    // edit cycle (edit + revert + Save) must still clear it.
    private lastDirtyWritten = false;

    // --- subclass contract --------------------------------------------------
    /** The bound document from props (e.g. `p.content` / `p.code`). */
    protected abstract readBoundDoc(props: P): string;
    /** The editor's current document ('' when not mounted). */
    protected abstract getDraftDoc(): string;
    /** Whether the editor/controller is mounted. */
    protected abstract hasEditor(): boolean;
    /** Replace the editor's document with external/bound content — must be
     *  history-exempt so Ctrl-Z can't undo the binding's arrival. */
    protected abstract setEditorDoc(doc: string): void;
    /** Derived outputs for a document, WITHOUT `isDirty` (the base owns that).
     *  Keys are written as `output.<key>`. */
    protected abstract deriveOutputs(doc: string): Record<string, unknown>;
    /** The payload for the save event. */
    protected abstract buildSavePayload(doc: string): object;
    /** Optional hook after the base sets dirty=false (e.g. re-validate a draft). */
    protected onAfterCommit(_doc: string): void { /* default no-op */ }

    // --- shared machinery ---------------------------------------------------
    /** Fire a component event for authors' event scripts (suppressed at design time). */
    protected fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    private writeDirty(dirty: boolean): void {
        if (dirty !== this.lastDirtyWritten) {
            this.lastDirtyWritten = dirty;
            this.props.store.props.write('output.isDirty', dirty);
        }
    }

    /** Write `output.isDirty` plus the subclass's derived outputs, signature-gated
     *  (isDirty is reconciled separately so it never gets stuck). */
    protected emitOutputs(doc: string, dirty: boolean): void {
        this.writeDirty(dirty);
        const outs = this.deriveOutputs(doc);
        const sig = JSON.stringify(outs);
        if (sig === this.lastOutputSig) {
            return;
        }
        this.lastOutputSig = sig;
        const w = this.props.store.props;
        Object.keys(outs).forEach((k) => w.write(`output.${k}`, outs[k]));
    }

    /** The onUserEdit dirty-set half — first edit flips the draft dirty. */
    protected markDirty(): void {
        if (!this.state.dirty) {
            this.setState({ dirty: true } as Pick<S, 'dirty'>);
            this.writeDirty(true);
        }
    }

    /** Call from componentDidUpdate: reconcile a changed bound document against
     *  the draft (our-save-round-tripped → clean; external-while-clean → follow;
     *  external-while-dirty → keep draft but outputs track the bound doc). */
    protected reconcileBoundDoc(prevProps: P): void {
        const cur = this.readBoundDoc(this.props.props);
        if (cur === this.readBoundDoc(prevProps) || !this.hasEditor()) {
            return;
        }
        if (cur === (this.lastSaved !== null ? this.lastSaved : this.getDraftDoc())) {
            this.lastSaved = null;
            if (this.state.dirty) {
                this.setState({ dirty: false } as Pick<S, 'dirty'>);
            }
            this.emitOutputs(cur, false);
        } else if (!this.state.dirty) {
            this.setEditorDoc(cur);
            this.emitOutputs(cur, false);
        } else {
            this.emitOutputs(cur, true);
        }
    }

    /** Save the draft: emit outputs, clear dirty, fire the event. */
    protected commitSave(eventName: string): void {
        if (!this.hasEditor()) {
            return;
        }
        const doc = this.getDraftDoc();
        this.lastSaved = doc;
        this.setState({ dirty: false } as Pick<S, 'dirty'>);
        this.emitOutputs(doc, false);
        this.fireEvent(eventName, this.buildSavePayload(doc));
        this.onAfterCommit(doc);
    }

    /** Discard the draft: restore the bound document, clear dirty. */
    protected commitDiscard(): void {
        if (!this.hasEditor()) {
            return;
        }
        const bound = this.readBoundDoc(this.props.props);
        this.setEditorDoc(bound);
        this.lastSaved = null;
        this.setState({ dirty: false } as Pick<S, 'dirty'>);
        this.emitOutputs(bound, false);
        this.onAfterCommit(bound);
    }
}
