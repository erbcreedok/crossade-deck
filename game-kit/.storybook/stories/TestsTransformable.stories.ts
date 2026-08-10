import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  add,
  Bounded,
  Container,
  node,
  rect,
  registerSurface,
  remove,
  Surfaced,
  Transformable,
  type Node,
  type TransformableFields,
} from "../../src/index.js";
import { scene, type Scene } from "../devtools/scene.js";
import {
  checks,
  differs,
  gap,
  imagesDiffer,
  inkOf,
  nearly,
  painted,
  pixelAt,
  settled,
  snapshot,
  standing,
  waitFor,
  type CheckContext,
  type Ink,
} from "../devtools/checks.js";

// THE FOURTH RUNG: the pose. `Surfaced` proved the paint is real; this rung is about WHERE the
// paint lands when a node says `at`, `z`, `angle` or `scale` — and what those fields do along a
// chain of owners, measured on the glass rather than read off the resolve arithmetic the unit
// suite already trusts.
//
// Everything is measured WHOLE-GLASS with `inkOf`, and every size and position claim is checked
// against ARITHMETIC: one unit is `host.unit()` CSS pixels times the device ratio, and a card
// with no pose sits on the canvas's own middle. So "the card moved half a unit" is an exact
// number of buffer pixels, on any screen, at any etalon.
//
// The claims lean on each other the way the fields compose: `Motion` is one node's own pose,
// `Chain` is the same fields read through an owner, `Order` is the one field that is not
// geometry at all. A turn that leaked into the box, a scale that moved a position, a `z` that
// stretched a picture — each would fail here and nowhere else.

interface PoseArgs {
  id: string;
}

const meta: Meta<PoseArgs> = {
  title: "Tests/Transformable",
  parameters: { gkDoc: "tests.transformable" },
  argTypes: { id: { control: "text" } },
  args: { id: "root" },
};
export default meta;

/** The box every claim below is made about — two DIFFERENT sides, so a swapped axis fails. */
const W = 1.6;
const H = 1;

/** The record the posed card wears, and the desk-coloured one its rival wears in `Order`. */
const CARD = "tests.pose.card";
const RIVAL = "tests.pose.rival";

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

/** A tree holding whatever a step is posing. */
function tree(id: string, child: Node): Node {
  const root = node(id.trim() || "root");
  add(root, child);
  return root;
}

/** The one surfaced card of most steps, wearing whatever pose the claim is about. */
function card(pose?: Partial<TransformableFields>, surface = CARD): Node {
  return node("card", Bounded({ bounds: rect(W, H) }), Surfaced({ surface }), ...(pose ? [Transformable(pose)] : []));
}

/** The glass as ink over the corner reading — the background is measured, never assumed. */
function ink(glass: HTMLCanvasElement): Ink {
  return inkOf(snapshot(glass), pixelAt(glass, 0.02, 0.02));
}

const widthOf = (b: Ink): number => b.maxX - b.minX;
const heightOf = (b: Ink): number => b.maxY - b.minY;
const centerX = (b: Ink): number => (b.minX + b.maxX) / 2;
const centerY = (b: Ink): number => (b.minY + b.maxY) / 2;

/** Buffer pixels per unit — the etalon this onlooker is using, times the device's own ratio. */
const perUnit = (live: Scene): number => live.host.unit() * live.host.viewport().dpr;

/**
 * Feed the scene and WAIT FOR THE GLASS TO CHANGE, then hand back the frame that changed —
 * the same arrival-is-the-wait rule the Surfaced rung reads by (see its `shown` for why a
 * fixed two frames is not a promise).
 */
async function shown(live: Scene, glass: HTMLCanvasElement, root: Node): Promise<ImageData> {
  const before = snapshot(glass);
  live.setRoot(root);
  return waitFor(
    () => {
      const now = snapshot(glass);
      return imagesDiffer(before, now) ? now : undefined;
    },
    "the glass never changed",
  );
}

/** A frame as ink over the corner reading. */
const inkIn = (glass: HTMLCanvasElement, image: ImageData): Ink => inkOf(image, pixelAt(glass, 0.02, 0.02));

/** Show one posed card and read the frame it arrives on. */
async function posedOn(live: Scene, glass: HTMLCanvasElement, id: string, pose: Partial<TransformableFields>): Promise<Ink> {
  return inkIn(glass, await shown(live, glass, tree(id, card(pose))));
}

