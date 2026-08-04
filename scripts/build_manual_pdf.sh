#!/usr/bin/env bash
#
# Convert the user manual (Markdown) to a Mustry-branded PDF.
#
# Usage:
#   scripts/build_manual_pdf.sh [SOURCE_MD] [OUTPUT_PDF]
#
# Defaults:
#   SOURCE_MD  = docs/user_manual.md
#   OUTPUT_PDF = build/user_manual.pdf
#
# Optional environment variables (shown on the cover page):
#   MANUAL_DATE     override the date (default: today, e.g. "1 July 2026")
#   MANUAL_VERSION  module version string, e.g. "1.0.42" (hidden if unset)
#
# Branding comes from docs/assets/ (Mustry logos + Visby/Baton web fonts), so
# the build is self-contained and produces the same result locally and in CI.
#
# Requirements: Node.js (uses `npx md-to-pdf`, which renders via a headless
# Chrome-for-Testing binary that this script installs automatically).
#
# Image references that don't exist yet (screenshots still to be added) are
# replaced with a styled "screenshot to be added" placeholder so the PDF
# always renders cleanly.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-$ROOT/docs/user_manual.md}"
OUT="${2:-$ROOT/build/user_manual.pdf}"

if [ ! -f "$SRC" ]; then
  echo "error: source markdown not found: $SRC" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

SRC_DIR="$(cd "$(dirname "$SRC")" && pwd)"
TMP="$SRC_DIR/.user_manual.build.md"
TMP_PDF="$SRC_DIR/.user_manual.build.pdf"
STAMP_JS="$SRC_DIR/.stamp_footer.js"
cleanup() { rm -f "$TMP" "$TMP_PDF" "$STAMP_JS"; }
trap cleanup EXIT

# 1. Build the branded, render-ready markdown: front matter (options + brand
#    CSS) + cover page + body (with missing screenshots swapped for
#    placeholders). The temp file lives next to the source so relative
#    `assets/...` and `images/...` paths still resolve.
python3 - "$SRC" "$SRC_DIR" > "$TMP" <<'PY'
import datetime, os, re, sys

src, base = sys.argv[1], sys.argv[2]
text = open(src, encoding="utf-8").read()

date_str = os.environ.get("MANUAL_DATE") or datetime.date.today().strftime("%-d %B %Y")
version = os.environ.get("MANUAL_VERSION", "").strip()

# --- swap missing local images for placeholders (keeps list indentation) ---
img_re = re.compile(r'^([ \t]*)!\[([^\]]*)\]\(([^)]+)\)[ \t]*$', re.M)

def repl(m):
    indent, alt, path = m.group(1), m.group(2), m.group(3)
    if re.match(r'^[a-z]+://', path):      # leave remote images alone
        return m.group(0)
    if os.path.isfile(os.path.join(base, path)):
        return m.group(0)
    label = alt or "Screenshot"
    return ('%s<div class="screenshot-placeholder">%s'
            '<br><span>screenshot to be added</span></div>' % (indent, label))

body = img_re.sub(repl, text)

# The cover page carries the title, so drop the first H1 from the body.
body = re.sub(r'^#\s+.*\n', '', body, count=1)

# Keep the Table of Contents on its own page: turn the separator between the
# ToC and the first section into an invisible page break, so content starts on
# page 3. Using page-break-*after* (on content that precedes it) avoids the
# stray blank page an empty page-break-before element would create.
toc_idx = body.find('## Table of Contents')
if toc_idx != -1:
    next_h2 = body.find('\n## ', toc_idx + len('## Table of Contents'))
    if next_h2 != -1:
        head, tail = body[:next_h2], body[next_h2:]
        brk = '\n<div class="page-break-after"></div>\n'
        sep = head.rfind('\n---\n')          # the '---' just before the section
        if sep != -1:
            head = head[:sep] + brk + head[sep + len('\n---\n'):]
        else:
            head = head + brk
        body = head + tail

# --- cover page ---
version_html = ('<div class="cover-version">Version %s</div>' % version) if version else ''
cover = '''<div class="cover">
  <div class="cover-inner">
    <img class="cover-logo" src="assets/mustry-logo-light.png" alt="Mustry Solutions" />
    <div class="cover-eyebrow">Ignition&nbsp;8.3+ Module</div>
    <h1 class="cover-title">Ingots</h1>
    <div class="cover-subtitle">User Manual</div>
  </div>
  <div class="cover-footer">
    <div class="cover-company">Mustry Solutions</div>
    <div class="cover-date">%s</div>
    %s
  </div>
</div>

''' % (date_str, version_html)

