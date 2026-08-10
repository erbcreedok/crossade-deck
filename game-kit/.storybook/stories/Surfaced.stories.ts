import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  arrow,
  assetNames,
  Bounded,
  Container,
  headNames,
  headShape,
  installStockHeads,
  line,
  node,
  rect,
  registerSurface,
  Surfaced,
  Transformable,
  surfaceNames,
  transformShape,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import {
  ALIGNS,
  FITS,
  PAINTS,
  RECORD_ARGS,
  RECORD_ARG_TYPES,
  documented,
  paintOf,
  recordOf,
  shapeArgTypes,
  shapeArgs,
  shapeOf,
  type RecordArgs,
  type ShapeArgs,
} from "./surfaceControls.js";

// The atom has ONE field, and its section has eight scenes — because what is worth learning here
// is not the field, it is what the name on the other end of it can be. Each scene is a different
// ASSEMBLY or a differently built record; the values inside one are arguments, never a page of
// stories per value.
//
// `Plate` is the whole model at once: any shape the box can be, every property the record can
// hold. It used to be a rectangle with a colour picker, and `Shapes` was a separate scene with
// three fixed shapes and no record at all — so a reader could not tell what the kit cannot do
// from what the catalog did not ask. Merged rather than duplicated.
//
// `Path` and `ArrowHead` are the two after it, and they are ONE NODE EACH — deliberately. Both are
// halves of the same picture and they belong to opposite sides of one fact: a path walked out and
// back encloses nothing, so its fill has nothing to cover and what appears is the stroke; a head
// is a closed shape, so its fill is the picture. Two records, two nodes.
//
// PUT TOGETHER they are an arrow, and that assembly is not on this shelf: it is `Presets/Line`,
// where a scene is free to be three nodes at once. This one is about the ATOM, and an atom is
// shown one node at a time.

// The registries are filled by `surfaceControls`, which every section imports — see the note
// there on why that has to happen at module load and not at the first render.
const surfacePicker = documented("arg.surface", { control: "select", options: surfaceNames() });

const meta: Meta = {
  title: "Atoms/Surfaced",
  parameters: {
    gkDoc: "surfaced.component",
    // What this section claims to cover, checked against the atom itself by
    // `guard.every-field-has-a-control`. The day a second field is declared, the guard fails
    // here rather than the gap being noticed months later by a reader.
    gkAtom: "Surfaced",
    gkFields: { surface: ["surface", "Plate"] },
  },
};
export default meta;

// ---- Plate: the shape, the record, the node ------------------------------------------------

interface PlateArgs extends ShapeArgs, RecordArgs {
  id: string;
}

// A COMMENT IN A RENDER BODY IS PART OF THE SNIPPET — it is printed with the code and copied
// with it. So notes about the catalog live out here, above the story, and only what a reader
// would want in their own file stays inside.
//
// The registry name is written out twice rather than kept in a module const, for the same
// reason: a const reads better in this file and prints as a bare identifier nobody has.
export const Plate: StoryObj<PlateArgs> = {
  // The same box as `Bounded → Square`, one atom later — and now it can be seen. Every property of
  // the record is here, and so is every shape the box can be: a rect, a circle, a polygon of as
  // many corners as you like, or one pasted in from somewhere else.
  render: (a) => {
    registerSurface("story.plate", recordOf(a));
    return scene(node(a.id.trim() || "card", Bounded({ bounds: shapeOf(a) }), Surfaced({ surface: "story.plate" }))).el;
  },
  args: { id: "card", ...shapeArgs(), ...RECORD_ARGS },
  argTypes: {
    // A node is NAMED, and the name is what the tree below follows.
    id: documented("arg.id", { control: "text" }, "node"),
    ...shapeArgTypes(),
    ...RECORD_ARG_TYPES,
  },
  parameters: { gkDocStory: "surfaced.plate" },
};

// ---- Path: one node, and a shape with no inside ---------------------------------------------

interface PathArgs extends RecordArgs {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  bend: number;
}

// THE SECTION IS `line`, NOT `bounds`, and the difference is the point of naming sections at all.
// These are the arguments of a CALL whose result becomes `bounds` — the same relation the
// scale/turn/move controls have to a pasted shape on the `Bounded` shelf. Filed under `bounds` they
// would be claiming the atom has a bend, and it has one field holding whatever it was handed.
const place = (key: string, part: string): Record<string, unknown> =>
  documented(key, { control: { type: "number", step: 0.05 } }, `line/${part}`);

/** A path's record: a stroke and NO fill, because a walk out and back has no inside to paint. */
const INK: Partial<RecordArgs> = {
  fill: "",
  radius: 0,
  strokeWidth: 0.04,
  alignment: 0.5,
  cap: "round",
  join: "round",
};

