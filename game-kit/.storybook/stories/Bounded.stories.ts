import type { Meta, StoryObj } from "@storybook/html";
import { Bounded, node, type Shape } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, shapeArgTypes, shapeOf, SHAPE_ARGS, type ShapeArgs } from "./surfaceControls.js";

// ONE ATOM, ONE FIELD, AND A SHELF OF WORKED EXAMPLES.
//
// `Bounded` holds `bounds` and nothing else. There were two fields here — `size`, and a
// `bounds` that overrode it — and the section had a story per field to match. They taught a
// distinction the kit did not have: `footprint()` was the only way in and always answered the
// override, so nothing ever saw the declared shape. A reader saw two pages showing one thing
// and said so within a minute of opening them.
//
// So the section is shaped the other way round now. Every story below carries the SAME
// controls, because there is one field and one way to edit it; what differs is where each one
// STARTS. `Path` is the one exception and says why in its own note: it teaches the VALUE, so
// its panel hands over `bounds` whole and offers no builder at all. A shape written out in its arguments is a worked example — open the panel, read the
// numbers that made it, change them. A page per argument VALUE would be a catalog of
// screenshots; a page per shape, fully editable, is something a reader can copy and own.
//
// The shapes are not a list of what the kit supports, and there is nothing here to support: a
// `Shape` has NO sorts. Every name below is a helper that returns the same one type, so the
// shelf is a set of worked examples rather than a catalogue of capabilities.

interface BoxArgs extends ShapeArgs {
  id: string;
}

const meta: Meta<BoxArgs> = {
  title: "Atoms/Bounded",
  parameters: {
    gkDoc: "bounded.component",
    // The atom's fields, and which controls serve each — checked against the atom itself by
    // `guard.every-field-has-a-control`. One entry, because there is one field.
    gkAtom: "Bounded",
    gkFields: {
      bounds: ["preset", "w", "h", "radius", "r", "rx", "ry", "corners", "polyR", "points", "outerR", "innerR", "d"],
    },
  },
  // The shape's DEFAULTS live here, so a story's own arguments hold only what makes it that
  // shape — and the Code panel shows exactly those. Written into every story instead, the
  // snippet came out led by `...shapeArgs({ … })`: a name from this website, in the one place
  // that is supposed to be code a reader can take away.
  args: { ...SHAPE_ARGS },
  // SHARED, so every story on the shelf has the identical panel. A control that exists on eight
  // pages and not on the ninth reads as a limit of that shape, which is the exact
  // misunderstanding this section was rebuilt to repair.
  argTypes: {
    // Not a field of `Bounded` — the node's own name, so it stands in its own group.
    id: documented("arg.id", { control: "text" }, "node"),
    ...shapeArgTypes(),
  },
};
export default meta;

// `render` is NOT hoisted into the meta above, though it is the same line nine times. The Code
// panel shows a STORY's own source, and a story carrying only arguments unwraps to `{ args: {
// … } }` — not a program, nothing to run. On a shelf whose whole purpose is "copy this and make
// your own", that is the one thing that must not break. The repetition buys a runnable snippet
// on every page.
//
// THE OUTLINE STARTS ON, in this section only. `Bounded` paints nothing — that is its lesson —
// so a scene here opens on an empty stage, and left off by default the page's first impression
// is that it is broken. The switch is still the reader's: the toolbar owns it.

// THE SHAPE ITSELF, with no helper anywhere near it — and FIRST, before every story that calls
// one.
//
// Everything below this line reaches for `rect`, `circle`, `star`. Read them in order and the
// answer to "what IS a bound" never arrives: ten pages of calls, and the value they return
// shown nowhere. The helpers are shortcuts TO this; a shortcut taught before the thing it
// shortens teaches the shortcut.
//
// ONE CONTROL FOR ONE FIELD. `bounds` is a single value, so the panel hands over that value
// whole rather than chopping it into a `start` box and a `segments` box — two controls for one
// field is the same lie the deleted `size`/`bounds` pair told. No preset, no `w`, no radius
// either: this is the page where the panel must not offer a builder, because a builder is
// exactly what it exists to do without.
//
// The default is a chevron on purpose: no helper in the kit makes one. A square here would
// invite "so why not just `rect(1, 1)`", and the answer — that this is what `rect` RETURNS —
// is on the page rather than in the picture.
export const Path: StoryObj<{ id: string; bounds: Shape }> = {
  args: {
    id: "arrow",
    bounds: {
      start: { x: -1, y: -0.6 },
      segments: [{ to: { x: 0, y: 0.6 } }, { to: { x: 1, y: -0.6 } }, { to: { x: 0, y: -0.1 } }],
    },
  },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "node"),
    // The field, edited AS the field. Add a pair to `segments` and the outline grows a side;
    // give one a `c1` and a `c2` and that side bends.
    bounds: documented("arg.bounds", { control: "object" }),
  },
  parameters: { gkDocStory: "bounded.path", controls: { include: ["id", "bounds"] } },
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: a.bounds })), { bounds: true }).el,
};

// The plainest box there is, and the atom's own default. First of the SHAPES, because it is the
// one a reader should meet before any of the ones that show off.
export const Square: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "card", preset: "rect", w: 1, h: 1 },
  parameters: { gkDocStory: "bounded.square" },
};

export const Rectangle: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "card", preset: "rect", w: 1, h: 1.4 },
  parameters: { gkDocStory: "bounded.rectangle" },
};

