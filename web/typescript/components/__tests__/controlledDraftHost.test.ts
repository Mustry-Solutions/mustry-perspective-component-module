// The controlled-document round-trip shared by the Rich Text and Code editors,
// driven through a fake editor. perspective-client ships only a hashed browser
// bundle (nothing node can resolve), so its Component is a virtual mock: a
// bare class with a synchronous setState. Everything else is the real
// ControlledDraftHost.
import { ComponentProps } from '@inductiveautomation/perspective-client';
import { ControlledDraftHost, DraftHostState } from '../../shared/controlledDraftHost';

jest.mock('@inductiveautomation/perspective-client', () => ({
    Component: class {
        props: unknown;
        state: unknown;
        constructor(props: unknown) {
            this.props = props;
        }
        setState(patch: object): void {
            this.state = { ...(this.state as object), ...patch };
        }
    }
}), { virtual: true });

interface DocProps {
    doc: string;
}

/** A host whose "editor" is a string; outputs land in `written`. */
class FakeEditorHost extends ControlledDraftHost<DocProps, DraftHostState> {
    editorDoc: string;
    readonly written: Record<string, unknown>;

    constructor(doc: string) {
        const written: Record<string, unknown> = {};
        super({
            props: { doc },
            eventsEnabled: false,
            store: { props: { write: (k: string, v: unknown) => { written[k] = v; } } }
        } as unknown as ComponentProps<DocProps>);
        this.written = written;
        this.state = { dirty: false };
        this.editorDoc = doc;
    }

    protected readBoundDoc(props: DocProps): string { return props.doc; }
    protected getDraftDoc(): string { return this.editorDoc; }
    protected hasEditor(): boolean { return true; }
    protected setEditorDoc(doc: string): void { this.editorDoc = doc; }
    protected deriveOutputs(doc: string): Record<string, unknown> { return { length: doc.length }; }
    protected buildSavePayload(doc: string): object { return { doc }; }

    // --- what the operator and the binding do -------------------------------
    type(doc: string): void {
        this.editorDoc = doc;
        this.markDirty();
    }

    save(): void {
        this.commitSave('onSave');
    }

    /** The binding delivers a new bound document (componentDidUpdate). */
    bind(doc: string): void {
        const prev = this.props.props;
        (this.props as { props: DocProps }).props = { doc };
        this.reconcileBoundDoc(prev);
    }
}

describe('ControlledDraftHost bound-document round-trip', () => {
    it('our save landing clears dirty when the editor still holds it', () => {
        const host = new FakeEditorHost('a');
        host.type('ab');
        host.save();
        host.bind('ab');
        expect(host.state.dirty).toBe(false);
        expect(host.written['output.isDirty']).toBe(false);
        expect(host.editorDoc).toBe('ab');
    });

    it('typing after Save stays dirty when the save lands (#134)', () => {
        const host = new FakeEditorHost('a');
        host.type('ab');
        host.save();
        host.type('abc');
        host.bind('ab');
        expect(host.state.dirty).toBe(true);
        expect(host.written['output.isDirty']).toBe(true);
        expect(host.editorDoc).toBe('abc');
        // Outputs follow the bound doc, as for any external change while dirty.
        expect(host.written['output.length']).toBe(2);
    });

    it('a later external change does not overwrite that typing (#134)', () => {
        const host = new FakeEditorHost('a');
        host.type('ab');
        host.save();
        host.type('abc');
        host.bind('ab');
        host.bind('external');
        expect(host.editorDoc).toBe('abc');
        expect(host.state.dirty).toBe(true);
    });

    it('saving the newer draft then clears dirty', () => {
        const host = new FakeEditorHost('a');
        host.type('ab');
        host.save();
        host.type('abc');
        host.bind('ab');
        host.save();
        host.bind('abc');
        expect(host.state.dirty).toBe(false);
        expect(host.written['output.isDirty']).toBe(false);
        expect(host.editorDoc).toBe('abc');
    });

    it('an external change while clean replaces the editor document', () => {
        const host = new FakeEditorHost('a');
        host.bind('b');
        expect(host.editorDoc).toBe('b');
        expect(host.state.dirty).toBe(false);
    });
});
