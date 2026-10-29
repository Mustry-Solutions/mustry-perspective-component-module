// Over-limit paste trimming (config.charLimit, #168) on real ProseMirror docs
// built from the editor's own schema. A paste is replayed the way ProseMirror
// dispatches one (replaceSelection + the 'paste' meta) through EditorState, so
// the plugin's filterTransaction runs exactly as in the browser.
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Fragment, Node as PMNode, Slice } from '@tiptap/pm/model';
import { EditorState, Plugin, TextSelection } from '@tiptap/pm/state';
import { countChars, pasteTrimRanges } from '../richtext/richTextLogic';
import { pasteTrimPlugin, policyImage } from '../richtext/richTextExtensions';

const schema = getSchema([StarterKit, policyImage(256)]);
const p = (text = ''): PMNode => schema.node('paragraph', null, text ? [schema.text(text)] : []);
const img = (): PMNode => schema.nodes.image.create({ src: 'https://example.com/a.png' });
const doc = (...blocks: PMNode[]): PMNode => schema.node('doc', null, blocks);

/** The limit's measure: CharacterCount's textSize (leaf nodes count 1). */
const chars = (d: PMNode): number => countChars(d.textBetween(0, d.content.size, undefined, ' '));
const texts = (d: PMNode): string[] => {
    const out: string[] = [];
    d.forEach((n) => out.push(n.type.name === 'paragraph' ? n.textContent : `[${n.type.name}]`));
    return out;
};

// Stand-in for CharacterCount's last word: a paste still over the limit after
// trimming is rejected outright (nothing inserted). That is the #168 symptom.
const rejectOverLimit = (limit: number): Plugin => new Plugin({
    filterTransaction: (tr) => !tr.docChanged || chars(tr.doc) <= limit
});

function paste(d: PMNode, from: number, to: number, blocks: PMNode[], limit: number): { doc: PMNode; rejected: boolean } {
    const state = EditorState.create({
        doc: d,
        selection: TextSelection.create(d, from, to),
        plugins: [pasteTrimPlugin(limit), rejectOverLimit(limit)]
    });
    const last = blocks[blocks.length - 1];
    const slice = new Slice(Fragment.fromArray(blocks), blocks[0].isTextblock ? 1 : 0, last.isTextblock ? 1 : 0);
    const tr = state.tr.replaceSelection(slice).setMeta('paste', true);
    const next = state.applyTransaction(tr).state;
    next.doc.check();
    return { doc: next.doc, rejected: next === state };
}

describe('pasteTrimRanges (pure position math)', () => {
    it('walks back into earlier textblocks once the last one runs out', () => {
        // doc: <p>abcdef</p><p>g</p>; paste range = all text (1..10)
        const d = doc(p('abcdef'), p('g'));
        expect(pasteTrimRanges(d, 1, 10, 2)).toEqual([[9, 10], [6, 7]]);
    });

    it('stays inside the pasted range', () => {
        // <p>XYab</p><p>cdZ</p>: pasted text is "ab" (3..5) and "cd" (7..9)
        const d = doc(p('XYab'), p('cdZ'));
        expect(pasteTrimRanges(d, 3, 9, 3)).toEqual([[7, 9], [4, 5]]);
    });

    it('trims whole graphemes, not UTF-16 units', () => {
        const d = doc(p('a😀'), p('👍🏽'));
        const ranges = pasteTrimRanges(d, 1, d.content.size - 1, 2);
        expect(ranges).toEqual([[6, 6 + '👍🏽'.length], [2, 4]]);
    });

    it('removes a block image at the end of the range (head not in a textblock)', () => {
        const d = doc(p('abc'), img());
        // range ends after the image: $head.parent would be the doc
        expect(pasteTrimRanges(d, 1, d.content.size, 2)).toEqual([[5, 6], [3, 4]]);
    });

    it('returns nothing when there is no overflow', () => {
        expect(pasteTrimRanges(doc(p('abc')), 1, 4, 0)).toEqual([]);
    });
});