export const Path: StoryObj<PathArgs> = {
  // ONE NODE, and the smallest interesting thing a surface can be asked to paint: a path. The
  // places are `from` and `to` and they are yours to move; `bend` is a number, and at zero the run
  // between them is straight. There is no switch anywhere that says "straight" or "curved" — a
  // curve is where the places are, and `bend` puts one between the ends without moving either.
  //
  // A shape is a REGION, so the path closes itself: walked out and walked back it encloses nothing,
  // the fill has nothing to cover, and everything visible is the stroke. That is the whole record
  // below, the same one `Plate` builds — a line is a path and a stroke, and nothing else.
  render: (a) => {
    registerSurface("story.path", recordOf(a));
    const run = line({ from: { x: a.fromX, y: a.fromY }, to: { x: a.toX, y: a.toY }, bend: a.bend });
    return scene(node("path", Bounded({ bounds: run }), Surfaced({ surface: "story.path" }))).el;
  },
  args: {
    fromX: -1.1,
    fromY: 0,
    toX: 1.1,
    toY: 0,
    bend: 0,
    ...RECORD_ARGS,
    ...INK,
  },
  argTypes: {
    fromX: place("arg.fromX", "from"),
    fromY: place("arg.fromY", "from"),
    toX: place("arg.toX", "to"),
    toY: place("arg.toY", "to"),
    bend: documented("arg.bend", { control: { type: "range", min: -1, max: 1, step: 0.05 } }, "line"),
    ...RECORD_ARG_TYPES,
  },
  parameters: { gkDocStory: "surfaced.path" },
};

// ---- ArrowHead: one node again, and a shape that DOES have an inside -------------------------

interface HeadArgs extends RecordArgs {
  head: string;
  size: number;
  turn: number;
}

export const ArrowHead: StoryObj<HeadArgs> = {
  // THE OTHER HALF OF AN ARROW, on its own — because that is what it is: one node, one shape, one
  // record. The shape comes out of a registry by name; a fifth head is `registerHead` with any
  // closed shape at all behind it, which is why a suit or a piece is not a special case.
  //
  // Unlike the path above, this shape HAS an inside — so the fill is doing something here, and the
  // same record can make it solid, hollow, or a box with a picture on it. `turn` is the angle it
  // would be given by a path arriving at that angle; on its own the head has no idea about paths.
  render: (a) => {
    registerSurface("story.head", recordOf(a));
    const mark = headShape(a.head) ?? line({ from: { x: 0, y: 0 }, to: { x: 0, y: 0 } });
    const shape = transformShape(mark, { scaleX: a.size, scaleY: a.size, rotate: a.turn });
    return scene(node("head", Bounded({ bounds: shape }), Surfaced({ surface: "story.head" }))).el;
  },
  args: { head: "pointer", size: 1.2, turn: 0, ...RECORD_ARGS, fill: "accent", radius: 0, stroke: false },
  argTypes: {
    head: documented("arg.head", { control: "select", options: headNames() }, "bounds"),
    size: documented("arg.size", { control: { type: "number", min: 0, step: 0.1 } }, "builder"),
    turn: documented("arg.turn", { control: { type: "number", step: 15 } }, "builder"),
    ...RECORD_ARG_TYPES,
  },
  parameters: { gkDocStory: "surfaced.arrowHead" },
};

// ---- Desk: the area comes from the content -------------------------------------------------

interface DeskArgs {
  surface: string;
  children: number;
}

export const Desk: StoryObj<DeskArgs> = {
  // A surface with no box of its own: the area comes from what the node HOLDS. Take the
  // children away and there is nothing left to paint on.
  render: ({ surface, children }) => {
    const desk = node("desk", Container({ layout: "row" }), Surfaced({ surface }));
    for (let i = 0; i < children; i += 1) add(desk, node(`card${i}`, Bounded(), Surfaced()));
    return scene(desk).el;
  },
  args: { surface: "zone", children: 2 },
  argTypes: {
    surface: surfacePicker,
    children: documented("arg.children", { control: { type: "range", min: 0, max: 6, step: 1 } }),
  },
  parameters: { gkDocStory: "surfaced.desk" },
};

// ---- Starved: the atom is there and the area is not ----------------------------------------

interface StarvedArgs {
  box: boolean;
  surface: string;
}

export const Starved: StoryObj<StarvedArgs> = {
  // `Surfaced` needs an AREA, and a node can carry the atom without one. That is not an error
  // and not a crash — it is a node that is simply not drawn. Give it a box and it appears.
  render: ({ box, surface }) => scene(node("card", ...(box ? [Bounded()] : []), Surfaced({ surface }))).el,
  args: { box: false, surface: "plate" },
  argTypes: { surface: surfacePicker, box: documented("arg.box", {}) },
  parameters: { gkDocStory: "surfaced.starved" },
};

// ---- Dangling: a name nobody registered ----------------------------------------------------

interface DanglingArgs {
  name: string;
}

export const Dangling: StoryObj<DanglingArgs> = {
  // A reference to a record that does not exist. The node is skipped and the scene lives: one
  // bad name must not hide every node that was fine. The inspector still reports the name, so
  // the mistake is readable rather than merely invisible.
  render: ({ name }) => {
    const desk = node("desk", Container({ layout: "free" }));
    add(desk, node("good", Bounded(), Surfaced(), Transformable({ at: { x: -0.8, y: 0 } })));
    add(desk, node("dangling", Bounded(), Surfaced({ surface: name }), Transformable({ at: { x: 0.8, y: 0 } })));
    return scene(desk).el;
  },
  args: { name: "nosuch" },
  argTypes: { name: documented("arg.name", { control: "text" }) },
  parameters: { gkDocStory: "surfaced.dangling" },
};

