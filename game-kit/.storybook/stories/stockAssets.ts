// PICTURES FOR THE CATALOG — drawn here rather than shipped as files.
//
// The kit holds no assets and should not: a game brings its own art. But a section about
// pictures has to have some, and a binary in the repository is a thing nobody can read in a
// diff and everybody forgets to update. These are SVG, written as text, turned into data URIs —
// self-contained, legible, and they cost the build nothing.
//
// Colours are CSS names on purpose. A hex literal outside the theme is forbidden by a scan, and
// rightly: two golds under four names is how client2 died. These are not theme colours and must
// not pretend to be — a picture is content, not a token, and it does NOT follow the theme. That
// it stays put when the theme switches is exactly the lesson the `Picture` scene is for.

import { registerAsset } from "../../src/index.js";

/** SVG text as a data URI. Encoded, not base64: the source stays readable in the network tab. */
function svg(width: number, height: number, body: string): string {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(doc)}`;
}

const EMBLEM = svg(
  100,
  100,
  [
    '<circle cx="50" cy="50" r="46" fill="darkslateblue" stroke="gold" stroke-width="6"/>',
    '<path d="M50 22 L58 43 L80 43 L62 57 L69 78 L50 65 L31 78 L38 57 L20 43 L42 43 Z" fill="gold"/>',
  ].join(""),
);

const TILE = svg(
  40,
  40,
  [
    '<rect width="40" height="40" fill="seagreen"/>',
    '<rect width="20" height="20" fill="darkslategray"/>',
    '<rect x="20" y="20" width="20" height="20" fill="darkslategray"/>',
  ].join(""),
);

const BANNER = svg(
  240,
  80,
  [
    '<rect width="240" height="80" fill="firebrick"/>',
    '<rect x="8" y="8" width="224" height="64" fill="none" stroke="wheat" stroke-width="4"/>',
    '<circle cx="40" cy="40" r="14" fill="wheat"/>',
    '<circle cx="200" cy="40" r="14" fill="wheat"/>',
  ].join(""),
);

/**
 * The stock pictures, with the size each is MEANT to be, in units.
 *
 * Deliberately three different proportions: a square, a small square tile and a wide banner.
 * With one shape every `fit` looks the same and the control would teach nothing — the whole
 * point of `contain` against `cover` only appears when the picture and the area disagree.
 */
export function installStockAssets(): void {
  registerAsset("emblem", { src: EMBLEM, w: 1, h: 1 });
  registerAsset("tile", { src: TILE, w: 0.4, h: 0.4 });
  registerAsset("banner", { src: BANNER, w: 1.5, h: 0.5 });
}
