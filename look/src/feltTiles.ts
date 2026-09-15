// THE FELT'S TWO TILES — the club weave and the diamond sparkle, as SVG data URIs and nothing else.
//
// Pure strings with no engine import, so the hub (`surfaces.ts`, through the registry) and the Telegram
// table (`server/table-client`, as CSS backgrounds) draw the SAME felt from one source.

// THE CLUB, AS A BITMAP AND NOT AS FORTY RECTANGLES.
//
// client1 ships this glyph as `public/bg-clubs.svg` — 41 hand-written `<rect>`s on a 72×72 tile,
// on a 4px grid offset by 2. Transcribed as rects it would be unreadable in a diff and nobody
// would ever spot a moved pixel; written as rows, the drawing IS the source. The renderer gets
// the rects either way.
const CLUB = [
  "..#..#...",
  ".##..##..",
  ".###.###.",
  ".#######.",
  "#########",
  ".#######.",
  "....#....",
  "....#....",
  "...###...",
];

/** The tile client1 lays over the felt, drawn to its own 72×72 grid. */
export function clubTile(color: string): string {
  // client1's own numbers: a 4px cell, the glyph's corner at 18, the whole tile 72. Kept as the
  // pixel counts they are — this picture is a raster, and rounding it to units would round the
  // grid it is drawn on.
  const CELL = 4;
  const AT = 18;
  const SIDE = 72;
  const body = CLUB.flatMap((row, y) =>
    [...row].map((cell, x) =>
      cell === "#"
        ? `<rect x="${AT + x * CELL}" y="${AT + y * CELL}" width="${CELL}" height="${CELL}" fill="${color}"/>`
        : "",
    ),
  ).join("");
  // WIDTH AND HEIGHT, not just a viewBox. An SVG with no intrinsic size is rasterized at whatever
  // the platform calls a default, and the tile then comes out one enormous smear instead of a
  // pattern — which is exactly what it did the first time.
  //
  // NO GROUND RECT, unlike client1's file: the felt is the layer underneath, and a colour written
  // twice is a colour that will disagree with itself.
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDE}" height="${SIDE}" viewBox="0 0 ${SIDE} ${SIDE}" shape-rendering="crispEdges">${body}</svg>`;
  // Encoded rather than base64 so the source stays readable in a network tab — the same choice the
  // card and dice skins make.
  return `data:image/svg+xml,${encodeURIComponent(doc)}`;
}

// THE DIAMOND, AS A BITMAP OVER A TRANSPARENT TILE.
//
// client1 ships this glyph as `public/bg-diamonds.svg` — five hand-placed pixel diamonds scattered
// (not gridded) over a 520×520 canvas, each shimmering on its own SMIL clock. All five are the SAME
// 7-row rhombus (1,3,5,7,5,3,1 pixels a row) at different cell sizes and positions — verbatim from
// that file, read as `{ atX, atY, cell }` per diamond rather than as 125 individual `<rect>`s, the
// same row-is-the-source move the club weave makes for its own glyph.
const DIAMOND = ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."];

/** The five scatters — `atX`/`atY` the bounding box's own top-left corner, `cell` its pixel size. */
export const DIAMOND_SCATTER: ReadonlyArray<{ readonly atX: number; readonly atY: number; readonly cell: number }> = [
  { atX: 87, atY: 212, cell: 4 },
  { atX: 34, atY: 47, cell: 5 },
  { atX: 39, atY: 475, cell: 5 },
  { atX: 119, atY: 29, cell: 5 },
  { atX: 232, atY: 224, cell: 3 },
];

/** client1's own canvas: 520×520, tiled at 340 css px — the scale that keeps the scatter's sparseness. */
const DIAMOND_SIDE = 520;

/** The tile the sparkle repeats on — client1's own 520×520 scatter, not a single centred glyph. */
export function diamondTile(color: string): string {
  const body = DIAMOND_SCATTER.flatMap(({ atX, atY, cell }) =>
    DIAMOND.flatMap((row, y) =>
      [...row].map((c, x) =>
        c === "#"
          ? `<rect x="${atX + x * cell}" y="${atY + y * cell}" width="${cell}" height="${cell}" fill="${color}"/>`
          : "",
      ),
    ),
  ).join("");
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${DIAMOND_SIDE}" height="${DIAMOND_SIDE}" viewBox="0 0 ${DIAMOND_SIDE} ${DIAMOND_SIDE}" shape-rendering="crispEdges">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(doc)}`;
}
