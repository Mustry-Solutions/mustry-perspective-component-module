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
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Image from '@tiptap/extension-image';
import CharacterCount from '@tiptap/extension-character-count';
import { RteFeatures, dataUriKb, sanitizeImageSrc, sanitizeUrl } from './richTextLogic';

export interface RteControllerOpts {
    element: HTMLElement;
    content: string;
    editable: boolean;
    placeholder: string;
    features: RteFeatures;
    /** 0 = unlimited. Enforced by the CharacterCount extension. */
    charLimit: number;
    /** Max embedded (pasted) image size in KB; larger pastes are dropped. */
    maxImageKb: number;
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
                ...(f.table ? [
                    Table.configure({ resizable: false }),
                    TableRow, TableHeader, TableCell
                ] : []),
                ...(f.image ? [Image.configure({ inline: false, allowBase64: true })] : []),
                ...(opts.charLimit > 0 ? [CharacterCount.configure({ limit: opts.charLimit })] : []),
                ...(opts.editable && opts.placeholder
                    ? [Placeholder.configure({ placeholder: opts.placeholder })] : [])
            ],
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
                        const uri = String(reader.result || '');
                        if (uri && dataUriKb(uri) <= opts.maxImageKb) {
                            this.editor.chain().focus().setImage({ src: uri }).run();
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
            case 'insertTable': c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
            case 'addRow': c.addRowAfter().run(); break;
            case 'addColumn': c.addColumnAfter().run(); break;
            case 'deleteTable': c.deleteTable().run(); break;
        }
    }

    /** Insert an image by (sanitized) URL — http(s), relative, or data:image/*. */
    setImage(src: string): void {
        const safe = sanitizeImageSrc(src);
        if (safe) {
            this.editor.chain().focus().setImage({ src: safe }).run();
        }
    }

    /** Characters in the document (CharacterCount extension; 0 when unlimited+absent). */
    charCount(): number {
        const s = (this.editor.storage as { characterCount?: { characters(): number } }).characterCount;
        return s ? s.characters() : 0;
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