# --- md-to-pdf front matter (page options + brand CSS) ---
front = r'''---
pdf_options:
  printBackground: true
  preferCSSPageSize: true
  displayHeaderFooter: false
css: |
  :root { --navy:#10172A; --blue:#295EF6; --lblue:#96B0FB; --ink:#1b2740; --muted:#5b667e; }

  /* Page geometry driven by CSS (preferCSSPageSize) so the cover can bleed to
     the edges while body pages keep their reading margins. */
  @page { size:A4; margin:15mm 16mm 17mm 16mm; }
  @page cover { margin:0; }

  @font-face { font-family:'Visby'; src:url('assets/fonts/visby.woff2') format('woff2'), url('assets/fonts/visby.woff') format('woff'); font-weight:800; font-style:normal; }
  @font-face { font-family:'Baton'; src:url('assets/fonts/baton-book.woff2') format('woff2'), url('assets/fonts/baton-book.woff') format('woff'); font-weight:400; font-style:normal; }

  body { margin:0; font-family:'Baton', "Segoe UI", Helvetica, Arial, sans-serif; font-size:10.5pt; line-height:1.55; color:var(--ink); }

  h1, h2, h3, h4 { font-family:'Visby', "Segoe UI", Helvetica, Arial, sans-serif; font-weight:800; color:var(--navy); line-height:1.2; }
  h1 { font-size:21pt; margin:0.2em 0 0.5em; padding-bottom:6px; border-bottom:3px solid var(--blue); }
  h2 { font-size:15pt; margin:1.5em 0 0.5em; padding-bottom:4px; border-bottom:1px solid var(--lblue); }
  h3 { font-size:12.5pt; color:var(--blue); margin:1.2em 0 0.4em; }
  h4 { font-size:11pt; }

  a { color:var(--blue); text-decoration:none; }
  strong { color:var(--navy); font-weight:700; }

  code { font-family:"SFMono-Regular", Consolas, "Liberation Mono", monospace; background:#eef2fb; color:var(--navy); padding:1px 4px; border-radius:3px; font-size:0.82em !important; }
  pre { background:#f5f7fc; border:1px solid #e2e8f5; border-left:3px solid var(--blue); padding:10px 12px; border-radius:5px; overflow-x:auto; font-size:8.5pt; line-height:1.45; }
  pre code { background:none; padding:0; color:var(--ink); font-size:inherit !important; }

  table { border-collapse:collapse; width:100%; font-size:9.5pt; margin:0.7em 0; }
  th, td { border:1px solid #d5def4; padding:6px 9px; text-align:left; vertical-align:top; }
  thead th { background:var(--navy); color:#fff; font-family:'Visby', sans-serif; font-weight:800; border-color:var(--navy); }
  tbody tr:nth-child(even) { background:#f5f8ff; }

  blockquote { border-left:4px solid var(--blue); margin:0.9em 0; padding:6px 14px; color:var(--muted); background:#f2f5ff; border-radius:0 4px 4px 0; }
  blockquote strong { color:var(--navy); }

  img { max-width:100%; }
  hr { border:none; border-top:1px solid #e2e8f5; margin:1.6em 0; }
  .page-break-after { page-break-after:always; height:0; }

  ul, ol { padding-left:1.3em; }
  li { margin:0.15em 0; }

  .screenshot-placeholder { border:1.5px dashed var(--lblue); border-radius:6px; background:#f7f9ff; color:#7f8bab; text-align:center; padding:20px 14px; margin:0.7em 0; font-size:9.5pt; }
  .screenshot-placeholder::before { content:"\1F4F7"; display:block; font-size:15pt; margin-bottom:4px; }
  .screenshot-placeholder span { font-size:8pt; font-style:italic; }

  /* ---- Cover page ---- */
  /* Full-bleed: uses the zero-margin `cover` @page so the navy fills the whole
     first page, edge to edge. */
  .cover { page:cover; position:relative; background:var(--navy); color:#fff; width:210mm; height:297mm;
           margin:0; border-radius:0;
           display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;
           page-break-after:always; overflow:hidden; }
  .cover::before { content:""; position:absolute; top:-70mm; right:-70mm; width:150mm; height:150mm; border-radius:50%;
                   background:radial-gradient(circle, rgba(41,94,246,0.55) 0%, rgba(41,94,246,0) 70%); }
  .cover::after { content:""; position:absolute; bottom:-60mm; left:-60mm; width:130mm; height:130mm; border-radius:50%;
                  background:radial-gradient(circle, rgba(150,176,251,0.30) 0%, rgba(150,176,251,0) 70%); }
  .cover-inner { position:relative; z-index:1; padding:0 20mm; }
  .cover-logo { width:74mm; height:auto; margin-bottom:20mm; }
  .cover-eyebrow { font-family:'Visby', sans-serif; font-weight:800; letter-spacing:0.22em; text-transform:uppercase;
                   font-size:10pt; color:var(--lblue); margin-bottom:6mm; }
  .cover-title { font-family:'Visby', sans-serif; font-weight:800; font-size:34pt; line-height:1.05; color:#fff;
                 border:none; margin:0; padding:0; }
  .cover-subtitle { font-family:'Baton', sans-serif; font-size:15pt; color:#c9d5f7; margin-top:5mm; letter-spacing:0.02em; }
  .cover-footer { position:absolute; bottom:20mm; left:0; right:0; z-index:1; }
  .cover-company { font-family:'Visby', sans-serif; font-weight:800; font-size:12pt; color:#fff; letter-spacing:0.03em; }
  .cover-date { font-family:'Baton', sans-serif; font-size:10.5pt; color:var(--lblue); margin-top:2mm; }
  .cover-version { font-family:'Baton', sans-serif; font-size:9pt; color:#7f8bab; margin-top:1mm; }
---

'''

