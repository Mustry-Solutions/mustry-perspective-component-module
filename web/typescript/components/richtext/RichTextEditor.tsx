import * as React from 'react';
import {
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { ControlledDraftHost } from '../../shared/controlledDraftHost';
import { RichTextController } from './richTextController';
import { plainTextOf, wordCountOf } from './richTextLogic';
import { RichTextProps, mapRteProps } from './richTextProps';
import { RteToolbar } from './RteToolbar';

// Must match RichTextEditor.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.perspective.input.richtexteditor';

interface RichTextEditorState {
    dirty: boolean;
    linkOpen: boolean;
    linkValue: string;
    imageOpen: boolean;
    imageValue: string;
    /** Bumped on selection changes so the toolbar re-reads active states. */
    toolbarTick: number;
}

/**
 * Rich text (WYSIWYG) editor / display. CONTROLLED, read-from-data:
 * `data.content` (sanitized-by-schema HTML) is the source of truth. Edits stay
 * a local draft (dirty badge) until Save fires `onSave` with {content,
 * plainText, wordCount} — the author's script persists it and rebinds
 * data.content; a rebind matching the draft clears the dirty state (grid batch
 * semantics). `mode: 'display'` renders the same schema-constrained document
 * read-only — the safe way to SHOW rich content anywhere.
 */
export class RichTextEditor extends ControlledDraftHost<RichTextProps, RichTextEditorState> {

    private hostRef = React.createRef<HTMLDivElement>();
    private ctrl: RichTextController | null = null;
    private lastToolbarSig = '';

    constructor(props: ComponentProps<RichTextProps>) {
        super(props);
        this.state = { dirty: false, linkOpen: false, linkValue: '', imageOpen: false, imageValue: '', toolbarTick: 0 };
    }

    componentDidMount(): void {
        this.createEditor();
        this.emitOutputs(this.props.props.content, false);
    }

    componentWillUnmount(): void {
        this.disposeEditor();
    }

    componentDidUpdate(prev: ComponentProps<RichTextProps>): void {
        const p = this.props.props;
        const q = prev.props;
        // Schema-shaping props changed: rebuild the editor around the current doc.
        if (JSON.stringify(p.features) !== JSON.stringify(q.features)
            || p.mode !== q.mode || p.placeholder !== q.placeholder
            || p.charLimit !== q.charLimit || p.maxImageKb !== q.maxImageKb
            || JSON.stringify(p.fonts) !== JSON.stringify(q.fonts)) {
            const keep = this.state.dirty && this.ctrl ? this.ctrl.getHTML() : p.content;
            this.disposeEditor();
            this.createEditor(keep);
            return;
        }
        if (p.enabled !== q.enabled && this.ctrl) {
            this.ctrl.setEditable(this.isEditable());
        }
        // The controlled bound-document round-trip lives in the base.
        this.reconcileBoundDoc(prev.props);
    }

    // --- ControlledDraftHost contract ---------------------------------------
    protected readBoundDoc(props: RichTextProps): string { return props.content; }
    protected getDraftDoc(): string { return this.ctrl ? this.ctrl.getHTML() : ''; }
    protected hasEditor(): boolean { return this.ctrl !== null; }
    protected setEditorDoc(doc: string): void { this.ctrl?.setContent(doc); }

    protected deriveOutputs(html: string): Record<string, unknown> {
        const plain = plainTextOf(html);
        return {
            plainText: plain,
            wordCount: wordCountOf(plain),
            charCount: this.ctrl ? this.ctrl.charCount() : plain.length
        };
    }

    protected buildSavePayload(html: string): object {
        const plain = plainTextOf(html);
        return { content: html, plainText: plain, wordCount: wordCountOf(plain) };
    }

    /** Save/Discard also close any open popover. */
    protected onAfterCommit(): void {
        if (this.state.linkOpen || this.state.imageOpen) {
            this.setState({ linkOpen: false, imageOpen: false });
        }
    }

    private isEditable(): boolean {
        return this.props.props.mode === 'edit' && this.props.props.enabled;
    }

    private createEditor(content?: string): void {
        if (!this.hostRef.current) {
            return;
        }
        const p = this.props.props;
        this.ctrl = new RichTextController({
            element: this.hostRef.current,
            content: content !== undefined ? content : p.content,
            editable: this.isEditable(),
            placeholder: p.placeholder,
            features: p.features,
            charLimit: p.charLimit,
            maxImageKb: p.maxImageKb,
            fonts: p.fonts,
            onUpdate: this.onUserEdit,
            onSelectionChange: this.onSelectionChange
        });
    }

    private disposeEditor(): void {
        if (this.ctrl) {
            this.ctrl.dispose();
            this.ctrl = null;
        }
        // TipTap appends its editor element into the host; clear leftovers on rebuild.
        if (this.hostRef.current) {
            this.hostRef.current.innerHTML = '';
        }
    }

    private onUserEdit = (): void => {
        if (this.props.props.mode === 'display') {
            // A read-only editor only changes via interactive checklist toggles:
            // emit the updated document for the author to persist (controlled —
            // the write-back round-trips through the binding as a no-op render).
            if (this.ctrl) {
                const html = this.ctrl.getHTML();
                this.lastSaved = html;   // the round-trip is our own write landing
                this.fireEvent('onTaskToggle', this.buildSavePayload(html));
            }
            return;
        }
        this.markDirty();
    };

    /** Re-render ONLY when a toolbar-relevant active state actually changed.
     *  Every ProseMirror transaction lands here (each keystroke, each selection
     *  step) — an unconditional setState would re-render per keypress and its
     *  reflow can swallow events mid-gesture (double-click selection, rapid
     *  shift-arrow extension). */
    private onSelectionChange = (): void => {
        if (!this.ctrl) {
            return;
        }
        const c = this.ctrl;
        const sig = [
            'bold', 'italic', 'underline', 'strike', 'paragraph',
            'bulletList', 'orderedList', 'link', 'table'
        ].map((n) => (c.isActive(n) ? '1' : '0')).join('')
            + (c.isActive('taskList') ? '1' : '0')
            + [1, 2, 3].map((n) => (c.isActive('heading', { level: n }) ? '1' : '0')).join('')
            + (c.canUndo() ? '1' : '0') + (c.canRedo() ? '1' : '0')
            + '|' + c.currentFont();
        if (sig !== this.lastToolbarSig) {
            this.lastToolbarSig = sig;
            this.setState({ toolbarTick: this.state.toolbarTick + 1 });
        }
    };

    private save = (): void => {
        this.commitSave('onSave');
    };

    private discard = (): void => {
        this.commitDiscard();
    };

    // --- link popover -------------------------------------------------------
    private linkToggle = (): void => {
        if (!this.ctrl) {
            return;
        }
        this.setState({ linkOpen: !this.state.linkOpen, linkValue: this.ctrl.currentLink() });
    };

    private linkApply = (): void => {
        if (this.ctrl) {
            this.ctrl.setLink(this.state.linkValue);
        }
        this.setState({ linkOpen: false });
    };

    private linkRemove = (): void => {
        if (this.ctrl) {
            this.ctrl.setLink(null);
        }
        this.setState({ linkOpen: false });
    };

    private imageToggle = (): void => {
        this.setState({ imageOpen: !this.state.imageOpen, imageValue: '' });
    };

    private imagePick = (src: string): void => {
        if (this.ctrl && src) {
            this.ctrl.setImage(src);
        }
        this.setState({ imageOpen: false });
    };

    private imageApply = (): void => {
        if (this.ctrl && this.state.imageValue) {
            this.ctrl.setImage(this.state.imageValue);
        }
        this.setState({ imageOpen: false });
    };

    render() {
        const p = this.props.props;
        const editing = p.mode === 'edit';
        const classes = ['mustry-rte'];
        if (!editing) {
            classes.push('mustry-rte--display');
        }
        if (!p.enabled) {
            classes.push('is-disabled');
        }
        return (
            <div {...this.props.emit({ classes })}>
                {editing && p.showToolbar && (
                    <RteToolbar
                        labels={p.labels}
                        features={p.features}
                        enabled={p.enabled}
                        dirty={this.state.dirty}
                        canUndo={this.ctrl ? this.ctrl.canUndo() : false}
                        canRedo={this.ctrl ? this.ctrl.canRedo() : false}
                        fonts={p.fonts}
                        currentFont={this.ctrl ? this.ctrl.currentFont() : ''}
                        onFont={(f) => this.ctrl && this.ctrl.setFont(f)}
                        imageLibrary={p.imageLibrary}
                        onImagePick={this.imagePick}
                        isActive={(name, attrs) => (this.ctrl ? this.ctrl.isActive(name, attrs) : false)}
                        onCommand={(cmd, arg) => this.ctrl && this.ctrl.command(cmd, arg)}
                        linkOpen={this.state.linkOpen}
                        linkValue={this.state.linkValue}
                        onLinkToggle={this.linkToggle}
                        onLinkChange={(v) => this.setState({ linkValue: v })}
                        onLinkApply={this.linkApply}
                        onLinkRemove={this.linkRemove}
                        imageOpen={this.state.imageOpen}
                        imageValue={this.state.imageValue}
                        onImageToggle={this.imageToggle}
                        onImageChange={(v) => this.setState({ imageValue: v })}
                        onImageApply={this.imageApply}
                        onSave={this.save}
                        onDiscard={this.discard}
                    />
                )}
                <div className="mustry-rte-content" ref={this.hostRef} />
            </div>
        );
    }
}

export class RichTextEditorMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        // PComponent is typed over PlainObject props; getPropsReducer below is
        // what actually guarantees the shape this class receives.
        return RichTextEditor as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        return { width: 560, height: 320 };
    }

    getPropsReducer(tree: PropertyTree): RichTextProps {
        return mapRteProps(tree);
    }
}
