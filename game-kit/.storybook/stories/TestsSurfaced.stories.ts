import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  add,
  Bounded,
  Container,
  node,
  rect,
  registerSurface,
  Surfaced,
  type Node,
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
