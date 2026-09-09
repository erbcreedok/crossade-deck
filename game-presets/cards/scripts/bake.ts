// BAKE THE DECKS — the generator's vectors rendered once, into what a game ships.
//
// Two outputs, both under `src/decks/` and both checked in:
//   - `figures/<accent>/<card>.svg` — a court's engraving as a file of its own, accent painted in
//     and viewBox padded to the paper, for the VECTOR skin's second layer (see `figures.ts`).
//   - `baked/<style>/<card>.webp` and `baked/backs/<back>.webp` — every face of every style and
//     the six backs, rasterised at the texture's declared 400×560, for the RASTER skin.
//
// Rendered by Chromium through Playwright, which the repository already carries: the same
// engine that draws the vector in the catalog draws the raster here, so the two cannot disagree.
//
// Run: `npx tsx scripts/bake.ts` (from `game-presets/cards`). No network: the letters are rects.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { crossade } from "../src/crossade.js";
import type { SuitName } from "../src/suits.js";
import { BACK_NAMES, backSvg } from "../src/decks/backs.js";
import { PIXELS } from "../src/decks/card.js";
import { faceSvg, isCourt } from "../src/decks/face.js";
import { standaloneFigure } from "../src/decks/figures.js";
import { ACCENT_PAINT, accentOf, deckStyleId, DECK_STYLES, type Accent } from "../src/decks/style.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ART = `${ROOT}art/courts/`;
const OUT = `${ROOT}src/decks/`;
const QUALITY = 0.92;

const figures = new Map(
  crossade()
    .filter(isCourt)
    .map((spec) => [spec.id, readFileSync(`${ART}${spec.id}.svg`, "utf8")]),
);

// ---- the figure files: red for every court, orange for the diamonds' four-colour turn.
const wanted: ReadonlyArray<readonly [Accent, (suit: SuitName) => boolean]> = [
  ["red", () => true],
  ["orange", (suit) => suit === "diamond"],
];
let written = 0;
for (const [accent, takes] of wanted) {
  mkdirSync(`${OUT}figures/${accent}`, { recursive: true });
  for (const spec of crossade().filter(isCourt)) {
    if (!takes(spec.values["suit"] as SuitName)) continue;
    writeFileSync(`${OUT}figures/${accent}/${spec.id}.svg`, standaloneFigure(figures.get(spec.id)!, ACCENT_PAINT[accent]));
    written += 1;
  }
}
console.log(`figures: ${written} files`);

// ---- the rasters.
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><html><body></body></html>");

/** One SVG document → a WebP, drawn through an <img> onto a canvas at the declared pixels. */
async function raster(svg: string): Promise<Buffer> {
  const url = await page.evaluate(
    async ({ svg, w, h, q }) => {
      const img = new Image();
      img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/webp", q);
    },
    { svg, w: PIXELS.w, h: PIXELS.h, q: QUALITY },
  );
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
}

let bytes = 0;
for (const style of DECK_STYLES) {
  const id = deckStyleId(style);
  mkdirSync(`${OUT}baked/${id}`, { recursive: true });
  for (const spec of crossade()) {
    const art = style.layout === "classic" && isCourt(spec) ? { figure: figures.get(spec.id)! } : {};
    const webp = await raster(faceSvg(spec, style, art));
    writeFileSync(`${OUT}baked/${id}/${spec.id}.webp`, webp);
    bytes += webp.length;
  }
  console.log(`baked ${id}`);
}
mkdirSync(`${OUT}baked/backs`, { recursive: true });
for (const name of BACK_NAMES) {
  const webp = await raster(backSvg(name));
  writeFileSync(`${OUT}baked/backs/${name}.webp`, webp);
  bytes += webp.length;
}
await browser.close();
console.log(`rasters: ${DECK_STYLES.length * crossade().length + BACK_NAMES.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