// ---- Restyle: the record is the unit of restyling -------------------------------------------

interface RestyleArgs {
  bordered: boolean;
  accent: string;
  accentCustom: string;
  width: number;
}

export const Restyle: StoryObj<RestyleArgs> = {
  // THE lesson of this atom. Two cards name one record; re-register it and both change in a
  // single step, while neither box moves a unit. Fields on the node could not show this — it
  // would take a walk over every node, and "the boxes stayed" would prove nothing.
  render: ({ bordered, accent, accentCustom, width }) => {
    registerSurface("story.shared", {
      layers: [{ paint: "panelBg" }],
      radius: 0.08,
      ...(bordered ? { stroke: { color: paintOf(accent, accentCustom), width, alignment: 1 } } : {}),
    });
    const desk = node("desk", Container({ layout: "row" }));
    for (const id of ["left", "right"]) {
      add(desk, node(id, Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "story.shared" })));
    }
    return scene(desk).el;
  },
  args: { bordered: true, accent: "accent", accentCustom: "", width: 0.04 },
  argTypes: {
    bordered: documented("arg.bordered", {}),
    accent: documented("arg.accent", { control: "select", options: PAINTS, if: { arg: "bordered" } }),
    accentCustom: documented("arg.accentCustom", { control: "color", if: { arg: "bordered" } }),
    width: documented("arg.width", { control: { type: "number", min: 0, step: 0.01 }, if: { arg: "bordered" } }),
  },
  parameters: { gkDocStory: "surfaced.restyle" },
};

// ---- Layers: paint stacks, bottom first ----------------------------------------------------

interface LayersArgs {
  under: string;
  underCustom: string;
  underOpacity: number;
  underImage: string;
  underFit: (typeof FITS)[number];
  underAlign: (typeof ALIGNS)[number];
  over: string;
  overCustom: string;
  overOpacity: number;
  overImage: string;
  overFit: (typeof FITS)[number];
  overAlign: (typeof ALIGNS)[number];
  swap: boolean;
}

export const Layers: StoryObj<LayersArgs> = {
  // A record is a LIST of coats, not one fill. Order is the whole point, and it is visible the
  // moment the upper one is see-through: swap them and the blend changes. This is also where a
  // zone's low-opacity ground comes from — a layer, not a special kind of surface.
  render: (a) => {
    const layers = [
      {
        paint: paintOf(a.under, a.underCustom),
        opacity: a.underOpacity,
        ...(a.underImage ? { image: a.underImage, fit: a.underFit, align: a.underAlign } : {}),
      },
      {
        paint: paintOf(a.over, a.overCustom),
        opacity: a.overOpacity,
        ...(a.overImage ? { image: a.overImage, fit: a.overFit, align: a.overAlign } : {}),
      },
    ];
    registerSurface("story.stack", { layers: a.swap ? [...layers].reverse() : layers, radius: 0.08 });
    return scene(node("card", Bounded({ bounds: rect(2, 1.4) }), Surfaced({ surface: "story.stack" }))).el;
  },
  args: {
    under: "panelBg",
    underCustom: "",
    underOpacity: 1,
    underImage: "tile",
    underFit: "repeat",
    underAlign: "center",
    over: "",
    overCustom: "",
    overOpacity: 1,
    overImage: "emblem",
    overFit: "contain",
    overAlign: "topRight",
    swap: false,
  },
  argTypes: {
    under: documented("arg.under", { control: "select", options: ["", ...PAINTS] }),
    underCustom: documented("arg.underCustom", { control: "color" }),
    underOpacity: documented("arg.underOpacity", { control: { type: "range", min: 0, max: 1, step: 0.05 } }),
    underImage: documented("arg.underImage", { control: "select", options: ["", ...assetNames()] }),
    underFit: documented("arg.underFit", { control: "select", options: FITS, if: { arg: "underImage", neq: "" } }),
    underAlign: documented("arg.underAlign", { control: "select", options: ALIGNS, if: { arg: "underImage", neq: "" } }),
    over: documented("arg.over", { control: "select", options: ["", ...PAINTS] }),
    overCustom: documented("arg.overCustom", { control: "color" }),
    overOpacity: documented("arg.overOpacity", { control: { type: "range", min: 0, max: 1, step: 0.05 } }),
    overImage: documented("arg.overImage", { control: "select", options: ["", ...assetNames()] }),
    overFit: documented("arg.overFit", { control: "select", options: FITS, if: { arg: "overImage", neq: "" } }),
    overAlign: documented("arg.overAlign", { control: "select", options: ALIGNS, if: { arg: "overImage", neq: "" } }),
    swap: documented("arg.swap", {}),
  },
  parameters: { gkDocStory: "surfaced.layers" },
};
