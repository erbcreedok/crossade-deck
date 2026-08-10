import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  add,
  arrow,
  Bounded,
  Container,
  installStockHeads,
  line,
  node,
  polyline,
  rect,
  registerSurface,
  Surfaced,
  type ArrowSpec,
  type Node,
  type Shape,
  type SurfaceRecord,
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
import { installStockAssets } from "./stockAssets.js";

// THE THIRD RUNG: the paint. `Node` proved a node is on the glass and `Bounded` proved the box
// is real and invisible; this one is about the atom that finally draws — and about the one seam
// the two rungs below cannot reach, that the AREA a surface is painted onto is not always the
// box a reader thinks it is.
//
// Everything here is measured WHOLE-GLASS, as on the Bounded rung: `inkOf` reads the full buffer
// and answers with a count and a bounding box. A count is what makes a claim about a BORDER
// possible at all — "a thicker rim" and "a dashed rim" are statements about how much ink there
// is, and no grid of probes somebody picks can stand in for that.
//
// And the box is compared against ARITHMETIC, not against a stored number: one unit is worth
// `host.unit()` CSS pixels and the buffer is `dpr` times that, so a claim like "the fill is 1.6
// units wide" is checkable exactly, on any screen, at any etalon.
//
// THE DEBUG OUTLINE STAYS OFF here, unlike the Bounded rung. This section measures what the
// SURFACE put down, and the outline is another layer's ink in the same buffer — it would be
// counted as paint and every size claim would be a claim about tooling.

interface PaintArgs {
  id: string;
}

const meta: Meta<PaintArgs> = {
  title: "Tests/Surfaced",
  parameters: { gkDoc: "tests.surfaced" },
  argTypes: { id: { control: "text" } },
  args: { id: "root" },
};
export default meta;

/** The box every claim below is made about — two DIFFERENT sides, so a transposed measurement fails. */
const W = 1.6;
const H = 1;

/** The one record the steps re-register. Named once: the lesson is that the NAME outlives the look. */
const CARD = "tests.surfaced.card";

/** The two places every open-contour claim is made about — a shape with no inside. */
const LINE: readonly { readonly x: number; readonly y: number }[] = [
  { x: -1.1, y: 0 },
  { x: 1.1, y: 0 },
];

/** A plain fill, no radius and no stroke — the paint that covers exactly the box and nothing else. */
const FLAT: SurfaceRecord = { layers: [{ paint: "panelBg" }] };

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

/** A tree holding one surfaced card, or whatever else a step needs in its place. */
function tree(id: string, child: Node): Node {
  const root = node(id.trim() || "root");
  add(root, child);
  return root;
}

/** The card of the default tree: the box, and a name pointing into the registry. */
function card(surface = CARD): Node {
  return node("card", Bounded({ bounds: rect(W, H) }), Surfaced({ surface }));
}

/** The glass as ink over the corner reading — the background is measured, never assumed. */
function ink(glass: HTMLCanvasElement): Ink {
  return inkOf(snapshot(glass), pixelAt(glass, 0.02, 0.02));
}

const widthOf = (b: Ink): number => b.maxX - b.minX;
const heightOf = (b: Ink): number => b.maxY - b.minY;

/** Buffer pixels per unit — the etalon this onlooker is using, times the device's own ratio. */
const perUnit = (live: Scene): number => live.host.unit() * live.host.viewport().dpr;

/** Register a record and show it: a re-registration alone changes no picture until a frame is drawn. */
async function paintWith(live: Scene, glass: HTMLCanvasElement, record: SurfaceRecord, root: Node): Promise<Ink> {
  registerSurface(CARD, record);
  live.setRoot(root);
  await settled();
  return ink(glass);
}

/** A surfaced node whose shape is whatever a step is making a claim about. */
function shaped(bounds: Shape, surface = CARD): Node {
  return node("shape", Bounded({ bounds }), Surfaced({ surface }));
}

/** The run every claim about ends is made about — the two places of `LINE`, and nothing on them. */
const RUN = { from: LINE[0]!, to: LINE[1]! } as const;

