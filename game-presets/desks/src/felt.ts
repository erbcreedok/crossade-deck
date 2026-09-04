// THE FELT — what every desk on the sandbox shelf shares: the map's own art, the two things a piece
// lying on one of these desks is (it stays where it is put, and it casts), the warming trick that
// keeps a die from stuttering through its first roll, the room a camera is held inside, and the two
// states a drop zone wears (`zoneLine`, `zoneKeen`, `ANCHOR_MARK`).
//
// Literal transfer from the catalog's `gestureMap.ts` — the comments are whoever wrote them there,
// not restated here, because this is the SAME code standing in a package instead of the catalog.

import {
  Bounded,
  compose,
  Draggable,
  extentOf,
  freeLayout,
  GRIP,
  installStockCoats,
  Lit,
  MARK_SURFACE,
  node,
  rect,
  registerAsset,
  registerLayout,
  registerSurface,
  ShadowCaster,
  Surfaced,
  surfaceNames,
  surfaceRecord,
  Transformable,
  Valued,
  type Coat,
  type LayoutChild,
  type LayoutRecord,
  type Node,
  type Paint,
  type Point,
  type Shape,
  type Stroke,
  svg,
} from "game-kit";

export { svg };

/** How big the map is, in units — see `gestureMap` on why it is bigger than any glass. */
export const MAP = { w: 8, h: 8 };

/**
 * HOW A DROP ZONE STANDS WHEN NOTHING IS OVER IT — its owner's colour, dashed, and quiet.
 *
 * TWO DIFFERENT SENTENCES, and a solid border says the wrong one. A zone drawn in a hard line is
 * claiming something at every moment of the game, and what it is actually saying is only "this
 * patch is somebody's" — a label, not an event. Said in a solid stroke it reads as the zone being
 * ON, so when the zone really does light up there is nothing left for it to change into.
 *
 * DASHED is what makes it a label. A broken line is a boundary drawn on the felt rather than a
 * thing standing on it, which is exactly what an area is; and it leaves the whole of "solid" free
 * to mean the one thing worth an event — this is the one that will take the card.
 *
 * IN UNITS, so the dashes are the same size on a desk of any zoom and there are simply more of them
 * around a bigger area: a pattern that scaled would be a picture of a border rather than a border.
 */
export function zoneLine(ink: Paint): Stroke {
  return { color: ink, width: 0.035, opacity: 0.55, dash: { on: 0.2, off: 0.16, corner: "dash" } };
}

/**
 * ...AND WHAT IT WEARS WHILE THE HAND IS OVER IT — the same colour, solid, and loud.
 *
 * A RING, because a ring is a STROKE and a stroke replaces the surface's own border for as long as
 * it is worn: the dashed label becomes one unbroken line and goes back to dashes when the hand
 * moves on. One outline, two states, and nothing on the glass has to be added or taken away.
 *
 * The same ink as the quiet line, on purpose. A zone that lit up in a different colour would be
 * answering a different question — the reader would have to learn which colour meant "yours" and
 * which meant "taking it", when the only thing that changed is that this one is taking it.
 */
export function zoneKeen(ink: Paint): Coat {
  return { recipe: "ring", level: 0.75, tint: ink };
}

/**
 * WHAT THE ANCHOR WEARS WHILE ITS RUN IS IN THE AIR — the mark that says WHERE THIS LANDS.
 *
 * The anchor is already on the glass and already in the right place: a handle takes no lift, so
 * while the cards ride at the hand's height the tab travels flat on the felt, exactly at the point
 * the run is going to come down on. What it did not do is READ as that. It looks like the control
 * it was a moment ago — the thing you took hold of — so a player carrying a stack watches the
 * CARDS to guess where they will land, and the cards are the one thing that is not where they will
 * land: they are a hand's width above the anchor and splayed.
 *
 * QUIET, because it is a target and not an announcement. A ring at a low level, in the muted ink:
 * enough that the eye finds it under a moving hand, not so much that it competes with the zone
 * lighting up — which is the thing that actually has news in it.
 */
export const ANCHOR_MARK: Coat = { recipe: "ring", level: 0.35, tint: "textMuted" };

export const ROAM = 0.25;

/**
 * THE STRETCH A CAMERA ON THIS SHELF IS HELD INSIDE — the desk, and `ROAM` of it all round.
 *
 * A RECT and not a size, because the desk is laid out AROUND zero: its corner is at minus half, and
 * a camera told only the size would hold the view inside one quarter of it while every clamp read
 * perfectly correct.
 */
