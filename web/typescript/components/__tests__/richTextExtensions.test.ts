// The TipTap extensions that enforce the editor's limits, exercised on their
// real ProseMirror schema. Plain node: parse rules are called with a stand-in
// element (all a rule reads is getAttribute), render through the node's toDOM.
import { Editor, JSONContent, getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { DOMOutputSpec, Schema, TagParseRule } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { RteSchemaOpts, policyImage, rteExtensions } from '../richtext/richTextExtensions';
import { ALL_FEATURES, RteFeatures } from '../richtext/richTextLogic';

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

const NO_FEATURES = Object.fromEntries(Object.keys(ALL_FEATURES).map((k) => [k, false])) as unknown as RteFeatures;

function schemaOpts(over: Partial<RteSchemaOpts> = {}): RteSchemaOpts {
    return { editable: true, placeholder: '', features: ALL_FEATURES, charLimit: 0, maxImageKb: 100, fonts: [], ...over };
}

const sorted = (o: object): string[] => Object.keys(o).sort();

describe('rteExtensions: the schema is exactly what the features allow', () => {
    // The schema IS the sanitization model. TipTap 3's StarterKit also bundles
    // Link and Underline, so a feature flag that is not passed through to
    // StarterKit leaves that mark in the schema with TipTap's defaults.
    it('with every feature off, only plain paragraphs remain', () => {
        const schema = getSchema(rteExtensions(schemaOpts({ features: NO_FEATURES }), () => false));
        expect(sorted(schema.marks)).toEqual([]);
        expect(sorted(schema.nodes)).toEqual(['doc', 'hardBreak', 'listItem', 'paragraph', 'text']);
    });

    it('with every feature on, nothing beyond the features (no code, quotes or rules)', () => {
        const schema = getSchema(rteExtensions(schemaOpts({ fonts: ['Arial'] }), () => false));
        expect(sorted(schema.marks)).toEqual(['bold', 'italic', 'link', 'strike', 'textStyle', 'underline']);
        expect(sorted(schema.nodes)).toEqual([
            'bulletList', 'doc', 'hardBreak', 'heading', 'image', 'listItem', 'orderedList', 'paragraph',
            'table', 'tableCell', 'tableHeader', 'tableRow', 'taskItem', 'taskList', 'text'
        ]);
    });

    it('link and underline follow their own feature flags', () => {
        const only = (feature: keyof RteFeatures) =>
            sorted(getSchema(rteExtensions(schemaOpts({ features: { ...NO_FEATURES, [feature]: true } }), () => false)).marks);
        expect(only('link')).toEqual(['link']);
        expect(only('underline')).toEqual(['underline']);
    });

    it('links parse through our URL policy, not TipTap\'s allowlist', () => {
        const schema = getSchema(rteExtensions(schemaOpts(), () => false));
        const rule = (schema.marks.link.spec.parseDOM || [])[0] as TagParseRule;
        const parse = (href: string) => {
            const el = { getAttribute: (name: string) => (name === 'href' ? href : null) } as unknown as HTMLElement;
            return rule.getAttrs ? rule.getAttrs(el) : rule.attrs;
        };
        expect(parse('https://example.com')).not.toBe(false);
        expect(parse('mailto:ops@example.com')).not.toBe(false);
        expect(parse('javascript:alert(1)')).toBe(false);
        // TipTap's own allowlist takes these; ours does not.
        expect(parse('ftp://files.example/a')).toBe(false);
        expect(parse('xmpp:ops@example.com')).toBe(false);
    });
});

describe('rteExtensions: the editor never rewrites bound content by itself', () => {
    const para = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const list = (text: string): JSONContent => ({ type: 'bulletList', content: [{ type: 'listItem', content: [para(text)] }] });
    const editors: Editor[] = [];
    afterAll(() => editors.forEach((e) => e.destroy()));

    /** The editor's real plugin set over `doc`. A headless Editor resolves the
     *  extensions; its own state has no plugins until it is mounted on a DOM,
     *  so the state is built from the extension manager's plugins. */
    function stateFor(content: JSONContent[], over: Partial<RteSchemaOpts> = {}): EditorState {
        const editor = new Editor({ extensions: rteExtensions(schemaOpts(over), () => false), content: { type: 'doc', content } });
        editors.push(editor);
        return EditorState.create({ schema: editor.schema, doc: editor.state.doc, plugins: editor.extensionManager.plugins });
    }

    /** Apply a selection-only transaction: anything that changes the doc is
     *  a plugin appending its own edit. */
    function afterFirstTransaction(state: EditorState): EditorState {
        return state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));
    }

    it('keeps a bound document that is already over charLimit (TipTap 3 autoTrim off)', () => {
        const state = stateFor([para('abcdefghij'), list('x')], { charLimit: 5 });
        expect(afterFirstTransaction(state).doc.toJSON()).toEqual(state.doc.toJSON());
    });

    it('adds no trailing paragraph after a list, table or image', () => {
        const state = stateFor([para('a'), list('b')]);
        const after = afterFirstTransaction(state).doc;
        expect(after.childCount).toBe(2);
        expect(after.lastChild!.type.name).toBe('bulletList');
    });

    it('still enforces charLimit while typing', () => {
        const state = stateFor([para('abcd')], { charLimit: 5 });
        const end = state.doc.content.size - 1;
        const typed = state.apply(state.tr.insertText('e', end));
        expect(typed.doc.textContent).toBe('abcde');
        expect(typed.apply(typed.tr.insertText('f', end + 1)).doc.textContent).toBe('abcde');
    });
});
