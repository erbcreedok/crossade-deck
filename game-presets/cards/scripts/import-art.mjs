// IMPORT THE DECK'S ART — the court figures and the suit marks, from the owner's optimised export
// (`cards/output/optimized/{svg,suits}` of the deck design) into `art/`, which is the add-on's
// SOURCE of figures: read by the face generator's tests, the vector skin and the baking script,
// never shipped as a bundle of its own.
//
// What the import changes, and nothing else:
//   - the c2pa provenance block is dropped (8 KB of base64 per file, meaningless in a texture);
//   - the figure's accent red becomes `currentColor`, the one paint a deck style sets — a
//     four-colour deck paints diamonds' accent orange through it, the rest stay as drawn;
//   - the queen of hearts' gold, drawn a shade off the other eleven, is set to the deck's gold.
//
// Run: `node scripts/import-art.mjs <optimized-dir>` (from `game-presets/cards`).

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = process.argv[2];
if (!SRC) throw new Error("usage: node scripts/import-art.mjs <optimized-dir>");
const ART = fileURLToPath(new URL("../art/", import.meta.url));

const ACCENT = "#b3221f";
const GOLD = "#f2c14e";
const OFF_GOLD = "#dcd00f";
const SUIT = { spades: "spade", hearts: "heart", diamonds: "diamond", clubs: "club" };
const RANK = { jack: "J", queen: "Q", king: "K" };

const clean = (svg) => svg.replace(/<metadata>[\s\S]*?<\/metadata>/g, "").trim();

/**
 * One figure (the king of clubs) left the export with `width`/`height` and no `viewBox` — the same
 * ink, described the other way round. Every figure is read by its viewBox downstream, so it gets one.
 */
const framed = (svg) => {
  if (/viewBox=/.test(svg)) return svg;
  const m = /<svg([^>]*?)\swidth="([\d.]+)"\sheight="([\d.]+)"/.exec(svg);
  if (!m) throw new Error("a figure with neither viewBox nor width/height");
  return svg.replace(m[0], `<svg${m[1]} viewBox="0 0 ${m[2]} ${m[3]}"`);
};

mkdirSync(join(ART, "courts"), { recursive: true });
mkdirSync(join(ART, "suits"), { recursive: true });

let n = 0;
for (const file of readdirSync(join(SRC, "svg")).filter((f) => f.endsWith(".svg"))) {
  const m = /^(jack|queen|king)_of_(spades|hearts|diamonds|clubs)\.svg$/.exec(file);
  if (!m) continue;
  const svg = framed(clean(readFileSync(join(SRC, "svg", file), "utf8")))
    .replaceAll(ACCENT, "currentColor")
    .replaceAll(OFF_GOLD, GOLD);
  if (!svg.includes("currentColor")) throw new Error(`${file}: no accent to lift`);
  writeFileSync(join(ART, "courts", `${SUIT[m[2]]}-${RANK[m[1]]}.svg`), svg);
  n += 1;
}
for (const [file, name] of [["spades.svg", "spade"], ["hearts.svg", "heart"], ["diamonds.svg", "diamond"], ["clubs.svg", "club"], ["joker-hat.svg", "joker-hat"]]) {
  writeFileSync(join(ART, "suits", `${name}.svg`), clean(readFileSync(join(SRC, "suits", file), "utf8")));
  n += 1;
}
console.log(`imported ${n} files → ${ART}`);