export function deskRoom(box: { w: number; h: number } = MAP, roam: number = ROAM): { x: number; y: number; w: number; h: number } {
  const pad = { x: box.w * roam, y: box.h * roam };
  return { x: -box.w / 2 - pad.x, y: -box.h / 2 - pad.y, w: box.w + pad.x * 2, h: box.h + pad.y * 2 };
}

/** The knight's own box, in units — a chess piece stands taller than it is wide. */
export const KNIGHT = { w: 0.9, h: 1.1 };

const GRID = "gesture.map.grid";
export const MAP_SURFACE = "gesture.map";
export const KNIGHT_SURFACE = "gesture.map.knight";

/**
 * ONE UNIT OF GRID, repeated — the whole of "the map moved" for an eye that has nothing else to
 * measure against. A tile and not a hundred plate nodes: the ground is one node either way, and a
 * repeat costs the plan nothing per line.
 */
const GRID_TILE = svg(100, 100, '<path d="M0 0 H100 M0 0 V100" fill="none" stroke="slategray" stroke-width="2"/>');

/**
 * THE KNIGHT, facing left: a base, a chest, the muzzle and one ear, drawn as a single filled
 * outline with the eye on top of it. Wheat on a dark map, so it reads at a glance beside two white
 * cards and a white die without being a fourth white thing.
 */
const KNIGHT_PIECE = svg(
  100,
  120,
  [
    '<path d="M25 113 L75 113 L75 105 C75 99 71 95 65 92 C73 84 78 73 78 60',
    'C78 44 70 31 56 23 L52 8 L45 19 L37 13 L33 30 C22 39 16 49 16 58',
    'C16 63 19 66 24 65 L38 59 L33 68 C29 76 27 84 27 93 C27 99 26 102 25 105 Z"',
    'fill="wheat" stroke="saddlebrown" stroke-width="3" stroke-linejoin="round"/>',
    '<circle cx="34" cy="44" r="4" fill="saddlebrown"/>',
    '<path d="M46 22 C58 30 66 41 68 54" fill="none" stroke="saddlebrown" stroke-width="3" stroke-linecap="round"/>',
  ].join(" "),
);

const GRIP_SURFACE = "gesture.map.grip";
const GRIP_RIDGES = "gesture.map.grip.ridges";

/** Three ridges — the mark every grab handle in every application wears, and the reason one is legible. */
const GRIP_BARS = svg(
  60,
  16,
  ["<g fill='slategray'>", ...[24, 30, 36].map((x) => `<rect x="${x}" y="4" width="2.6" height="8" rx="1.3"/>`), "</g>"].join(""),
);

/** Register everything the map's nodes point at by name. Idempotent — a re-render calls it again. */
export function installMapArt(): void {
  // THE COAT RECIPES, installed as an ordinary consumer would. A coat is a NAME looked up in a
  // registry, and a name nobody registered resolves to nothing and paints nothing — in silence.
  // Here rather than per desk, because the marks are the SHELF'S (`ANCHOR_MARK`, `zoneKeen`) and a
  // desk that forgot the call would go on working with one feature invisibly missing.
  installStockCoats();
  registerAsset(GRID, { src: GRID_TILE, w: 1, h: 1 });
  registerAsset(KNIGHT_SURFACE, { src: KNIGHT_PIECE, w: KNIGHT.w, h: KNIGHT.h });
  registerLayout("gesture.map.free", freeLayout);
  registerSurface(MAP_SURFACE, {
    layers: [{ paint: "sunkBg" }, { image: GRID, fit: "repeat", opacity: 0.35 }],
    radius: 0.2,
    // The map's own edge, so the bound the camera stops at is a thing the eye can see it reach.
    stroke: { color: "panelBorder", width: 0.04 },
  });
  // THE HANDLE IS THE MAP'S OWN FURNITURE, not the chips'. Every desk here can form a heap, so every
  // desk can grow a tab — and a tab whose surface nobody registered is not an error anywhere: an
  // unregistered name is SKIPPED (one bad reference must not take a scene down), so the control is
  // simply drawn into nothing and the page looks as though stacking had been switched off.
  registerAsset(GRIP_RIDGES, { src: GRIP_BARS, w: GRIP.w, h: GRIP.h });
  // A GHOST AND NOT A CARD: no fill at all, a dashed outline in the muted ink. It has to be read as
  // a PLACE — the felt showing through where the stack will stand — and anything filled would read
  // as a card already lying there, which is the one thing it must never be mistaken for.
  registerSurface(MARK_SURFACE, {
    layers: [],
    // BRIGHT ENOUGH TO READ THROUGH A SHADOW. The thing being carried is in the AIR, so it throws a
    // shadow, and the shadow falls exactly where the silhouette is — that is not a coincidence, it
    // is the same place twice: where this will land. A hairline in the muted ink simply vanished
    // under it, which made the one picture the reader needed the one they could not see.
    stroke: { color: "text", width: 0.04, opacity: 0.85, dash: { on: 0.16, off: 0.12, corner: "dash" } },
  });
  registerSurface(GRIP_SURFACE, {
    layers: [{ paint: "panelBg" }, { image: GRIP_RIDGES, fit: "contain" }],
    radius: GRIP.h / 2,
    stroke: { color: "panelBorder", width: 0.02 },
  });
  // The piece is the picture and nothing else: no plate under it, so its silhouette is what the
  // eye follows across the map.
  registerSurface(KNIGHT_SURFACE, { layers: [{ image: KNIGHT_SURFACE, fit: "contain" }] });
}

