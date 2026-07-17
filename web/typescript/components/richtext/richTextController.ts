// The TipTap lifecycle wrapper: builds the editor with a feature-constrained
// schema (only allowlisted node/mark types can EXIST in the document — that is
// the sanitization model: unknown markup is dropped on parse, scripts and
// event-handler attributes can never enter), and exposes the small imperative
// surface the class component drives. DOM-facing, hence untested; anything
// with logic lives in richTextLogic.ts.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { RteFeatures, sanitizeUrl } from './richTextLogic';

export interface RteControllerOpts {
    element: HTMLElement;
    content: string;
    editable: boolean;
    placeholder: string;
    features: RteFeatures;
    /** Document changed by user input (typing, toolbar commands). */
    onUpdate: () => void;
    /** Selection or stored-marks changed — the toolbar re-reads active states. */
    onSelectionChange: () => void;
}

export class RichTextController {
    private editor: Editor;

    constructor(opts: RteControllerOpts) {
        const f = opts.features;
        this.editor = new Editor({
            element: opts.element,
            editable: opts.editable,
            content: opts.content,
            extensions: [
                StarterKit.configure({
                    // Lean M0 schema: what the features allow, nothing else.
                    bold: f.bold ? undefined : false,
                    italic: f.italic ? undefined : false,
                    strike: f.strike ? undefined : false,
                    heading: f.headings ? { levels: [1, 2, 3] } : false,
                    bulletList: f.bulletList ? undefined : false,
                    orderedList: f.orderedList ? undefined : false,
                    code: false,
                    codeBlock: false,
                    blockquote: false,
                    horizontalRule: false
                }),
                ...(f.underline ? [Underline] : []),
                ...(f.link ? [Link.configure({
                    // Display mode navigates; edit mode keeps clicks for editing.
                    openOnClick: !opts.editable,
                    autolink: true,
                    linkOnPaste: true,
                    HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
                    validate: (href: string) => sanitizeUrl(href) !== null
                })] : []),
                ...(opts.editable && opts.placeholder
                    ? [Placeholder.configure({ placeholder: opts.placeholder })] : [])
            ],
            onUpdate: () => opts.onUpdate(),
            onSelectionUpdate: () => opts.onSelectionChange(),
            onTransaction: () => opts.onSelectionChange()
        });
    }

    dispose(): void {
        this.editor.destroy();
    }

    getHTML(): string {
        return this.editor.getHTML();
    }

    /** Replace the document (external/bound content — no user-update event). */
    setContent(html: string): void {
        this.editor.commands.setContent(html, false);
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