/**
 * Feed the scene and WAIT FOR THE GLASS TO CHANGE, then hand back the frame that changed.
 *
 * TWO FRAMES IS NOT A PROMISE. `settled()` waits a fixed two, which is enough whenever the redraw
 * was already scheduled and is not when it was not — and the failure is the worst kind: the
 * reading is a real picture, just not the one the step asked for.
 *
 * So the wait is the arrival itself. Every claim below is about a picture that CHANGES, which is
 * what makes this usable: two readings that must be identical cannot be taken this way, and the
 * one step that compares two identical pictures puts a third, different one between them.
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

/** A frame as ink over the corner reading — the background is measured, never assumed. */
const inkIn = (glass: HTMLCanvasElement, image: ImageData): Ink => inkOf(image, pixelAt(glass, 0.02, 0.02));

/** Show a shape under the record already registered, and read the frame it arrives on. */
async function shapeOn(live: Scene, glass: HTMLCanvasElement, id: string, bounds: Shape): Promise<Ink> {
  return inkIn(glass, await shown(live, glass, tree(id, shaped(bounds))));
}

/** The same, for the little tree an arrow comes out as: the run, and a node per end that has one. */
async function paintedOn(live: Scene, glass: HTMLCanvasElement, id: string, spec: Partial<ArrowSpec>): Promise<Ink> {
  return inkIn(glass, await shown(live, glass, tree(id, arrow({ ...RUN, surface: CARD, ...spec }))));
}

/**
 * A desk: a surface with NO box of its own, holding `many` boxes that carry no surface.
 *
 * Every pixel it paints is therefore the desk's own, and its size is a statement about the
 * AREA derived from content — the second thing `Surfaced` accepts in place of `Bounded`.
 */
function desk(id: string, many: number, layout = "row", side = 0.6): Node {
  const held = node("desk", Container({ layout }), Surfaced({ surface: CARD }));
  for (let i = 0; i < many; i += 1) add(held, node(`box${i}`, Bounded({ bounds: rect(side, side) })));
  return tree(id, held);
}