/**
 * A PIECE PUT DOWN STAYS PUT. Nothing on this map accepts a drop, so every release is a refused
 * one — and on a map the stock `home` would mean a piece flying back the moment the hand let go of
 * it somewhere it was meant to be.
 */
export const PUT_DOWN = Draggable({ onReject: "stay" });

/**
 * THE LAMP OVER THE DESK — and without one nothing casts anything at all.
 *
 * A shadow takes two: a piece willing to throw one (`ShadowCaster`) and a light to throw it by
 * (`Lit`). The second is the DESK's, not the piece's — one lamp over a table, not a lamp per card —
 * and it is a `rootOnly` field for exactly that reason. Composing casters and stopping there is what
 * I did, and it is why nothing changed on the glass: every piece was willing and the room was dark.
 *
 * The stock lamp — top-right, so shadows fall down-left and read as height anywhere. The DEPTH is
 * this shelf's own; see below for why the kit's own numbers cannot be used here.
 */
export const LAMP = Lit({
  // ITS OWN DEPTH, because these desks are DARK. The stock shadow is a soft dark at a quarter
  // opacity, a hair of offset at rest — right over a pale table, and invisible over this one: a dark
  // wash on a near-black felt is a dark wash on a near-black felt. The shadows were there all along
  // (the plan draws one per piece), and none of them could be seen, which is the same as not having
  // them. Deeper and further, so the eye can tell a piece lying down from one held up.
  shadow: { base: 0.08, perZ: 0.06, lifted: 0.34, opacity: 0.5 },
});

/**
 * A PIECE ON A DESK THROWS A SHADOW, and that is not decoration.
 *
 * Half of what these pages show is HEIGHT — a piece lifts as it is picked up, hangs at the hand's
 * height while it is carried, falls from that height when it is let go — and height is the one thing
 * a desk seen from above cannot draw. Without a shadow a card in the air and a card on the felt are
 * the same picture, and every page about lifting, dropping and throwing is teaching a difference the
 * reader cannot see. The `Hold` and `Tap` squares have had one since the shelf existed for exactly
 * this reason; the desks that came after simply never got it.
 *
 * From the SILHOUETTE, which is the atom's own default: a shadow is what the drawn thing blocks, and
 * for a chip that is a disc rather than the square it is measured by.
 */
export const CASTS = ShadowCaster();

/** Everything a piece lying on one of these desks is: it stays where it is put, and it casts. */
export function onTheDesk(piece: Node): Node {
  compose(piece, PUT_DOWN);
  compose(piece, CASTS);
  return piece;
}

/** How big a warming node is, in units — as small as a thing can be and still be asked for. */
const WARM = 0.02;

/**
 * WARM EVERY PICTURE THE DESK MIGHT SHOW, by ASKING FOR IT — one tiny node per picture, parked off
 * the map where no camera can reach.
 *
 * The painter loads a texture the first time a PLAN asks to draw it, and until it lands the layer
 * draws nothing at all (`textureFor`: a picture that has not arrived is skipped, so one slow emblem
 * cannot blank a table). That is right, and it is also why a die stutters through its first roll:
 * it changes picture ten times a second, and every face it has not shown yet is a frame of nothing.
 *
 * Decoding the image by hand does not help — the painter has its own cache, keyed by source, and it
 * fills only from its own loads. What DOES fill it is a plan that mentions the picture, so that is
 * what this is: the first frame asks for all of them at once, and every one is there by the time
 * anybody wants it.
 *
 * Asked of the SURFACE registry rather than of the dice, so nothing here has to know what a face
 * is: whatever has been registered with a picture in it by the time the desk is built gets warmed.
 */
