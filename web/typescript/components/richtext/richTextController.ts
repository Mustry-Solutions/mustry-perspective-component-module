// The TipTap lifecycle wrapper: builds the editor with a feature-constrained
// schema (only allowlisted node/mark types can EXIST in the document — that is
// the sanitization model: unknown markup is dropped on parse, scripts and
// event-handler attributes can never enter), and exposes the small imperative
// surface the class component drives. DOM-facing, hence untested; anything
// with logic lives in richTextLogic.ts, and the extension set (which decides
// the schema) in richTextExtensions.ts.
import { Editor } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { imageSrcWithinPolicy, sanitizeUrl } from './richTextLogic';
import { RteSchemaOpts, rteExtensions } from './richTextExtensions';

export interface RteControllerOpts extends RteSchemaOpts {
    element: HTMLElement;
    content: string;
    /** Document changed by user input (typing, toolbar commands) — in a
     *  read-only editor this only happens via checklist toggles. */
    onUpdate: () => void;
    /** Selection or stored-marks changed — the toolbar re-reads active states. */
    onSelectionChange: () => void;
}

export class RichTextController {
    private editor: Editor;
    private maxImageKb: number;

    constructor(opts: RteControllerOpts) {
        const f = opts.features;
        this.maxImageKb = opts.maxImageKb;
        this.editor = new Editor({
            element: opts.element,
            editable: opts.editable,
            content: opts.content,
            extensions: rteExtensions(opts, (node, checked) => this.applyReadOnlyCheck(node, checked)),
            editorProps: {
                // Pasted image FILES embed as size-capped data URIs; oversized
                // or non-image pastes fall through to default handling.
                handlePaste: (_view, e: ClipboardEvent) => {
                    if (!f.image || !opts.editable || !e.clipboardData) {
                        return false;
                    }
                    const items = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith('image/'));
                    if (!items.length) {
                        return false;
                    }
                    const file = items[0].getAsFile();
                    if (!file) {
                        return false;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                        const src = imageSrcWithinPolicy(String(reader.result || ''), opts.maxImageKb);
                        if (src) {
                            this.editor.chain().focus().setImage({ src }).run();
                        }
                    };
                    reader.readAsDataURL(file);
                    return true;
                }
            },
            onUpdate: () => opts.onUpdate(),
            onSelectionUpdate: () => opts.onSelectionChange(),
            onTransaction: () => opts.onSelectionChange()
        });
    }

    dispose(): void {
        this.editor.destroy();
    }

    /** A display-mode checklist toggle. Applies the attribute change TipTap
     *  only shows visually; the dispatched transaction fires onUpdate, and the
     *  component turns that into onTaskToggle. */
    private applyReadOnlyCheck(node: PMNode, checked: boolean): boolean {
        const { state, view } = this.editor;
        let done = false;
        state.doc.descendants((n, pos) => {
            if (done) {
                return false;
            }
            if (n === node) {
                view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, checked }));
                done = true;
                return false;
            }
            return true;
        });
        return done;
    }

    getHTML(): string {
        return this.editor.getHTML();
    }

    /** Replace the document (external/bound content — no user-update event, and
     *  NOT undoable: without the history opt-out, the binding's arrival becomes
     *  an undo step and Ctrl-Z could blank the document). */
    setContent(html: string): void {
        this.editor.chain()
            .command(({ tr }) => {
                tr.setMeta('addToHistory', false);
                return true;
            })
            .setContent(html, { emitUpdate: false })
            .run();
    }

    setEditable(editable: boolean): void {
        this.editor.setEditable(editable);
    }

    isActive(name: string, attrs?: Record<string, unknown>): boolean {
        return this.editor.isActive(name, attrs);
    }

    /** Toolbar commands, routed through one entry point. */
    command(cmd: string, arg?: number): void {
        const c = this.editor.chain().focus();
        switch (cmd) {
            case 'bold': c.toggleBold().run(); break;
            case 'italic': c.toggleItalic().run(); break;
            case 'underline': c.toggleUnderline().run(); break;
            case 'strike': c.toggleStrike().run(); break;
            case 'paragraph': c.setParagraph().run(); break;
            case 'heading': c.toggleHeading({ level: (arg || 1) as 1 | 2 | 3 }).run(); break;
            case 'bulletList': c.toggleBulletList().run(); break;
            case 'orderedList': c.toggleOrderedList().run(); break;
            case 'checklist': c.toggleTaskList().run(); break;
            case 'insertTable': c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
            case 'addRow': c.addRowAfter().run(); break;
            case 'addColumn': c.addColumnAfter().run(); break;
            case 'deleteTable': c.deleteTable().run(); break;
            case 'undo': c.undo().run(); break;
            case 'redo': c.redo().run(); break;
        }
    }

    canUndo(): boolean {
        return this.editor.can().undo();
    }

    canRedo(): boolean {
        return this.editor.can().redo();
    }

    /** The selection's font family ('' = theme default). */
    currentFont(): string {
        return (this.editor.getAttributes('textStyle').fontFamily as string) || '';
    }

    /** Apply a font family to the selection; '' returns to the theme default. */
    setFont(family: string): void {
        const c = this.editor.chain().focus();
        if (family) {
            c.setFontFamily(family).run();
        } else {
            c.unsetFontFamily().run();
        }
    }

    /** Insert an image by (sanitized) URL: http(s), relative, or data:image/*
     *  within config.maxImageKb. */
    setImage(src: string): void {
        const safe = imageSrcWithinPolicy(src, this.maxImageKb);
        if (safe) {
            this.editor.chain().focus().setImage({ src: safe }).run();
        }
    }

    /** The current selection's link href, '' when none. */
    currentLink(): string {
        return (this.editor.getAttributes('link').href as string) || '';
    }

    /** Apply a (sanitized) link to the selection; null/empty removes it. */
    setLink(url: string | null): void {
        const safe = url ? sanitizeUrl(url) : null;
        const c = this.editor.chain().focus().extendMarkRange('link');
        if (safe) {
            c.setLink({ href: safe }).run();
        } else {
            c.unsetLink().run();
        }
    }

    focus(): void {
        this.editor.commands.focus();
    }
}
