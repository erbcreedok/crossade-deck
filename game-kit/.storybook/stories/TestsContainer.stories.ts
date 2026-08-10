import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  add,
  Bounded,
  Container,
  freeLayout,
  node,
  rect,
  registerLayout,
  registerSurface,
  rowLayout,
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

// THE FIFTH RUNG: THE ARRANGEMENT. The rung below proved a pose lands where the chain says;
// this one is about the field that hands poses OUT — a row's arithmetic in pixels, the reflow
// when a card arrives or leaves, and the second source of area under a desk with no box of its
// own. Every claim is measured on the glass, against the etalon, never read back from the same
// `placeChildren` the unit layer already believes.

interface RowArgs {
  id: string;
}

/** Two DIFFERENT widths, so a row that dealt equal cells would fail the very first sum. */
const WIDE = 1;
const SLIM = 0.5;
const H = 0.5;

const CARD = "tests.row.card";
const DESK = "tests.row.desk";

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

/** Register what every step below paints with — idempotent, so each step may insist. */
function surfaces(): void {
  registerSurface(CARD, { layers: [{ paint: "accent" }] });
  registerSurface(DESK, { layers: [{ paint: "panelBg" }] });
}

/** A container of the given record, holding the given cards, in the given order. */
function row(id: string, layout: string, kids: readonly Node[]): Node {
  const root = node(id.trim() || "root", Container({ layout }));
  kids.forEach((k) => add(root, k));
  return root;
}