export const Paint: StoryObj<PaintArgs> = {
  args: { id: "root" },
  parameters: { gkDocStory: "tests.surfaced.paint", controls: { include: ["id"] } },
  render: ({ id }) => {
    registerSurface(CARD, FLAT);
    installStockAssets();
    return scene(tree(id, card())).el;
  },
  play: checks([
    {
      name: "play.surfaced.the-fill-is-the-box — the area a box declares is the area that gets painted",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const drawn = await paintWith(live, glass, FLAT, tree(ctx.args["id"] as string, card()));
        // There is paint, and the middle of the box is it — no debug layer is involved here, so
        // this is the surface itself rather than a hairline somebody switched on.
        await expect(drawn.count, "inked pixels").toBeGreaterThan(0);
        await expect(differs(pixelAt(glass, 0.5, 0.5), pixelAt(glass, 0.02, 0.02)), "the middle is paint, not desk").toBe(true);
        // And it is the declared box, in pixels worked out from the etalon rather than from a
        // number written down once. A fill that came out square would pass a "there is ink"
        // check and fail here.
        const px = perUnit(live);
        await expect(...gap("ink width", widthOf(drawn), W * px)).toBeLessThan(nearly(px, 0.08));
        await expect(...gap("ink height", heightOf(drawn), H * px)).toBeLessThan(nearly(px, 0.08));
      },
    },
    {
      name: "play.surfaced.nothing-to-paint-with-or-on — a box without the atom, and the atom without an area",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // A box with no `Surfaced`: the ladder's own claim, from the far side. The rung below
        // makes it through the debug outline; here the outline is off, so the answer is zero.
        live.setRoot(tree(id, node("card", Bounded({ bounds: rect(W, H) }))));
        await settled();
        await expect(ink(glass).count, "inked pixels for a box with no Surfaced").toBe(0);
        // And the atom with nothing to paint ON — no box, no content. A legal node, not an
        // error and not a crash: it is simply not drawn.
        live.setRoot(tree(id, node("card", Surfaced({ surface: CARD }))));
        await settled();
        await expect(ink(glass).count, "inked pixels for Surfaced with no area").toBe(0);
        live.setRoot(tree(id, card()));
        await settled();
      },
    },
    {
      name: "play.surfaced.the-colour-is-the-record-s — re-registering repaints and moves no box",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const root = tree(ctx.args["id"] as string, card());
        const before = await paintWith(live, glass, FLAT, root);
        const wasPanel = pixelAt(glass, 0.5, 0.5);
        // THE LESSON OF THE ATOM, on the glass: the node is untouched — same tree, same box,
        // same one field naming the same record — and the picture changes anyway, because the
        // record behind the name does.
        const after = await paintWith(live, glass, { layers: [{ paint: "accent" }] }, root);
        await expect(differs(wasPanel, pixelAt(glass, 0.5, 0.5)), "the middle changed colour").toBe(true);
        // The box did not move a unit. Fields on the node could not show this: it would take a
        // walk over every node, and "the box stayed" would prove nothing about the mechanism.
        await expect(...gap("width, repainted", widthOf(after), widthOf(before))).toBeLessThan(3);
        await expect(...gap("height, repainted", heightOf(after), heightOf(before))).toBeLessThan(3);
      },
    },
    {
      name: "play.surfaced.the-border-is-its-own-ink — a record with no layers still draws its rim",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const root = tree(ctx.args["id"] as string, card());
        const filled = await paintWith(live, glass, FLAT, root);
        const rim = { color: "accent", width: 0.08, alignment: 1 } as const;
        const drawn = await paintWith(live, glass, { layers: [], stroke: rim }, root);
        // An empty layer list is legal — a record that only strokes its contour. So there is
        // ink, and the middle of the box is bare desk: the border is not a fill.
        await expect(drawn.count, "inked pixels for a record with no layers").toBeGreaterThan(0);
        await expect(differs(pixelAt(glass, 0.5, 0.5), pixelAt(glass, 0.02, 0.02)), "the middle is desk, not fill").toBe(false);
        // Inside-aligned, so the rim spans exactly the box the fill did — a bordered node
        // occupies the box it declared and not a hair more.
        await expect(...gap("rim width", widthOf(drawn), widthOf(filled))).toBeLessThan(4);
        await expect(...gap("rim height", heightOf(drawn), heightOf(filled))).toBeLessThan(4);
        // And the colour is the record's too: same geometry, different ink, different picture.
        const wasBlue = snapshot(glass);
        const recoloured = await paintWith(live, glass, { layers: [], stroke: { ...rim, color: "alert" } }, root);
        await expect(imagesDiffer(wasBlue, snapshot(glass)), "the recoloured rim is a different picture").toBe(true);
        await expect(...gap("rim width, recoloured", widthOf(recoloured), widthOf(drawn))).toBeLessThan(4);
      },
    },
    {
      name: "play.surfaced.width-and-dashes-are-absolute — a thicker rim inks more, a dashed one inks less",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const root = tree(ctx.args["id"] as string, card());
        const stroke = { color: "accent", alignment: 1 } as const;
        const thin = await paintWith(live, glass, { layers: [], stroke: { ...stroke, width: 0.04 } }, root);
        const thick = await paintWith(live, glass, { layers: [], stroke: { ...stroke, width: 0.12 } }, root);
        // Three times the width is about three times the ink, on the same contour. A border
        // drawn as a PICTURE of a border — one stretched to fit — would not answer this way.
        await expect(thick.count, `ink at width 0.12 against ${thin.count} at 0.04`).toBeGreaterThan(thin.count * 2);
        // And it still ends at the box: a wider inside-aligned stroke eats inward, never out.
        await expect(...gap("rim width, thickened", widthOf(thick), widthOf(thin))).toBeLessThan(4);
        const dashed = await paintWith(
          live,
          glass,
          { layers: [], stroke: { ...stroke, width: 0.12, dash: { on: 0.14, off: 0.09, corner: "dash" } } },
          root,
        );
        // GAPS ARE REAL. The same rim at the same width, cut into dashes, leaves markedly less
        // ink — a dash pattern that quietly drew a solid line would pass every other step here.
        await expect(dashed.count, `ink dashed against ${thick.count} solid`).toBeLessThan(thick.count * 0.8);
        await expect(dashed.count, "ink dashed — gaps, not a vanished rim").toBeGreaterThan(thick.count * 0.3);
      },
    },
    {
      name: "play.surfaced.a-different-record-is-a-different-picture — plate, bare, zone",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // The stock records, one after another on the same canvas. They differ by their border
        // and by the opacity of their ground — a renderer that read the name and drew one
        // picture for all three would pass every count above and fail exactly here.
        let before = snapshot(glass);
        let wore = "the record it opened with";
        for (const name of ["plate", "bare", "zone"]) {
          live.setRoot(tree(id, card(name)));
          await settled();
          const after = snapshot(glass);
          await expect(imagesDiffer(before, after), `"${name}" differs from ${wore}`).toBe(true);
          before = after;
          wore = `"${name}"`;
        }
      },
    },
    {
      name: "play.surfaced.the-paint-need-not-match-the-box — past its edge, and short of it",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const root = tree(ctx.args["id"] as string, card());
        const px = perUnit(live);
        // The box is the same in all three readings below; only the record changes. The first is
        // the reference: a plain fill IS the declared box.
        const box = await paintWith(live, glass, FLAT, root);
        // OUTSIDE. `alignment: 0` puts the whole stroke beyond the contour, so the picture grows
        // by the stroke's width on every side while the box the layout reserved did not move.
        // This is why the stock records align inside: half a stroke hanging over a neighbour is
        // a border that spends room nobody granted it.
        const outside = await paintWith(
          live,
          glass,
          { layers: [], stroke: { color: "accent", width: 0.2, alignment: 0 } },
          root,
        );
        const past = `ink ${Math.round(widthOf(outside))}px against box ${Math.round(widthOf(box))}px`;
        await expect(Math.round(widthOf(outside) - widthOf(box)), `${past} — past by`).toBeGreaterThan(nearly(px, 0.3));
        await expect(Math.round(widthOf(outside) - widthOf(box)), `${past} — no more than`).toBeLessThan(nearly(px, 0.5));
        // SHORT. A picture is fitted to the area and clipped by the contour, never stretched to
        // it: `contain` on an asset of another proportion leaves the box unfilled along one axis
        // — deliberately, because `cover` would look tidy and hide the mismatch instead.
        const rimShot = snapshot(glass);
        registerSurface(CARD, { layers: [{ image: "banner", fit: "contain" }] });
        live.setRoot(root);
        // A picture arrives through the network, so the frame it lands in is not the frame that
        // asked for it. The renderer redraws when it lands, and this waits for that redraw
        // rather than for a number of milliseconds somebody guessed.
        //
        // WAITING FOR INK ALONE IS A RACE, and it read the wrong frame once already: the border
        // above is still on the glass when the new record is registered, so "there is ink" was
        // true before anything changed and the step measured the BORDER. The frame has to
        // DIFFER from the one just measured, and then carry ink — the picture is the only thing
        // this record can draw, and between the two there is a bare frame with none.
        const shortOfIt = await waitFor(() => {
          const now = snapshot(glass);
          if (!imagesDiffer(rimShot, now)) return undefined;
          const drawn = inkOf(now, pixelAt(glass, 0.02, 0.02));
          return drawn.count > 0 ? drawn : undefined;
        }, "the picture never reached the glass");
        await expect(...gap("picture width", widthOf(shortOfIt), widthOf(box))).toBeLessThan(nearly(px, 0.1));
        await expect(
          Math.round(heightOf(shortOfIt)),
          `picture ${Math.round(heightOf(shortOfIt))}px tall against the box's ${Math.round(heightOf(box))}px`,
        ).toBeLessThan(Math.round(heightOf(box) * 0.7));
        await paintWith(live, glass, FLAT, root);
      },
    },
    {
      name: "play.surfaced.a-desk-takes-its-area-from-what-it-holds — a surface with no box of its own",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        registerSurface(CARD, FLAT);
        // THE ALTERNATIVE REQUIREMENT, on the glass. `Surfaced` needs an AREA, not a box, and a
        // container's content is the other source of one — which is what makes the desk possible
        // at all. The children carry boxes and no surface, so every pixel counted here is the
        // desk's own paint.
        const desk = (many: number): Node => {
          const held = node("desk", Container({ layout: "row" }), Surfaced({ surface: CARD }));
          for (let i = 0; i < many; i += 1) add(held, node(`box${i}`, Bounded({ bounds: rect(0.6, 0.6) })));
          return tree(id, held);
        };
        live.setRoot(desk(2));
        await settled();
        const two = ink(glass);
        // Two boxes of 0.6 and the row's gap of 0.12: the paint is WIDER than any box in the
        // tree, and exactly as wide as what the layout laid out.
        await expect(...gap("desk width, two boxes", widthOf(two), 1.32 * px)).toBeLessThan(nearly(px, 0.1));
        await expect(...gap("desk height", heightOf(two), 0.6 * px)).toBeLessThan(nearly(px, 0.1));
        // Take one away and the surface shrinks with it — the area is derived, not declared.
        live.setRoot(desk(1));
        await settled();
        const one = ink(glass);
        await expect(...gap("desk width, one box", widthOf(one), 0.6 * px)).toBeLessThan(nearly(px, 0.1));
        await expect(
          Math.round(widthOf(one)),
          `desk ${Math.round(widthOf(one))}px, was ${Math.round(widthOf(two))}px holding two`,
        ).toBeLessThan(Math.round(widthOf(two) * 0.6));
        live.setRoot(tree(id, card()));
        await settled();
      },
    },
  ]),
};