describe('pasteTrimPlugin: over-limit pastes are trimmed, not rejected (#168)', () => {
    it('repro: charLimit 5, empty editor, paste "abcdef" + "g"', () => {
        const r = paste(doc(p()), 1, 1, [p('abcdef'), p('g')], 5);
        expect(r.rejected).toBe(false);
        expect(texts(r.doc)).toEqual(['abcde', '']);
        expect(chars(r.doc)).toBe(5);
    });

    it('keeps the text around the cursor and trims only the pasted part', () => {
        // XY|Z, limit 5, paste "ab" + "cd": room for 2 of the 4 pasted chars
        const r = paste(doc(p('XYZ')), 3, 3, [p('ab'), p('cd')], 5);
        expect(r.rejected).toBe(false);
        expect(texts(r.doc)).toEqual(['XYab', 'Z']);
    });

    it('trims emoji and ZWJ sequences as one character each', () => {
        const family = '👨‍👩‍👧';
        const r = paste(doc(p()), 1, 1, [p('a😀'), p(family + '👍🏽'), p('🇧🇪')], 2);
        expect(r.rejected).toBe(false);
        expect(texts(r.doc)).toEqual(['a😀', '', '']);
        expect(chars(r.doc)).toBe(2);
    });

    it('trims a paste that ends on a block image', () => {
        const r = paste(doc(p()), 1, 1, [p('abc'), img()], 2);
        expect(r.rejected).toBe(false);
        expect(chars(r.doc)).toBe(2);
        expect(texts(r.doc).join('|')).not.toContain('[image]');
        expect(r.doc.textContent).toBe('ab');
    });

    it('a full editor takes nothing but does not reject', () => {
        const r = paste(doc(p('abc')), 4, 4, [p('de'), p('f')], 3);
        expect(r.rejected).toBe(false);
        expect(r.doc.textContent).toBe('abc');
    });

    it('leaves a paste within the limit alone', () => {
        const r = paste(doc(p()), 1, 1, [p('ab'), p('c')], 5);
        expect(texts(r.doc)).toEqual(['ab', 'c']);
    });

    // Random over-limit multi-paragraph pastes (fixed seed): every one must
    // land at exactly the limit. Before #168 about 83% were rejected outright.
    it('randomized: every over-limit paste lands at the limit (seeded)', () => {
        let seed = 0x5eed168;
        const rand = (): number => {   // mulberry32
            seed = (seed + 0x6d2b79f5) | 0;
            let t = seed;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
        // Graphemes that never merge with a neighbour across a block or paste
        // edge, so the expected count is exact.
        const alphabet = ['a', 'b', ' ', 'é', 'é', '😀', '👍🏽', '🇧🇪', '👨‍👩‍👧'];
        const word = (min: number, max: number): string[] => Array.from({ length: int(min, max) }, () => alphabet[int(0, alphabet.length - 1)]);

        let cases = 0;
        for (let i = 0; i < 3000; i++) {
            const paras = Array.from({ length: int(1, 3) }, () => word(0, 4));
            const d = doc(...paras.map((g) => p(g.join(''))));
            // cursor (and sometimes a selection) on grapheme boundaries of one paragraph
            const pi = int(0, paras.length - 1);
            let start = 1;
            for (let k = 0; k < pi; k++) {
                start += paras[k].join('').length + 2;
            }
            const a = int(0, paras[pi].length);
            const b = rand() < 0.3 ? int(a, paras[pi].length) : a;
            const from = start + paras[pi].slice(0, a).join('').length;
            const to = start + paras[pi].slice(0, b).join('').length;
            const kept = chars(d) - countChars(paras[pi].slice(a, b).join(''));

            const blocks = Array.from({ length: int(2, 4) }, () => p(word(1, 6).join('')));
            if (rand() < 0.25) {
                blocks.push(img());
            }
            const pasted = chars(doc(...blocks));
            const limit = kept + int(0, pasted - 1);   // over by at least 1
            if (chars(d) > limit) {
                continue;   // already over: the plugin stands aside by design
            }
            cases++;
            const r = paste(d, from, to, blocks, limit);
            const all = (x: PMNode, a = 0, b = x.content.size): string => x.textBetween(a, b, '\n', ' ');
            const untouched = all(r.doc).startsWith(all(d, 0, from)) && all(r.doc).endsWith(all(d, to));
            if (r.rejected || chars(r.doc) !== limit || !untouched) {
                throw new Error(`case ${i}: limit ${limit}, rejected ${r.rejected}, chars ${chars(r.doc)}, `
                    + `doc ${JSON.stringify(texts(d))} sel ${from}-${to}, paste ${JSON.stringify(texts(doc(...blocks)))}`);
            }
        }
        expect(cases).toBeGreaterThan(1500);
    });
});