export function warmingNodes(): Node[] {
  const out: Node[] = [];
  for (const name of surfaceNames()) {
    const layers = surfaceRecord(name)?.layers ?? [];
    if (!layers.some((l) => l.image)) continue;
    out.push(
      node(
        `warm ${name}`,
        Bounded({ bounds: rect(WARM, WARM) }),
        Surfaced({ surface: name }),
        // Off the map and off the camera's own content, so nothing can be looked at or touched.
        Transformable({ at: { x: MAP.w, y: MAP.h + out.length * WARM * 2 } }),
        Valued({ values: { warm: 1 } }),
      ),
    );
  }
  return out;
}

// ---- THE SHARED HAND / ROW SPREAD --------------------------------------------------------------
//
// `handLayout`, `Spread` and `fitStep` are `magnetMap`'s own numbers for a hand of cards, and the
// live desk lays its two areas out with the very same question: how far apart may these cards be,
// and how wide may the lot of them get. Literal transfer, for the reason `gestureMap`'s felt is:
// one value per name, not two that drift, whichever page asks for it.

/**
 * WHAT A HAND LOOKS LIKE, in the air and in the zone.
 *
 * The widths are FRACTIONS of the room the spread lives in — the desk for a hand in the air, the
 * zone's own box for one lying in it — so the numbers mean the same thing on either side and survive
 * a change of size on either.
 */
export interface Spread {
  /** Units between neighbouring card centres: the closest they may ever be, and the furthest. */
  readonly gapMin: number;
  readonly gapMax: number;
  /** The whole spread's width, as a fraction of the room it is in. */
  readonly wideMin: number;
  readonly wideMax: number;
}

/**
 * THE STEP THIS MANY CARDS ACTUALLY TAKE, in units.
 *
 * With a stated order, because the four bounds can contradict each other and something has to lose.
 * The line between them is what a bound is FOR:
 *
 *   CEILINGS ARE ABOUT NOT OVERFLOWING, and they always win. The room is one — a spread never leaves
 *   the place it is in, which is not a preference but what an edge means — and the width ceiling is
 *   the same kind of statement about a smaller box the reader drew inside it.
 *   FLOORS ARE ABOUT COMFORT: cards no closer than this, a hand no narrower than that. They lift the
 *   step when there is headroom and give way the moment a ceiling disagrees.
 *   THE COMFORTABLE STEP sits between them, taken whenever nothing else has an opinion.
 */
export function fitStep(count: number, room: number, look: Spread): number {
  if (count < 2) return 0;
  const gaps = count - 1;
  const hard = Math.min(room / gaps, (room * look.wideMax) / gaps);
  const want = Math.min(look.gapMax, hard);
  const floor = Math.max(look.gapMin, (room * look.wideMin) / gaps);
  return Math.min(hard, Math.max(want, floor));
}

/** How far the zone reaches past its own edge, root units — see `Reaching`. */
export const PULL = 0.4;

export const ZONE_SPREAD: Spread = { gapMin: 0.08, gapMax: 0.55, wideMin: 0, wideMax: 1 };

/**
 * A HAND LAID OUT IN A ROW, by the same four numbers the fan uses — and it is the same question:
 * how far apart may these cards be, and how wide may the lot of them get.
 *
 * What differs is the room. A hand in the air is bounded by the desk; a hand lying in a zone is
 * bounded by the zone, and that bound is HARD — a row that outgrew its border would read as the
 * zone having failed to hold what it was given. Given no box the layout places nobody: inventing an
 * edge is worse than saying there is none, which is the same silence a free canvas gives.
 */
export function handLayout(look: Spread, padding = 0): LayoutRecord {
  const place = (children: readonly LayoutChild[], box?: Shape): readonly (Point | undefined)[] => {
    if (!box) return children.map(() => undefined);
    const widest = children.reduce((w, c) => Math.max(w, c.footprint ? extentOf(c.footprint).w : 0), 0);
    // The room a card's own CENTRE may stand in: the box, less the padding, less the card itself.
    const room = Math.max(0, extentOf(box).w - 2 * padding - widest);
    const step = fitStep(children.length, room, look);
    const from = -(step * (children.length - 1)) / 2;
    return children.map((_child, i) => ({ x: from + step * i, y: 0 }));
  };
  // NO ADDRESSES. A hand is not a set of slots: a card given to it JOINS it, and where it ends up
  // is a consequence of how many there are rather than of where the finger was. `indexAt` is
  // optional for exactly this — a layout with no seats to point at says so by not answering.
  return { padding, place };
}