// ---- The area, when no box declares one -----------------------------------------------------
//
// `Surfaced` requires an AREA, and the requirement is ALTERNATIVE: a box gives one, and so does
// the extent of what a container holds. `Paint` above makes its claims through `Bounded`, which
// leaves the whole second branch resting on one step. This story is that branch taken apart —
// what the derived area IS, when there is none at all, and who wins when both are present.

export const Area: StoryObj<PaintArgs> = {
  args: { id: "root" },
  parameters: { gkDocStory: "tests.surfaced.area", controls: { include: ["id"] } },
  render: ({ id }) => {
    registerSurface(CARD, FLAT);
    return scene(desk(id, 2)).el;
  },
  play: checks([
    {
      name: "play.surfaced.an-empty-desk-has-no-area — a container holding nothing paints nothing",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        registerSurface(CARD, FLAT);
        // Nothing to derive an area FROM. The atom is there, the record is registered and
        // real — the same one that paints two lines down — and the node is simply not drawn.
        // This is the desk's version of `Starved`, and it is the state a zone is in before its
        // first card arrives.
        const empty = inkIn(glass, await shown(live, glass, desk(id, 0)));
        await expect(empty.count, "inked pixels for a desk holding nothing").toBe(0);
        // And it is not a latch: the area exists again the moment there is content.
        const holding = inkIn(glass, await shown(live, glass, desk(id, 1)));
        await expect(holding.count, "inked pixels once it holds one box").toBeGreaterThan(0);
      },
    },
    {
      name: "play.surfaced.content-without-boxes-is-no-area — children that reserve nothing",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        registerSurface(CARD, FLAT);
        // CHILDREN ARE NOT THE AREA — their BOXES are. A container of nodes that carry no
        // `Bounded` holds plenty and has reserved nothing, so there is still nothing to paint
        // on. Without this the step above would also pass for a renderer that counted children.
        const bare = node("desk", Container({ layout: "row" }), Surfaced({ surface: CARD }));
        for (const name of ["a", "b", "c"]) add(bare, node(name));
        const drawn = inkIn(glass, await shown(live, glass, tree(id, bare)));
        await expect(drawn.count, "inked pixels over three boxless children").toBe(0);
      },
    },
    {
      name: "play.surfaced.a-box-of-its-own-wins — the derived area is the FALLBACK, not the sum",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        registerSurface(CARD, FLAT);
        // The same desk, now carrying a box of its own that is SMALLER than what it holds. The
        // two answers are far apart — 0.5 against the row's 1.32 — so the reading says which
        // rule fired rather than merely being consistent with one.
        const held = node(
          "desk",
          Bounded({ bounds: rect(0.5, 0.5) }),
          Container({ layout: "row" }),
          Surfaced({ surface: CARD }),
        );
        for (const name of ["left", "right"]) add(held, node(name, Bounded({ bounds: rect(0.6, 0.6) })));
        const drawn = inkIn(glass, await shown(live, glass, tree(id, held)));
        await expect(...gap("paint width, own box", widthOf(drawn), 0.5 * px)).toBeLessThan(nearly(px, 0.1));
        await expect(...gap("paint height, own box", heightOf(drawn), 0.5 * px)).toBeLessThan(nearly(px, 0.1));
      },
    },
    {
      name: "play.surfaced.the-layout-decides-the-area — the same two boxes, in a row and free",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        registerSurface(CARD, FLAT);
        // THE AREA IS NOT A PROPERTY OF THE CHILDREN. Two identical boxes, one container, one
        // record — and the painted area changes because the LAYOUT put them somewhere else.
        // `free` places nobody, so both keep the pose they never had and sit on the origin.
        const row = inkIn(glass, await shown(live, glass, desk(id, 2, "row")));
        const free = inkIn(glass, await shown(live, glass, desk(id, 2, "free")));
        await expect(...gap("row width, two and a gap", widthOf(row), 1.32 * px)).toBeLessThan(nearly(px, 0.1));
        await expect(...gap("free width, both at origin", widthOf(free), 0.6 * px)).toBeLessThan(nearly(px, 0.1));
        // The height is the one that must NOT move: a row spends width, and a layout that
        // spent both would be a scale.
        await expect(...gap("height, unchanged by the layout", heightOf(free), heightOf(row))).toBeLessThan(3);
      },
    },
  ]),
};

