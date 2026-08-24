import { fillLabel, plainTextOf, sanitizeUrl, wordCountOf } from '../richtext/richTextLogic';

describe('sanitizeUrl', () => {
    it('allows http/https/mailto/tel', () => {
        expect(sanitizeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
        expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
        expect(sanitizeUrl('mailto:ops@plant.example')).toBe('mailto:ops@plant.example');
        expect(sanitizeUrl('tel:+3212345678')).toBe('tel:+3212345678');
    });

    it('allows relative, fragment and scheme-relative URLs', () => {
        expect(sanitizeUrl('/data/perspective/client/verify')).toBe('/data/perspective/client/verify');
        expect(sanitizeUrl('#section-2')).toBe('#section-2');
        expect(sanitizeUrl('./sibling')).toBe('./sibling');
        expect(sanitizeUrl('//cdn.example.com/doc')).toBe('//cdn.example.com/doc');
        expect(sanitizeUrl('example.com/page')).toBe('example.com/page');
    });

    it('rejects script-bearing and exotic schemes', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
        expect(sanitizeUrl('JaVaScRiPt:alert(1)')).toBeNull();
        expect(sanitizeUrl('  javascript:alert(1)')).toBeNull();
        expect(sanitizeUrl('data:text/html,<script>1</script>')).toBeNull();
        expect(sanitizeUrl('vbscript:x')).toBeNull();
        expect(sanitizeUrl('file:///etc/passwd')).toBeNull();
    });

    // These are the schemes TipTap's OWN default allowlist permits. Our policy
    // is narrower, but until the controller passed `isAllowedUri` (it passed
    // the deprecated `validate`) the default was what actually governed hrefs
    // arriving from bound content or a paste. Pinned here so the policy and
    // the wiring can't drift apart again unnoticed.
    it('rejects the extra schemes TipTap would allow by default', () => {
        expect(sanitizeUrl('ftp://files.example/report.pdf')).toBeNull();
        expect(sanitizeUrl('ftps://files.example/report.pdf')).toBeNull();
        expect(sanitizeUrl('callto:+3212345678')).toBeNull();
        expect(sanitizeUrl('sms:+3212345678')).toBeNull();
        expect(sanitizeUrl('cid:part1.example')).toBeNull();
        expect(sanitizeUrl('xmpp:ops@plant.example')).toBeNull();
    });

    it('handles empty input', () => {
        expect(sanitizeUrl('')).toBeNull();
        expect(sanitizeUrl('   ')).toBeNull();
        expect(sanitizeUrl(null)).toBeNull();
        expect(sanitizeUrl(undefined)).toBeNull();
    });
});

describe('plainTextOf', () => {
    it('strips tags and keeps block boundaries as newlines', () => {
        expect(plainTextOf('<h2>Title</h2><p>Body <strong>bold</strong> text.</p>'))
            .toBe('Title\nBody bold text.');
    });

    it('turns list items into lines', () => {
        expect(plainTextOf('<ul><li>One</li><li>Two</li></ul>')).toBe('One\nTwo');
    });

    it('decodes common entities and collapses whitespace', () => {
        expect(plainTextOf('<p>a&nbsp;&amp;&nbsp;b   c</p>')).toBe('a & b c');
        expect(plainTextOf('<p>&lt;tag&gt; &quot;q&quot; &#39;s&#39;</p>')).toBe('<tag> "q" \'s\'');
    });

    it('handles empty input', () => {
        expect(plainTextOf('')).toBe('');
        expect(plainTextOf('<p></p>')).toBe('');
    });
});

describe('wordCountOf', () => {
    it('counts words across lines', () => {
        expect(wordCountOf('Title\nBody bold text.')).toBe(4);
        expect(wordCountOf('')).toBe(0);
        expect(wordCountOf('   ')).toBe(0);
        expect(wordCountOf('one')).toBe(1);
    });
});

describe('fillLabel', () => {
    it('substitutes known vars and leaves unknown ones', () => {
        expect(fillLabel('Heading {n}', { n: 2 })).toBe('Heading 2');
        expect(fillLabel('{a} and {b}', { a: 'x' })).toBe('x and {b}');
    });
});

describe('sanitizeImageSrc', () => {
    const { sanitizeImageSrc, dataUriKb } = require('../richtext/richTextLogic');

    it('allows data:image URIs, http(s) and relative', () => {
        expect(sanitizeImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
        expect(sanitizeImageSrc('https://example.com/a.png')).toBe('https://example.com/a.png');
        expect(sanitizeImageSrc('/res/mustry-components/logo.png')).toBe('/res/mustry-components/logo.png');
    });

    it('rejects non-image data URIs and script schemes', () => {
        expect(sanitizeImageSrc('data:text/html,<script>1</script>')).toBeNull();
        expect(sanitizeImageSrc('javascript:alert(1)')).toBeNull();
        expect(sanitizeImageSrc('')).toBeNull();
    });

    it('measures data URI payload size in KB', () => {
        const kb = dataUriKb('data:image/png;base64,' + 'A'.repeat(4096));
        expect(kb).toBeCloseTo(3, 0);   // 4096 base64 chars ~ 3072 bytes
        expect(dataUriKb('no-comma')).toBeGreaterThan(0);
    });
});
