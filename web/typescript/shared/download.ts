// Browser file download for the components' export buttons. DOM-facing; the
// serialisers it's handed (csv, ics) are the pure, tested part.

/** Download `parts` as a file named `filename`. */
export function downloadFile(parts: BlobPart[], mimeType: string, filename: string): void {
    const url = URL.createObjectURL(new Blob(parts, { type: mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