// ---- Motion: one node's own pose ------------------------------------------------------------

export const Motion: StoryObj<PoseArgs> = {
  args: { id: "root" },
  parameters: { gkDocStory: "tests.transformable.motion", controls: { include: ["id"] } },
  render: ({ id }) => {
    registerSurface(CARD, { layers: [{ paint: "accent" }] });
    return scene(tree(id, card())).el;
  },
  play: checks([
    {
      name: "play.transformable.at-moves-the-picture-not-its-size — half a unit is half a unit of pixels",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        registerSurface(CARD, { layers: [{ paint: "accent" }] });
        // The reference: a card with no pose sits on the canvas's own middle, at its declared
        // size. Both facts are needed below — a move is measured as a DIFFERENCE from here.
        live.setRoot(tree(id, card()));
        await settled();
        const home = ink(glass);
        await expect(home.count, "inked pixels").toBeGreaterThan(0);
        await expect(...gap("resting center x", centerX(home), glass.width / 2)).toBeLessThan(nearly(px, 0.1));
        await expect(...gap("resting center y", centerY(home), glass.height / 2)).toBeLessThan(nearly(px, 0.1));
        // `at: {0.5, 0.3}` is exactly that many pixels of travel, each axis its own — and the
        // box does not change a hair: a position is not a size.
        const moved = await posedOn(live, glass, id, { at: { x: 0.5, y: 0.3 } });
        await expect(...gap("center x, moved", centerX(moved), centerX(home) + 0.5 * px)).toBeLessThan(nearly(px, 0.1));
        await expect(...gap("center y, moved", centerY(moved), centerY(home) + 0.3 * px)).toBeLessThan(nearly(px, 0.1));
        await expect(...gap("width, moved", widthOf(moved), widthOf(home))).toBeLessThan(4);
        await expect(...gap("height, moved", heightOf(moved), heightOf(home))).toBeLessThan(4);
      },
    },
    {
      name: "play.transformable.the-pose-orders-itself — twice as big is not twice as far",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        // Scale and move on ONE pose. Scale-then-move puts the middle of a doubled card at 0.6
        // units; move-then-scale would drag it out to 1.2 — the two answers are 0.6 units apart,
        // so the reading names the order rather than merely being consistent with it.
        const posed = await posedOn(live, glass, id, { at: { x: 0.6, y: 0 }, scale: 2 });
        await expect(...gap("width, doubled", widthOf(posed), 2 * W * px)).toBeLessThan(nearly(px, 0.12));
        await expect(...gap("center x, scaled then moved", centerX(posed), glass.width / 2 + 0.6 * px)).toBeLessThan(
          nearly(px, 0.15),
        );
      },
    },
    {
      name: "play.transformable.a-right-angle-is-exact — 90 swaps the sides and smears nothing",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        // A quarter turn on a box with two different sides: the ink's width becomes the HEIGHT
        // and the other way round, to the same tolerance the unturned box holds. A rotation
        // matrix with float dirt in its right angles widens the box by a smear — visible here,
        // invisible on the symmetric squares most demos turn.
        const turned = await posedOn(live, glass, id, { angle: 90 });
        await expect(...gap("width at 90°", widthOf(turned), H * px)).toBeLessThan(nearly(px, 0.08));
        await expect(...gap("height at 90°", heightOf(turned), W * px)).toBeLessThan(nearly(px, 0.08));
        // And a half turn of the same box is the box again: 180° maps a rectangle onto itself.
        const back = await posedOn(live, glass, id, { angle: 180 });
        await expect(...gap("width at 180°", widthOf(back), W * px)).toBeLessThan(nearly(px, 0.08));
      },
    },
    {
      name: "play.transformable.a-full-lap-changes-nothing — 390 is 30, and −90 is 270",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // TWO IDENTICAL READINGS CANNOT BE WAITED FOR, so an obviously different frame goes
        // between each pair: every reading is then a frame known to have arrived, and "the
        // same picture" is a measurement rather than a redraw nobody noticed was missing.
        const thirty = await shown(live, glass, tree(id, card({ angle: 30 })));
        await shown(live, glass, tree(id, card({ angle: 200 })));
        const lapped = await shown(live, glass, tree(id, card({ angle: 390 })));
        await expect(imagesDiffer(thirty, lapped), "390° differs from 30°").toBe(false);
        // The negative direction is the same circle walked the other way.
        const minus = await shown(live, glass, tree(id, card({ angle: -90 })));
        await shown(live, glass, tree(id, card({ angle: 200 })));
        const positive = await shown(live, glass, tree(id, card({ angle: 270 })));
        await expect(imagesDiffer(minus, positive), "−90° differs from 270°").toBe(false);
      },
    },
    {
      name: "play.transformable.scale-is-uniform-and-zero-erases — both axes, no crash, no latch",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        // One number scales BOTH axes — the reason the field is one number is that a shape
        // survives it; a scale that touched one axis would show exactly here.
        const doubled = await posedOn(live, glass, id, { scale: 2 });
        await expect(...gap("width, doubled", widthOf(doubled), 2 * W * px)).toBeLessThan(nearly(px, 0.12));
        await expect(...gap("height, doubled", heightOf(doubled), 2 * H * px)).toBeLessThan(nearly(px, 0.12));
        // Zero is legal and paints NOTHING: nothing has a size. Not a crash — and not a latch:
        // the card is back the moment the zero is gone.
        const erased = await shown(live, glass, tree(id, card({ scale: 0 })));
        await expect(inkIn(glass, erased).count, "inked pixels at scale 0").toBe(0);
        const returned = await posedOn(live, glass, id, { scale: 1 });
        await expect(returned.count, "inked pixels back at scale 1").toBeGreaterThan(0);
        await expect(...gap("width, returned", widthOf(returned), W * px)).toBeLessThan(nearly(px, 0.08));
      },
    },
  ]),
};

