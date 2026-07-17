// Pure logic for the rich text editor: URL sanitization for links, plain-text
// derivation for the search/indexing outputs, and the feature model. No DOM,
// no TipTap — everything here runs under plain-node jest.

/** Which formatting features the toolbar and the document schema allow. */
export interface RteFeatures {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    headings: boolean;
    bulletList: boolean;
    orderedList: boolean;
    link: boolean;
}

export const ALL_FEATURES: RteFeatures = {
    bold: true, italic: true, underline: true, strike: true,
    headings: true, bulletList: true, orderedList: true, link: true
};

/**
 * Allow http(s), mailto, tel and same-origin relative URLs; reject everything
 * else (javascript:, data:, vbscript:, file:, ...). Content is stored in a
 * database and rendered into every operator's session, so link hrefs are an
 * XSS surface. Returns the trimmed URL, or null when rejected.
 */
export function sanitizeUrl(raw: string | null | undefined): string | null {
    if (!raw) {
        return null;
    }
    const url = raw.trim();
    if (!url) {
        return null;
    }
    // Relative / fragment / query-only links carry no scheme and are safe.
    if (/^[/#?.]/.test(url) && !url.startsWith('//')) {
        return url;
    }
    // Scheme-relative ('//host') inherits http(s) — allowed.
    if (url.startsWith('//')) {
        return url;
    }
    const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
    if (!scheme) {
        return url;   // bare host ('example.com/page') — autolink territory, no scheme to abuse
    }
    const ok = ['http', 'https', 'mailto', 'tel'];
    return ok.indexOf(scheme[1].toLowerCase()) >= 0 ? url : null;
}

/** Minimal entity decoding for the plain-text mirror (the common five + nbsp). */
function decodeEntities(s: string): string {
    return s
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

/**
 * Plain text of an HTML fragment: block-level tags become newlines, the rest
 * of the markup is stripped, entities decoded, whitespace collapsed per line.
 * Feeds output.plainText (DB search/indexing) and the word count.
 */
export function plainTextOf(html: string): string {
    if (!html) {
        return '';
    }
    const withBreaks = html
        .replace(/<(?:p|div|li|h[1-6]|br|tr)[^>]*>/gi, '\n$&')
        .replace(/<[^>]+>/g, '');
    return decodeEntities(withBreaks)
        .split('\n')
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter((l) => l.length > 0)
        .join('\n');
}

export function wordCountOf(text: string): number {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
}

/** '{n}'-style template fill for label strings. */
export function fillLabel(template: string, vars: { [k: string]: string | number }): string {
    return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
