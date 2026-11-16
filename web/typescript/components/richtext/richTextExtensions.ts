// The editor's TipTap extension set, and the extensions that enforce its
// configured limits. Kept apart from the controller because none of it needs a
// DOM: the schema the features produce, and the plugins' behaviour, are tested
// under plain node.
import { Extension, Extensions, getChangedRanges, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { FontFamily, TextStyle } from '@tiptap/extension-text-style';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { RteFeatures, countChars, imageSrcWithinPolicy, pasteTrimRanges, sanitizeUrl } from './richTextLogic';

/** What the extension set (and so the document schema) is built from. */
export interface RteSchemaOpts {
    editable: boolean;
    placeholder: string;
    features: RteFeatures;
    /** 0 = unlimited. Enforced by the CharacterCount extension. */
    charLimit: number;
    /** Max embedded (data URI) image size in KB; larger images are dropped
     *  wherever they come from: bound content, paste, or the toolbar. */
    maxImageKb: number;
    /** Font families operators may pick; empty = font feature off. */
    fonts: string[];
}

/**
 * The editor's extensions: a feature-constrained schema, where only the
 * allowlisted node and mark types can EXIST in the document. That is the
 * sanitization model, so every StarterKit member is either gated by a feature
 * or switched off explicitly.
 *
 * TipTap 3's StarterKit also bundles Link, Underline, ListKeymap and
 * TrailingNode. Left at their defaults, Link would load with TipTap's own URL
 * allowlist even when `features.link` is off, and Underline would load with
 * `features.underline` off. Both are configured here, from the features.
 *
 * `onReadOnlyChecked` is the display-mode checklist toggle. It needs the live
 * editor, so the controller supplies it.
 */
export function rteExtensions(
    opts: RteSchemaOpts,
    onReadOnlyChecked: (node: PMNode, checked: boolean) => boolean
): Extensions {
    const f = opts.features;
    return [
        StarterKit.configure({
            // Lean M0 schema: what the features allow, nothing else.
            bold: f.bold ? undefined : false,
            italic: f.italic ? undefined : false,
            underline: f.underline ? undefined : false,
            strike: f.strike ? undefined : false,
            heading: f.headings ? { levels: [1, 2, 3] } : false,
            bulletList: f.bulletList ? undefined : false,
            orderedList: f.orderedList ? undefined : false,
            link: f.link ? {
                // Display mode navigates; edit mode keeps clicks for editing.
                openOnClick: !opts.editable,
                autolink: true,
                linkOnPaste: true,
                HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
                // `isAllowedUri`, NOT the older `validate`. This is the gate
                // parseHTML, renderHTML, setLink, paste and the autolink
                // plugin all consult. `validate` was worse than merely
                // deprecated here: extension-link only forwarded it to
                // shouldAutoLink when that option was unset, and it defaults
                // to a function, so the branch never ran. Our sanitizeUrl was
                // wired to nothing at all and links fell back to TipTap's own
                // allowlist (ftp, ftps, callto, sms, cid, xmpp beyond ours).
                isAllowedUri: (href: string) => sanitizeUrl(href) !== null
            } : false,
            code: false,
            codeBlock: false,
            blockquote: false,
            horizontalRule: false,
            // TrailingNode appends an empty paragraph after a document that
            // ends in a table, list or image. That changes bound content the
            // operator never touched (the editor's HTML stops matching
            // data.content) and pads read-only displays, so it stays off, as
            // it was under TipTap 2.
            trailingNode: false
        }),
        ...(f.table ? [
            Table.configure({ resizable: false }),
            TableRow, TableHeader, TableCell
        ] : []),
        ...(f.image ? [policyImage(opts.maxImageKb)] : []),
        ...(f.checklist ? [
            TaskList,
            TaskItem.configure({
                nested: false,
                // Display mode keeps checkboxes interactive. TipTap only flips
                // the checkbox VISUALLY in read-only mode (it never touches the
                // document), so the controller applies the attribute change.
                onReadOnlyChecked
            })
        ] : []),
        // The font allowlist is an EDITING constraint; a read-only display
        // renders whatever fonts the saved document carries.
        ...((opts.fonts.length || !opts.editable) ? [TextStyle, FontFamily] : []),
        // CharacterCount is only for limit enforcement while typing.
        // output.charCount is derived from plainTextOf in the component: this
        // extension is absent when unlimited, and even when present it reads
        // the live draft, not the bound/saved doc the outputs track.
        ...(opts.charLimit > 0 ? [
            pasteTrimToLimit(opts.charLimit),
            CharacterCount.configure({
                limit: opts.charLimit,
                textCounter: countChars,
                // TipTap 3 default: on the first transaction, delete
                // positions 0..overflow from a document already over the
                // limit. That cuts the START of an operator's bound document
                // and reports it as a user edit, and the component never
                // mutates bound data. The limit stays a typing limit, as it
                // was under TipTap 2.
                autoTrim: false
            })
        ] : []),
        ...(opts.editable && opts.placeholder
            ? [Placeholder.configure({ placeholder: opts.placeholder })] : [])
    ];
}

/**
 * Block images whose src always passes imageSrcWithinPolicy. Stock Image
 * (allowBase64) parses any `img[src]`, so pasted HTML and bound content
 * skipped the URL policy and config.maxImageKb (#137). The parse rule now
 * drops a failing image; render leaves out a failing src, which covers nodes
 * made without parsing (commands, the `![alt](src)` input rule). The
 * controller is rebuilt when maxImageKb changes, so the closure stays current.
 */
export function policyImage(maxKb: number) {
    const allowed = (src: unknown): string | null =>
        imageSrcWithinPolicy(typeof src === 'string' ? src : null, maxKb);
    return Image.extend({
        parseHTML() {
            return [{
                tag: 'img[src]',
                getAttrs: (el: HTMLElement) => (allowed(el.getAttribute('src')) ? null : false)
            }];
        },
        renderHTML({ HTMLAttributes }) {
            const attrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
            const src = allowed(attrs.src);
            if (src) {
                attrs.src = src;
            } else {
                delete attrs.src;
            }
            return ['img', attrs];
        }
    }).configure({ inline: false, allowBase64: true });
}

const docChars = (doc: PMNode): number => countChars(doc.textBetween(0, doc.content.size, undefined, ' '));

// CharacterCount trims an over-limit paste by deleting `over` POSITIONS back
// from the cursor. Its textCounter (countChars) counts graphemes, and block
// boundaries take positions but count 0, so emoji and multi-paragraph pastes
// were trimmed short and then rejected outright (#163, #168). Trim first, by
// grapheme and across every pasted block, so the transaction reaching
// CharacterCount is already within the limit.
export function pasteTrimPlugin(limit: number): Plugin {
    return new Plugin({
        key: new PluginKey('pasteTrimToLimit'),
        filterTransaction: (tr, state) => {
            if (!tr.docChanged || !tr.getMeta('paste') || docChars(state.doc) > limit) {
                return true;
            }
            const over = docChars(tr.doc) - limit;
            if (over > 0) {
                // Trim inside what the paste changed, not back from $head:
                // a paste that ends on a block image leaves the head outside
                // any textblock, and the replace step can also swallow the
                // closing token of the block the cursor was in.
                const changed = getChangedRanges(tr).map((c) => c.newRange);
                const from = Math.min(...changed.map((r) => r.from));
                const to = Math.max(...changed.map((r) => r.to));
                pasteTrimRanges(tr.doc, from, to, over).forEach(([a, b]) => tr.delete(a, b));
            }
            return true;
        }
    });
}

export function pasteTrimToLimit(limit: number): Extension {
    return Extension.create({
        name: 'pasteTrimToLimit',
        priority: 101, // ahead of CharacterCount (100)
        addProseMirrorPlugins() {
            return [pasteTrimPlugin(limit)];
        }
    });
}
