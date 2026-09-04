// SVG ENCODER — turns width, height and body into a data URI. Encoded, not base64: the
// source stays readable in the network tab and diffs.

export function svg(width: number, height: number, body: string): string {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(doc)}`;
}
