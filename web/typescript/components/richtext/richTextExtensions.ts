// TipTap extensions that enforce the editor's configured limits. Kept apart
// from the controller because they need no DOM: their schema and plugin
// behaviour is tested under plain node.
import { Extension, getChangedRanges, mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { countChars, imageSrcWithinPolicy, pasteTrimRanges } from './richTextLogic';

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