// A real line: two points, zero height, no inside. It used to be a rect 0.04 units thick, and
// the thickness was the tell — a tolerance somebody had to pick, which is the sign of a
// substitution. Written as a path there is nothing to pick.
export const Line: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "rule", preset: "path", vertices: "-1.2,0 1.2,0" },
  parameters: { gkDocStory: "bounded.line" },
};

// The end of that road: one point and no segments at all. Legal, and not the same answer as a
// node with no `Bounded` — `footprint()` tells a zero shape from `undefined`.
export const Point: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "anchor", preset: "path", vertices: "0,0" },
  parameters: { gkDocStory: "bounded.point" },
};

export const Circle: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "chip", preset: "circle", r: 0.8 },
  parameters: { gkDocStory: "bounded.circle" },
};

// An oval is not a stretched circle — it is the general case, and `circle(r)` is `ellipse(r, r)`.
// Four cubics either way; the two radii are the only difference between them.
export const Oval: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "token", preset: "ellipse", rx: 1.2, ry: 0.8 },
  parameters: { gkDocStory: "bounded.oval" },
};

// Computed rather than pasted: N corners on a circle, from a count and a radius. Nobody writes
// five pairs of coordinates for a pentagon, and `polygon(5, 0.9)` says what it is.
export const Pentagon: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "badge", preset: "polygon", corners: 5, polyR: 0.9 },
  parameters: { gkDocStory: "bounded.pentagon" },
};

export const Star: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "star", preset: "star", points: 5, outerR: 1, innerR: 0.42 },
  parameters: { gkDocStory: "bounded.star" },
};

// A PASTED PATH, and the only story on the shelf that needs the builder. As a polygon this was
// a bent banana: a curve drawn with straight runs is faceted exactly where it turns most, which
// is exactly where the eye is looking.
export const Swoosh: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: {
    id: "mark",
    preset: "svg",
    // AS IT COMES OUT OF THE FILE, and that is the point of this page. The mark is a real one —
    // Wikimedia's, `viewBox="135.5 361.38 1000 356.39"` — so the coordinates run from 135 to
    // 1135 with the origin somewhere off to the upper left. Nothing in the kit is going to guess
    // what size that was meant to be.
    d:
      "M245.8075 717.62406c-29.79588-1.1837-54.1734-9.3368-73.23459-24.4796-3.63775-2.8928-12.30611-11." +
      "5663-15.21427-15.2245-7.72958-9.7193-12.98467-19.1785-16.48977-29.6734-10.7857-32.3061-5.23469-7" +
      "4.6989 15.87753-121.2243 18.0765-39.8316 45.96932-79.3366 94.63252-134.0508 7.16836-8.0511 28.51" +
      "526-31.5969 28.65302-31.5969.051 0-1.11225 2.0153-2.57652 4.4694-12.65304 21.1938-23.47957 46.15" +
      "8-29.37751 67.7703-9.47448 34.6785-8.33163 64.4387 3.34693 87.5151 8.05611 15.898 21.86731 29.66" +
      "84 37.3979 37.2806 27.18874 13.3214 66.9948 14.4235 115.60699 3.2245 3.34694-.7755 169.19363-44." +
      "801 368.55048-97.8366 199.35686-53.0408 362.49439-96.4029 362.51989-96.3672.056.046-463.16259 19" +
      "8.2599-703.62654 301.0914-38.08158 16.2806-48.26521 20.3928-66.16827 26.6785-45.76525 16.0714-86" +
      ".76008 23.7398-119.89779 22.4235z",
    // WHICH IS WHAT THE BUILDER IS FOR. 1000 tool units become 2.8 of ours, and the centre of
    // the box is carried onto the origin, because a shape is placed and turned by its `(0,0)`.
    // Baked in once, here: what reaches `bounds` is a shape in units like every other on the
    // shelf, and nothing about this arithmetic survives into the model.
    scaleX: 0.0028,
    scaleY: 0.0028,
    offsetX: -1.7794,
    offsetY: -1.5108,
  },
  parameters: { gkDocStory: "bounded.swoosh" },
};

export const Pawn: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: {
    id: "pawn",
    preset: "svg",
    // WRITTEN BY HAND, in units, unlike the swoosh above — which is why it needs no builder. A
    // flared base, a waist, a collar and a ball, each one a curve; straight only where a pawn is
    // straight, on the foot it stands on. `fromSvgPath` is the shortest way to author curves by
    // hand as well as the way to take a paste: `d` is a notation, not a provenance.
    d:
      "M -0.6 0.95 L 0.6 0.95 C 0.5 0.72 0.26 0.62 0.2 0.35 C 0.16 0.2 0.3 0.16 0.3 0.05 " +
      "C 0.3 -0.06 0.16 -0.08 0.13 -0.3 C 0.3 -0.36 0.34 -0.48 0.34 -0.62 " +
      "C 0.34 -0.8 0.19 -0.96 0 -0.96 C -0.19 -0.96 -0.34 -0.8 -0.34 -0.62 " +
      "C -0.34 -0.48 -0.3 -0.36 -0.13 -0.3 C -0.16 -0.08 -0.3 -0.06 -0.3 0.05 " +
      "C -0.3 0.16 -0.16 0.2 -0.2 0.35 C -0.26 0.62 -0.5 0.72 -0.6 0.95 Z",
  },
  parameters: { gkDocStory: "bounded.pawn" },
};