// ---- Chain: the same fields, read through an owner ------------------------------------------

export const Chain: StoryObj<PoseArgs> = {
  args: { id: "root" },
  parameters: { gkDocStory: "tests.transformable.chain", controls: { include: ["id"] } },
  render: ({ id }) => {
    registerSurface(CARD, { layers: [{ paint: "accent" }] });
    const hand = node("hand", Container({ layout: "free" }), Transformable({ angle: 30 }));
    add(hand, card({ angle: 15 }));
    return scene(tree(id, hand)).el;
  },
  play: checks([
    {
      name: "play.transformable.angle-adds-up-on-the-glass — a hand's 30 and a card's 15 are one 45",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        registerSurface(CARD, { layers: [{ paint: "accent" }] });
        // REFERENCE RENDERING: the chain and the single node are two programs for the same
        // picture, so the glass — not the resolve arithmetic — is what says they agree. A
        // different single angle goes between the two readings, and doubles as the counter-
        // claim: the sum is 45, not the hand's own 30.
        // The chain is what the RENDER already stood up, so the first reading is the standing
        // glass — `shown` waits for a CHANGE, and feeding the same tree again would wait on a
        // picture that has no reason to move.
        const both = snapshot(glass);
        const own = await shown(live, glass, tree(id, card({ angle: 30 })));
        const sum = await shown(live, glass, tree(id, card({ angle: 45 })));
        await expect(imagesDiffer(both, sum), "the chain differs from the single 45°").toBe(false);
        await expect(imagesDiffer(both, own), "the chain equals the hand's own 30°").toBe(true);
      },
    },
    {
      name: "play.transformable.a-card-turns-about-its-hand — clockwise, and about the OWNER's origin",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        // The card sits 0.4 right OF ITS HAND, and the hand — itself half a unit right — turns
        // a quarter clockwise. The card's own offset rides the turn: it ends BELOW the hand
        // (screen y grows down, that is what clockwise means), and the hand's own position is
        // untouched by the hand's own angle. About the desk's centre instead, the card would
        // land a full unit away — the class of bug that looks like physics.
        const hand = node("hand", Container({ layout: "free" }), Transformable({ at: { x: 0.5, y: 0 }, angle: 90 }));
        add(hand, card({ at: { x: 0.4, y: 0 } }));
        const drawn = inkIn(glass, await shown(live, glass, tree(id, hand)));
        await expect(...gap("card center x", centerX(drawn), glass.width / 2 + 0.5 * px)).toBeLessThan(nearly(px, 0.12));
        await expect(...gap("card center y", centerY(drawn), glass.height / 2 + 0.4 * px)).toBeLessThan(nearly(px, 0.12));
      },
    },
    {
      name: "play.transformable.scale-multiplies-on-the-glass — a half in a half shows a quarter",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        const held = (own?: number): Node => {
          const hand = node("hand", Container({ layout: "free" }), Transformable({ scale: 0.5 }));
          add(hand, card(own === undefined ? undefined : { scale: own }));
          return tree(id, hand);
        };
        // 0.5 × 0.5 is 0.25 of the declared width — a sum would say 1, a nearest-wins would
        // say 0.5, and the glass tells all three apart on one reading.
        const quarter = inkIn(glass, await shown(live, glass, held(0.5)));
        await expect(...gap("width, half in a half", widthOf(quarter), 0.25 * W * px)).toBeLessThan(nearly(px, 0.08));
        // And a card that says NOTHING about scale is simply carried: the owner's half, unchanged.
        const carried = inkIn(glass, await shown(live, glass, held()));
        await expect(...gap("width, silent child", widthOf(carried), 0.5 * W * px)).toBeLessThan(nearly(px, 0.08));
      },
    },
    {
      name: "play.transformable.a-layout-writes-at-on-the-glass — free keeps the pose, row overwrites it",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        registerSurface(CARD, { layers: [{ paint: "accent" }] });
        // The same two boxes with the same two poses, under two layouts. `free` places nobody,
        // so the poses stand and the picture spans their spread; `row` writes `at` for both,
        // and the typed poses stop mattering — the span is the row's own arithmetic, the exact
        // number the Surfaced rung reads for a desk (two 0.6 boxes and the stock 0.12 gap).
        const dealt = (layout: string): Node => {
          const desk = node("desk", Container({ layout }));
          for (const [name, x] of [
            ["left", -0.9],
            ["right", 0.9],
          ] as const) {
            add(desk, node(name, Bounded({ bounds: rect(0.6, 0.6) }), Surfaced({ surface: CARD }), Transformable({ at: { x, y: 0 } })));
          }
          return tree(id, desk);
        };
        const free = inkIn(glass, await shown(live, glass, dealt("free")));
        await expect(...gap("span under free", widthOf(free), 2.4 * px)).toBeLessThan(nearly(px, 0.1));
        const row = inkIn(glass, await shown(live, glass, dealt("row")));
        await expect(...gap("span under row", widthOf(row), 1.32 * px)).toBeLessThan(nearly(px, 0.1));
      },
    },
    {
      name: "play.transformable.a-reparented-card-answers-anew — the chain is read at apply, on the glass too",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        // ONE card object, moved between a half-size hand and a full-size one — the same move
        // that broke the fan's z-order three times in client1 when a resolved base was frozen
        // at animation start. The unit suite reads the new sum off the context; this reads it
        // off the PICTURE: same node, new owner, new size on the very next frame.
        const small = node("small", Container({ layout: "free" }), Transformable({ scale: 0.5 }));
        const big = node("big", Container({ layout: "free" }), Transformable({ at: { x: 0, y: 0 } }));
        const held = card();
        add(small, held);
        const root = node(id.trim() || "root");
        add(root, small);
        add(root, big);
        const before = inkIn(glass, await shown(live, glass, root));
        await expect(...gap("width in the small hand", widthOf(before), 0.5 * W * px)).toBeLessThan(nearly(px, 0.08));
        remove(small, held);
        add(big, held);
        const after = inkIn(glass, await shown(live, glass, root));
        await expect(...gap("width in the big hand", widthOf(after), W * px)).toBeLessThan(nearly(px, 0.08));
      },
    },
  ]),
};

