// TipTap extensions that enforce the editor's configured limits. Kept apart
// from the controller because they need no DOM: their schema and plugin
// behaviour is tested under plain node.
import { mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { imageSrcWithinPolicy } from './richTextLogic';

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