sys.stdout.write(front + cover + body)
PY

# 2. Ensure a Chrome-for-Testing binary is available (md-to-pdf's Puppeteer does
#    not auto-download one). Install into a cache dir and reuse it across runs.
CACHE_DIR="${PUPPETEER_CACHE_DIR:-$HOME/.cache/puppeteer}"
mkdir -p "$CACHE_DIR"
echo "Ensuring Chrome-for-Testing in $CACHE_DIR ..."
CHROME_PATH="$(npx --yes @puppeteer/browsers@latest install chrome@stable --path "$CACHE_DIR" \
  | tail -1 | sed -E 's/^chrome@[^ ]+ //')"
echo "Using Chrome: $CHROME_PATH"

# 3. Render to PDF. Pinned md-to-pdf version for reproducibility; point it at the
#    Chrome we just installed and run headless with --no-sandbox (needed in CI).
#
#    Wrapped in a timeout and retried once, because md-to-pdf occasionally never returns: the
#    render completes in about 20 seconds normally, and roughly one run in five hangs in Chrome
#    instead and sits there forever. Left unguarded that stalls the release job until its
#    30-minute timeout and produces no artifact. A kill and a second attempt has always worked.
render() {
    local attempt="$1" deadline=$((SECONDS + 180))
    echo "Rendering $SRC -> $OUT (attempt $attempt) ..."
    npx --yes md-to-pdf@5.2.4 \
      --launch-options "{\"executablePath\":\"$CHROME_PATH\",\"args\":[\"--no-sandbox\"]}" \
      "$TMP" &
    local pid=$!
    while kill -0 "$pid" 2>/dev/null; do
        if [ "$SECONDS" -ge "$deadline" ]; then
            echo "  render exceeded 180s; killing it" >&2
            kill -9 "$pid" 2>/dev/null || true
            pkill -f 'Chrome for Testing' 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
            return 1
        fi
        sleep 2
    done
    wait "$pid" || return 1
    [ -f "$TMP_PDF" ]
}

if ! render 1; then
    echo "Retrying once ..." >&2
    rm -f "$TMP_PDF"
    render 2 || { echo "error: md-to-pdf failed twice" >&2; exit 1; }
fi

mv "$TMP_PDF" "$OUT"

# 4. Stamp the running footer onto every page except the cover. Puppeteer's
#    displayHeaderFooter draws on all pages (it can't skip the cover), so we
#    disable it above and paint the footer here with pdf-lib instead. Page
#    numbering starts at 1 on the first content page — the cover is unnumbered.
cat > "$STAMP_JS" <<'JS'
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

(async () => {
  const out = process.argv[2];
  const doc = await PDFDocument.load(fs.readFileSync(out));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length - 1;               // exclude the cover
  const size = 7.5;
  const color = rgb(0.545, 0.576, 0.655);       // #8b93a7
  for (let i = 1; i < pages.length; i++) {       // skip page 0 (cover)
    const p = pages[i];
    const text = `Mustry Solutions Ingots   ·   User Manual   ·   ${i} / ${total}`;
    const w = font.widthOfTextAtSize(text, size);
    p.drawText(text, { x: (p.getWidth() - w) / 2, y: 24, size, font, color });
  }
  fs.writeFileSync(out, await doc.save());
})().catch((e) => { console.error(e); process.exit(1); });
JS

PDFLIB_DIR="$CACHE_DIR/pdf-tools"
mkdir -p "$PDFLIB_DIR"
if [ ! -d "$PDFLIB_DIR/node_modules/pdf-lib" ]; then
  echo "Installing pdf-lib into $PDFLIB_DIR ..."
  npm install --prefix "$PDFLIB_DIR" --no-save --no-audit --no-fund pdf-lib@1.17.1 >/dev/null 2>&1
fi
echo "Stamping footer (cover left unnumbered) ..."
NODE_PATH="$PDFLIB_DIR/node_modules" node "$STAMP_JS" "$OUT"

echo "PDF written to $OUT"
