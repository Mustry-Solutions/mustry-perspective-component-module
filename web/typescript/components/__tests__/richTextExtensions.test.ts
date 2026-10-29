// The TipTap extensions that enforce the editor's limits, exercised on their
// real ProseMirror schema. Plain node: parse rules are called with a stand-in
// element (all a rule reads is getAttribute), render through the node's toDOM.
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { DOMOutputSpec, Schema, TagParseRule } from '@tiptap/pm/model';
import { policyImage } from '../richtext/richTextExtensions';

const MAX_KB = 1;
const small = 'data:image/png;base64,' + 'A'.repeat(1000);   // ~0.7 KB
const large = 'data:image/png;base64,' + 'A'.repeat(4096);   // ~3 KB

function imageSchema(maxKb = MAX_KB): Schema {
    return getSchema([StarterKit, policyImage(maxKb)]);
}

/** Run the image parse rule the way ProseMirror does for `<img src=...>`. */
function parseImg(schema: Schema, src: string): Record<string, unknown> | false | null | undefined {
    const rule = (schema.nodes.image.spec.parseDOM || [])[0] as TagParseRule;
    expect(rule.tag).toBe('img[src]');
    const el = { getAttribute: (name: string) => (name === 'src' ? src : null) } as unknown as HTMLElement;
    return rule.getAttrs ? rule.getAttrs(el) : rule.attrs;
}

/** The attributes the image renders with (editor DOM and getHTML both). */
function renderedAttrs(schema: Schema, src: string): Record<string, unknown> {
    const spec = schema.nodes.image.spec.toDOM!(schema.nodes.image.create({ src })) as DOMOutputSpec;
    const arr = spec as unknown as [string, Record<string, unknown>];
    expect(arr[0]).toBe('img');
    return arr[1];
}

describe('policyImage: config.maxImageKb and the image URL policy on every path (#137)', () => {
    const schema = imageSchema();

    it('parses allowed sources: URLs and data URIs under the cap', () => {
        expect(parseImg(schema, 'https://example.com/a.png')).toMatchObject({ src: 'https://example.com/a.png' });
        expect(parseImg(schema, '/system/images/logo.png')).toMatchObject({ src: '/system/images/logo.png' });
        expect(parseImg(schema, small)).toMatchObject({ src: small });
    });

    it('drops an oversized data URI from pasted HTML or bound content', () => {
        expect(parseImg(schema, large)).toBe(false);
    });

    it('drops sources outside the URL policy', () => {
        expect(parseImg(schema, 'javascript:alert(1)')).toBe(false);
        expect(parseImg(schema, 'data:text/html,<b>x</b>')).toBe(false);
        expect(parseImg(schema, 'ftp://files.example/a.png')).toBe(false);
        expect(parseImg(schema, '   ')).toBe(false);
    });

    it('reads the cap it was built with (the controller rebuilds on change)', () => {
        expect(parseImg(imageSchema(4), large)).toMatchObject({ src: large });
    });

    it('renders an allowed src unchanged', () => {
        expect(renderedAttrs(schema, small).src).toBe(small);
        expect(renderedAttrs(schema, 'https://example.com/a.png').src).toBe('https://example.com/a.png');
    });

    it('never renders a src that fails the policy, however the node was made', () => {
        expect(renderedAttrs(schema, large).src).toBeUndefined();
        expect(renderedAttrs(schema, 'javascript:alert(1)').src).toBeUndefined();
    });
});