// ---- The contour, when the shape does not enclose anything -----------------------------------
//
// A `Shape` is a path and need not close over anything: two places are a line and one is a
// point. Both are legal values that `Bounded` will hold — and what the SURFACE does with them is
// a different question, answered nowhere else in the suite. It is the question behind `Path` on
// the `Atoms/Surfaced` shelf and `ArrowHead`/`Arrow` on `Presets/Components`, so a claim here is
// what keeps those scenes honest.

export const Openwork: StoryObj<PaintArgs> = {
  args: { id: "root" },
  parameters: { gkDocStory: "tests.surfaced.openwork", controls: { include: ["id"] } },
  render: ({ id }) => {
    registerSurface(CARD, FLAT);
    return scene(tree(id, shaped(polyline(LINE)))).el;
  },
  play: checks([
    {
      name: "play.surfaced.one-place-is-not-a-contour — a shape of a single point paints nothing",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // A fat stroke and a fill, so that anything the renderer was willing to draw would be
        // impossible to miss.
        registerSurface(CARD, { layers: [{ paint: "panelBg" }], stroke: { color: "accent", width: 0.24, alignment: 0.5, cap: "round" } });
        // TWO PLACES FIRST, and it is not narrative order: the reading has to be a frame that
        // arrived, and the only way to know one did is that the picture changed. Starting from
        // the point — nothing, on a stage that is already nothing — there would be no change to
        // wait for and no way to tell a drawn blank from a missed redraw.
        const pair = await shapeOn(live, glass, id, polyline(LINE));
        await expect(pair.count, "inked pixels for two places").toBeGreaterThan(0);
        // Take one away and the whole picture goes with it: one place spans nothing and
        // encloses nothing, so there is no contour to stroke and no area to fill.
        const alone = await shapeOn(live, glass, id, polyline([{ x: 0, y: 0 }]));
        await expect(alone.count, "inked pixels once only one place is left").toBe(0);
      },
    },
    {
      name: "play.surfaced.the-contour-closes-itself — a solid line has no end for a cap to shape",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const rim = { color: "accent", width: 0.24, alignment: 0.5 } as const;
        const line = () => tree(id, shaped(polyline(LINE)));
        // A shape is a REGION, so the path closes: the line is walked out and walked back and
        // has no free ends at all. The cap is therefore not merely invisible here — there is
        // nothing for it to apply to, and the two pictures are the SAME picture.
        //
        // TWO IDENTICAL READINGS CANNOT BE WAITED FOR, so a third and obviously different one
        // goes between them: each reading is then a frame known to have arrived, and "the same"
        // is a measurement rather than a redraw nobody noticed was missing.
        registerSurface(CARD, { layers: [], stroke: { ...rim, cap: "butt" } });
        const butt = await shown(live, glass, line());
        registerSurface(CARD, { layers: [], stroke: { ...rim, width: 0.5, cap: "butt" } });
        await shown(live, glass, line());
        registerSurface(CARD, { layers: [], stroke: { ...rim, cap: "round" } });
        const round = await shown(live, glass, line());
        await expect(imagesDiffer(butt, round), "a round cap changes the solid line").toBe(false);
      },
    },
    {
      name: "play.surfaced.a-dash-has-ends-of-its-own — cutting the line brings the cap back",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const rim = { color: "accent", width: 0.24, alignment: 0.5, dash: { on: 0.3, off: 0.3 } } as const;
        const line = () => tree(id, shaped(polyline(LINE)));
        // THE OTHER HALF OF THE STEP ABOVE, and the reason it is not a claim that caps do
        // nothing. A dash is an open polyline whatever the contour was, so every one of them
        // has two ends — and a round cap now spends ink past each of them.
        registerSurface(CARD, { layers: [], stroke: { ...rim, cap: "butt" } });
        const flatShot = await shown(live, glass, line());
        const flat = inkIn(glass, flatShot);
        registerSurface(CARD, { layers: [], stroke: { ...rim, cap: "round" } });
        const roundShot = await shown(live, glass, line());
        await expect(imagesDiffer(flatShot, roundShot), "a round cap changes the dashed line").toBe(true);
        await expect(inkIn(glass, roundShot).count, `ink round-capped against ${flat.count} flat`).toBeGreaterThan(flat.count);
      },
    },
    {
      name: "play.surfaced.an-arrow-is-a-run-and-two-nodes — a head is not a detour in the walk",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const px = perUnit(live);
        installStockHeads();
        registerSurface(CARD, { layers: [], stroke: { color: "accent", width: 0.05, alignment: 0.5 } });
        // A HEAD IS ITS OWN NODE, so the reading is the whole assembly on the glass: the run under
        // one record and each end under another. Ink is what says a node arrived — a head sewn
        // into the line's contour would look the same in a unit test and could not be filled.
        const plain = await paintedOn(live, glass, id, {});
        const one = await paintedOn(live, glass, id, { endHead: "pointer" });
        const two = await paintedOn(live, glass, id, { startHead: "pointer", endHead: "pointer" });
        await expect(one.count, `ink with one head against ${plain.count} with none`).toBeGreaterThan(plain.count);
        await expect(two.count, `ink with two heads against ${one.count} with one`).toBeGreaterThan(one.count);
        // AND THE TWO ENDS ARE ONE DESCRIPTION USED TWICE: the near end alone and the far end
        // alone are mirror images, so they cost the same ink. Two blocks of nearly identical
        // arithmetic is how a double-headed arrow ends up subtly lopsided.
        const near = await paintedOn(live, glass, id, { startHead: "pointer" });
        await expect(...gap("ink, one end or the other", near.count, one.count)).toBeLessThan(px * 0.1);
        // Every one of them spans the run that was asked for: a head reaches BACK from the end,
        // and a picture that grew past it would be a preset inventing room.
        await expect(...gap("arrow span", widthOf(two), (RUN.to.x - RUN.from.x) * px)).toBeLessThan(nearly(px, 0.2));
      },
    },
    {
      name: "play.surfaced.a-head-wears-its-own-record — filled on a hairline, and the line untouched",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        installStockHeads();
        // THE POINT OF THE HEAD BEING A NODE. `ink` is a hairline stroke with no layers; `mark` is
        // solid accent. The same arrow under the two head records is a different picture, and the
        // solid one spends more ink — while the run below it did not change at all.
        registerSurface(CARD, FLAT);
        const hairline = inkIn(glass, await shown(live, glass, tree(id, arrow({ ...RUN, endHead: "pointer", endSize: 0.5, surface: "ink" }))));
        const filled = inkIn(
          glass,
          await shown(live, glass, tree(id, arrow({ ...RUN, endHead: "pointer", endSize: 0.5, surface: "ink", endSurface: "mark" }))),
        );
        await expect(hairline.count, "inked pixels, outlined head").toBeGreaterThan(0);
        await expect(filled.count, `ink filled against ${hairline.count} outlined`).toBeGreaterThan(hairline.count);
        // The run is the same run: dressing the head differently moved nothing.
        await expect(...gap("span, either head record", widthOf(filled), widthOf(hairline))).toBeLessThan(perUnit(live) * 0.2);
      },
    },
    {
      name: "play.surfaced.the-pattern-lives-in-the-record — one walk under two stock names",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // NOT A REGISTRATION OF ITS OWN: these are the stock records `ink` and `trail`, the two
        // the kit ships for shapes that enclose nothing. Both are a stroke and no layers at all,
        // and the only difference between them is a dash — so the same walk comes out solid or
        // cut, and the geometry never heard of either.
        const solid = inkIn(glass, await shown(live, glass, tree(id, shaped(line(RUN), "ink"))));
        const dashed = inkIn(glass, await shown(live, glass, tree(id, shaped(line(RUN), "trail"))));
        await expect(solid.count, "inked pixels under ink").toBeGreaterThan(0);
        await expect(dashed.count, `ink dashed against ${solid.count} solid`).toBeLessThan(solid.count);
        // And the run is the same run: cutting a line into dashes does not shorten it.
        await expect(...gap("dashed span", widthOf(dashed), widthOf(solid))).toBeLessThan(perUnit(live) * 0.2);
      },
    },
  ]),
};