/** One surfaced card of the stated size, with whatever pose the claim needs. */
function card(id: string, w: number, h: number, pose?: Partial<TransformableFields>): Node {
  return node(id, Bounded({ bounds: rect(w, h) }), Surfaced({ surface: CARD }), ...(pose ? [Transformable(pose)] : []));
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

/** The colour standing at a point given in UNITS from the canvas's own middle. */
function probeAt(live: Scene, glass: HTMLCanvasElement, x: number, y: number): [number, number, number, number] {
  const px = perUnit(live);
  return pixelAt(glass, (glass.width / 2 + x * px) / glass.width, (glass.height / 2 + y * px) / glass.height);
}

/**
 * Feed the scene and WAIT FOR THE GLASS TO CHANGE, then hand back the frame that changed —
 * the same arrival-is-the-wait rule every rung reads by.
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

const meta: Meta<RowArgs> = {
  title: "Tests/Container",
  parameters: { gkDoc: "tests.container" },
  argTypes: { id: { control: "text" } },
  args: { id: "root" },
};
export default meta;

export const Row: StoryObj<RowArgs> = {
  args: { id: "root" },
  parameters: { gkDocStory: "tests.container.row", controls: { include: ["id"] } },
  render: ({ id }) => {
    surfaces();
    return scene(row(id, "row", [card("wide", WIDE, H), card("slim", SLIM, H)])).el;
  },
  play: checks([
    {
      name: "play.container.a-row-is-the-sum-of-its-parts — widths add, and nothing smears",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        surfaces();
        // The reference: the stock row, centred on the canvas's own middle. Two different
        // widths, one exact sum — a row of equal cells would already be wrong here.
        live.setRoot(row(id, "row", [card("wide", WIDE, H), card("slim", SLIM, H)]));
        await settled();
        const standing1 = ink(glass);
        await expect(standing1.count, "inked pixels").toBeGreaterThan(0);
        await expect(...gap("row width", widthOf(standing1), (WIDE + SLIM) * px)).toBeLessThan(nearly(px, 0.12));
        await expect(...gap("row height", heightOf(standing1), H * px)).toBeLessThan(nearly(px, 0.12));
        await expect(...gap("row center x", centerX(standing1), glass.width / 2)).toBeLessThan(nearly(px, 0.1));
        await expect(...gap("row center y", centerY(standing1), glass.height / 2)).toBeLessThan(nearly(px, 0.1));
      },
    },
    {
      name: "play.container.the-gap-is-daylight — between neighbours the glass goes bare",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        // A row with a gap of 0.5: total 2 units — wide spans −1…0, daylight 0…0.5, slim
        // 0.5…1. The claim is BOTH ways: the span grew by exactly the gap, and the seam is
        // BARE, not paint — a row that merely stretched its cards would pass the first half.
        registerLayout("tests.aisle", rowLayout({ gap: 0.5 }));
        const posed = inkIn(glass, await shown(live, glass, row(id, "tests.aisle", [card("wide", WIDE, H), card("slim", SLIM, H)])));
        await expect(...gap("row with daylight", widthOf(posed), (WIDE + SLIM + 0.5) * px)).toBeLessThan(nearly(px, 0.12));
        const bare = pixelAt(glass, 0.02, 0.02);
        await expect(differs(probeAt(live, glass, 0.25, 0), bare), "the seam is bare glass").toBe(false);
        await expect(differs(probeAt(live, glass, -0.5, 0), bare), "the wide card is paint").toBe(true);
        await expect(differs(probeAt(live, glass, 0.75, 0), bare), "the slim card is paint").toBe(true);
      },
    },
    {
      name: "play.container.a-lone-card-centres — gaps stand between, and one card has no between",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        // The fencepost on the glass: the same gapped record, one card. An outer gap — gap×N
        // instead of gap×(N−1) — would push the lone card half a gap off the middle.
        registerLayout("tests.aisle", rowLayout({ gap: 0.5 }));
        const posed = inkIn(glass, await shown(live, glass, row(id, "tests.aisle", [card("wide", WIDE, H)])));
        await expect(...gap("lone width", widthOf(posed), WIDE * px)).toBeLessThan(nearly(px, 0.12));
        await expect(...gap("lone center x", centerX(posed), glass.width / 2)).toBeLessThan(nearly(px, 0.1));
      },
    },
    {
      name: "play.container.a-layout-swap-does-not-latch — free, row, and free again is the first picture",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // Mode-switch leakage is the container bug this pins: a row must not write its answer
        // anywhere free would later read it from. Three feeds — free, row, free — and the third
        // frame is compared to the first PIXEL FOR PIXEL, with the row's own different picture
        // standing between them, so each reading is a frame that really arrived.
        const spread = () => [card("wide", WIDE, H, { at: { x: -0.6, y: -0.35 } }), card("slim", SLIM, H, { at: { x: 0.6, y: 0.35 } })];
        const first = await shown(live, glass, row(id, "free", spread()));
        await shown(live, glass, row(id, "row", spread()));
        const again = await shown(live, glass, row(id, "free", spread()));
        await expect(imagesDiffer(first, again), "free after row differs from free before it").toBe(false);
      },
    },
    {
      name: "play.container.reserved-room-on-the-glass — a doubled card gets a doubled seat",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        // The wide card carries scale 2. Measured at one and drawn at two it would sit UNDER
        // its neighbour — the row must reserve the scaled footprint, and the sum says whether
        // it did: 2 + 0.5 units of ink, 1 unit tall, and the seam between them still exact.
        const posed = inkIn(glass, await shown(live, glass, row(id, "row", [card("wide", WIDE, H, { scale: 2 }), card("slim", SLIM, H)])));
        await expect(...gap("reserved width", widthOf(posed), (2 * WIDE + SLIM) * px)).toBeLessThan(nearly(px, 0.15));
        await expect(...gap("reserved height", heightOf(posed), 2 * H * px)).toBeLessThan(nearly(px, 0.15));
      },
    },
  ]),
};

export const Flow: StoryObj<RowArgs> = {
  args: { id: "root" },
  parameters: { gkDocStory: "tests.container.flow", controls: { include: ["id"] } },
  render: ({ id }) => {
    surfaces();
    return scene(row(id, "row", [card("a", WIDE, H), card("b", WIDE, H), card("c", WIDE, H)])).el;
  },
  play: checks([
    {
      name: "play.container.an-added-card-reflows-the-row — the whole row answers, not just the newcomer",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        surfaces();
        // Two cards, then three, through the same gapped record. The sum names the reflow:
        // 2.3 units grows to 3.6 — a width and a gap more — and stays centred, which only
        // happens if every survivor moved too.
        registerLayout("tests.flow", rowLayout({ gap: 0.3 }));
        const two = () => [card("a", WIDE, H), card("b", WIDE, H)];
        const pair = inkIn(glass, await shown(live, glass, row(id, "tests.flow", two())));
        await expect(...gap("two cards", widthOf(pair), (2 * WIDE + 0.3) * px)).toBeLessThan(nearly(px, 0.12));
        const trio = inkIn(glass, await shown(live, glass, row(id, "tests.flow", [...two(), card("c", WIDE, H)])));
        await expect(...gap("three cards", widthOf(trio), (3 * WIDE + 2 * 0.3) * px)).toBeLessThan(nearly(px, 0.15));
        await expect(...gap("still centred", centerX(trio), glass.width / 2)).toBeLessThan(nearly(px, 0.1));
      },
    },
    {
      name: "play.container.a-removal-closes-the-aisle — by exactly a width and ONE gap",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        // From the trio the middle card leaves. Stale cached measurement is the bug: the
        // survivors must adjoin again, and the span must shrink by the departed width plus one
        // gap — not two, not none.
        registerLayout("tests.flow", rowLayout({ gap: 0.3 }));
        const pair = inkIn(glass, await shown(live, glass, row(id, "tests.flow", [card("a", WIDE, H), card("c", WIDE, H)])));
        await expect(...gap("healed row", widthOf(pair), (2 * WIDE + 0.3) * px)).toBeLessThan(nearly(px, 0.12));
      },
    },
    {
      name: "play.container.order-is-the-tree-on-the-glass — swap the insertions and the picture mirrors",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // Two cards told apart by HEIGHT: the tall one is paint at 0.2 units above the middle,
        // the short one is not. Inserted tall-first the high paint sits left of the middle;
        // inserted short-first it sits right — position follows the slot, never the id or size.
        const tall = () => card("tall", WIDE, 0.6);
        const short = () => card("short", SLIM, 0.3);
        const bare = pixelAt(glass, 0.02, 0.02);
        await shown(live, glass, row(id, "row", [tall(), short()]));
        await expect(differs(probeAt(live, glass, -0.25, 0.2), bare), "tall paint sits left").toBe(true);
        await expect(differs(probeAt(live, glass, 0.5, 0.2), bare), "the right is short — daylight up here").toBe(false);
        await shown(live, glass, row(id, "row", [short(), tall()]));
        await expect(differs(probeAt(live, glass, 0.25, 0.2), bare), "tall paint sits right now").toBe(true);
        await expect(differs(probeAt(live, glass, -0.5, 0.2), bare), "and the left went short").toBe(false);
      },
    },
    {
      name: "play.container.an-unknown-layout-keeps-the-scene — nobody placed, nothing lost",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        // A name with no record behind it is a content mistake, not a dead scene: the card is
        // still painted, and where its OWN pose says — the missing record placed nobody.
        const posed = inkIn(glass, await shown(live, glass, row(id, "carousel", [card("stray", WIDE, H, { at: { x: 0.5, y: 0.3 } })])));
        await expect(posed.count, "inked pixels").toBeGreaterThan(0);
        await expect(...gap("stray center x", centerX(posed), glass.width / 2 + 0.5 * px)).toBeLessThan(nearly(px, 0.12));
        await expect(...gap("stray center y", centerY(posed), glass.height / 2 + 0.3 * px)).toBeLessThan(nearly(px, 0.12));
      },
    },
  ]),
};

export const Spread: StoryObj<RowArgs> = {
  args: { id: "root" },
  parameters: { gkDocStory: "tests.container.spread", controls: { include: ["id"] } },
  render: ({ id }) => {
    surfaces();
    const desk = node(id.trim() || "root", Container({ layout: "free" }), Surfaced({ surface: DESK }));
    add(desk, card("card", WIDE, H));
    return scene(desk).el;
  },
  play: checks([
    {
      name: "play.container.the-desk-wears-its-content — a boxless surface paints the tight wrap",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        surfaces();
        // A desk with no box of its own and one card at the origin: everything inked — desk
        // and card together — is exactly the card's wrap. The desk added area NOWHERE.
        const desk = node(id.trim() || "root", Container({ layout: "free" }), Surfaced({ surface: DESK }));
        add(desk, card("card", WIDE, H));
        live.setRoot(desk);
        await settled();
        const worn = ink(glass);
        await expect(worn.count, "inked pixels").toBeGreaterThan(0);
        await expect(...gap("wrap width", widthOf(worn), WIDE * px)).toBeLessThan(nearly(px, 0.12));
        await expect(...gap("wrap height", heightOf(worn), H * px)).toBeLessThan(nearly(px, 0.12));
      },
    },
    {
      name: "play.container.the-area-is-a-size-not-an-address — the desk grows, and does not move house",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        // `contentExtent` answers ONE question — how much — and the surface still lands on the
        // desk's own origin. A card walking 0.8 units out leaves the desk standing: the ink is
        // desk from −0.5 and card out to 1.3, and the middle of the desk is DESK colour now,
        // the card having left it. A desk that trailed its card would read card colour there
        // and a union only one card wide.
        const one = node(id.trim() || "root", Container({ layout: "free" }), Surfaced({ surface: DESK }));
        add(one, card("card", WIDE, H, { at: { x: 0.8, y: 0 } }));
        const moved = inkIn(glass, await shown(live, glass, one));
        await expect(...gap("desk plus walked card", widthOf(moved), (WIDE / 2 + 0.8 + WIDE / 2) * px)).toBeLessThan(nearly(px, 0.15));
        const bare = pixelAt(glass, 0.02, 0.02);
        const home = probeAt(live, glass, -0.3, 0);
        await expect(differs(home, bare), "the desk still paints at home").toBe(true);
        await expect(differs(home, probeAt(live, glass, 0.8, 0)), "and it is the desk's colour, the card left").toBe(true);
        // Two cards at the edges: the wrap is the distance between them plus a width, and it is
        // symmetric again — size from the content, address the desk's own.
        const two = node(id.trim() || "root", Container({ layout: "free" }), Surfaced({ surface: DESK }));
        add(two, card("card", WIDE, H, { at: { x: 0.8, y: 0 } }));
        add(two, card("far", WIDE, H, { at: { x: -0.8, y: 0 } }));
        const stretched = inkIn(glass, await shown(live, glass, two));
        await expect(...gap("stretched width", widthOf(stretched), (1.6 + WIDE) * px)).toBeLessThan(nearly(px, 0.15));
        await expect(...gap("stretched center x", centerX(stretched), glass.width / 2)).toBeLessThan(nearly(px, 0.12));
      },
    },
    {
      name: "play.container.padding-is-air-around-the-wrap — even a record that places nobody has it",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        // A free record with padding 0.3: the wrap grows by 0.6 on each axis, the card does not
        // move — and the new margin is DESK paint, a colour that is neither bare glass nor card.
        registerLayout("tests.meadow", { ...freeLayout, padding: 0.3 });
        const desk = node(id.trim() || "root", Container({ layout: "tests.meadow" }), Surfaced({ surface: DESK }));
        add(desk, card("card", WIDE, H));
        const padded = inkIn(glass, await shown(live, glass, desk));
        await expect(...gap("padded width", widthOf(padded), (WIDE + 0.6) * px)).toBeLessThan(nearly(px, 0.15));
        await expect(...gap("padded height", heightOf(padded), (H + 0.6) * px)).toBeLessThan(nearly(px, 0.15));
        const bare = pixelAt(glass, 0.02, 0.02);
        const margin = probeAt(live, glass, 0, -(H / 2 + 0.15));
        await expect(differs(margin, bare), "the margin is painted").toBe(true);
        await expect(differs(margin, probeAt(live, glass, 0, 0)), "and it is the desk's colour, not the card's").toBe(true);
      },
    },
    {
      name: "play.container.bare-children-leave-nothing — no boxes inside, nothing to paint on",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // Children without boxes occupy nothing, so the derived area is zero and the desk's
        // surface has nowhere to land: the glass goes BARE — zero pixels, not "fewer".
        const desk = node(id.trim() || "root", Container({ layout: "free" }), Surfaced({ surface: DESK }));
        add(desk, node("ghost", Surfaced({ surface: CARD })));
        await shown(live, glass, desk);
        await expect(ink(glass).count, "inked pixels").toBe(0);
      },
    },
  ]),
};
