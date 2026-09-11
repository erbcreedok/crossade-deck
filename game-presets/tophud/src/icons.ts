// The three marks the strip draws, as outlines — a chevron out, a chair, a copy. Drawn rather than
// lettered so they keep their weight at any strip height.

export const ICON = {
  back: '<path d="M15 5 8 12l7 7"/>',
  chair:
    '<path d="M6 11.5V7a2.5 2.5 0 0 1 2.5-2.5h7A2.5 2.5 0 0 1 18 7v4.5"/><rect x="4" y="11.5" width="16" height="5.2" rx="1.6"/><path d="M6.6 16.7v3"/><path d="M17.4 16.7v3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a1 1 0 0 0-1 1v9"/>',
} as const;

export function svg(body: string, size: number, color: string, width = 2.2): string {
  return (
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" ` +
    `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  );
}

/** Anything that came from a person or a room goes through this before it is markup. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