// ---- Order: the field that is not geometry --------------------------------------------------

export const Order: StoryObj<PoseArgs> = {
  args: { id: "root" },
  parameters: { gkDocStory: "tests.transformable.order", controls: { include: ["id"] } },
  render: ({ id }) => {
    registerSurface(CARD, { layers: [{ paint: "accent" }] });
    registerSurface(RIVAL, { layers: [{ paint: "panelBg" }] });
    const desk = node("desk", Container({ layout: "free" }));
    add(desk, node("lower", Bounded({ bounds: rect(W, H) }), Surfaced({ surface: CARD }), Transformable({ at: { x: -0.2, y: -0.15 }, z: 1 })));
    add(desk, node("upper", Bounded({ bounds: rect(W, H) }), Surfaced({ surface: RIVAL }), Transformable({ at: { x: 0.2, y: 0.15 } })));
    return scene(tree(id, desk)).el;
  },
  play: checks([
    {
      name: "play.transformable.z-decides-the-cover-and-moves-no-box — a lift is not a distance",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        registerSurface(CARD, { layers: [{ paint: "accent" }] });
        registerSurface(RIVAL, { layers: [{ paint: "panelBg" }] });
        // Two overlapping plates in two colours; the probe sits in the overlap. With no `z`
        // anywhere the later sibling covers — and giving the FIRST one `z: 1` flips exactly
        // the cover: the overlap changes colour while the union of ink does not move a pixel
        // pair. A `z` that nudged geometry — a lift drawn as a shadow-offset, say — fails on
        // the second half.
        const overlapped = (liftFirst: number): Node => {
          const desk = node("desk", Container({ layout: "free" }));
          add(desk, node("first", Bounded({ bounds: rect(W, H) }), Surfaced({ surface: CARD }), Transformable({ at: { x: -0.2, y: -0.15 }, z: liftFirst })));
          add(desk, node("second", Bounded({ bounds: rect(W, H) }), Surfaced({ surface: RIVAL }), Transformable({ at: { x: 0.2, y: 0.15 } })));
          return tree(id, desk);
        };
        const flat = inkIn(glass, await shown(live, glass, overlapped(0)));
        const covered = pixelAt(glass, 0.5, 0.5);
        const lifted = inkIn(glass, await shown(live, glass, overlapped(1)));
        await expect(differs(covered, pixelAt(glass, 0.5, 0.5)), "the overlap changed hands").toBe(true);
        await expect(...gap("ink width, lifted", widthOf(lifted), widthOf(flat))).toBeLessThan(3);
        await expect(...gap("ink height, lifted", heightOf(lifted), heightOf(flat))).toBeLessThan(3);
      },
    },
    {
      name: "play.transformable.z-adds-up-through-the-stack — a lifted pile lifts what lies in it",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // A loose card at `z: 1` against a card that says NOTHING about height but lies in a
        // pile at `z: 2`. The pile's card covers — its height is the SUM along the chain, not
        // its own field — and lowering the PILE alone hands the cover back: the card under it
        // never changed.
        const scene2 = (pileZ: number): Node => {
          const desk = node("desk", Container({ layout: "free" }));
          add(desk, node("loose", Bounded({ bounds: rect(W, H) }), Surfaced({ surface: CARD }), Transformable({ at: { x: -0.2, y: -0.15 }, z: 1 })));
          const pile = node("pile", Container({ layout: "free" }), Transformable({ z: pileZ }));
          add(pile, node("held", Bounded({ bounds: rect(W, H) }), Surfaced({ surface: RIVAL }), Transformable({ at: { x: 0.2, y: 0.15 } })));
          add(desk, pile);
          return tree(id, desk);
        };
        await shown(live, glass, scene2(2));
        const pileWins = pixelAt(glass, 0.5, 0.5);
        await shown(live, glass, scene2(0));
        await expect(differs(pileWins, pixelAt(glass, 0.5, 0.5)), "lowering the pile handed the cover back").toBe(true);
      },
    },
    {
      name: "play.transformable.equal-z-keeps-tree-order — and keeps it on every redraw",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // The tie: both plates at the same height, and the LATER sibling covers — swap the
        // order they were added in and the cover swaps with it. Then the same tree is drawn
        // again: an unstable sort passes the first reading and shuffles the second, which on a
        // dense board is cards flickering between frames.
        const tied = (cardFirst: boolean): Node => {
          const desk = node("desk", Container({ layout: "free" }));
          const a = node("first", Bounded({ bounds: rect(W, H) }), Surfaced({ surface: CARD }), Transformable({ at: { x: -0.2, y: -0.15 }, z: 1 }));
          const b = node("second", Bounded({ bounds: rect(W, H) }), Surfaced({ surface: RIVAL }), Transformable({ at: { x: 0.2, y: 0.15 }, z: 1 }));
          add(desk, cardFirst ? a : b);
          add(desk, cardFirst ? b : a);
          return tree(id, desk);
        };
        await shown(live, glass, tied(true));
        const laterWins = pixelAt(glass, 0.5, 0.5);
        await shown(live, glass, tied(false));
        await expect(differs(laterWins, pixelAt(glass, 0.5, 0.5)), "swapping the additions swapped the cover").toBe(true);
        // Idempotence: the same tree, fed again — the picture must not change at all.
        const steady = snapshot(glass);
        live.setRoot(tied(false));
        await settled();
        await settled();
        await expect(imagesDiffer(steady, snapshot(glass)), "a redraw reshuffled the tie").toBe(false);
      },
    },
  ]),
};
