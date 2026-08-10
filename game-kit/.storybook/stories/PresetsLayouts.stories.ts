import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  gridLayout,
  node,
  radialLayout,
  rect,
  registerLayout,
  rowLayout,
  slotsLayout,
  Surfaced,
  Transformable,
  type LayoutAlign,
  type Point,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// PRESETS THAT GENERATE AN ARRANGEMENT — one page per walk, and nothing else on it.
//
// Every one of these is an ORDINARY FUNCTION the kit exports, returning the same still-nameless
// RECORD `rowLayout` does; the `registerLayout` call in each render is the naming, made in front
// of the reader on purpose — it is the one move a game repeats for every arrangement of its own.
//
// The cards are sized DIFFERENTLY on purpose, here more than anywhere: alignment is invisible
// over equal boxes, and a row of equal cells would pass off `start`, `center` and `end` as one
// picture. What no story here can show is a turn or a lift — a place answer is points by TYPE,
// so facing the middle of the circle stays the child's own `angle`.

/** One real child, an entry per node — sized, because equal boxes hide every alignment. */
interface SizedEntry {
  readonly id: string;
  readonly w: number;
  readonly h: number;
}

const BENCH: SizedEntry[] = [
  { id: "card0", w: 1, h: 1.4 },
  { id: "card1", w: 0.8, h: 0.8 },
  { id: "card2", w: 1.2, h: 1.9 },
];

interface LineArgs {
  children: SizedEntry[];
  gap: number;
  align: LayoutAlign;
}

const meta: Meta<LineArgs> = {
  title: "Presets/Layouts",
  parameters: { gkDoc: "presetsLayouts.component" },
  args: { children: BENCH, gap: 0.15, align: "center" },
  argTypes: {
    children: documented("arg.children", { control: "object" }, "container"),
    gap: documented("arg.gap", { control: { type: "number", min: 0, step: 0.05 } }, "line"),
    align: documented("arg.lineAlign", { control: "inline-radio", options: ["start", "center", "end"] }, "line"),
  },
};
export default meta;

/** The bench every line story seats: each entry a card of its own size. */
function seat(desk: ReturnType<typeof node>, children: SizedEntry[]): void {
  children.forEach((c, i) => add(desk, node(c.id.trim() || `card${i}`, Bounded({ bounds: rect(c.w, c.h) }), Surfaced())));
}

export const Row: StoryObj<LineArgs> = {
  // The stock walk with its cross-axis opened up: `align` presses tops or bottoms level while
  // the walk itself spends nothing — widths and seams hold still through all three answers.
  render: (a) => {
    registerLayout("story.bench", rowLayout({ gap: a.gap, align: a.align }));
    const desk = node("desk", Container({ layout: "story.bench" }));
    seat(desk, a.children);
    return scene(desk).el;
  },
  parameters: { gkDocStory: "presetsLayouts.row", controls: { include: ["children", "gap", "align"] } },
};

export const Column: StoryObj<LineArgs> = {
  // The same walk down the other axis — an axis is a PARAMETER of the record, not a second
  // preset. `start` now means left edges, because "the edge that lines up" turned with the line.
  render: (a) => {
    registerLayout("story.spine", rowLayout({ direction: "column", gap: a.gap, align: a.align }));
    const desk = node("desk", Container({ layout: "story.spine" }));
    seat(desk, a.children);
    return scene(desk).el;
  },
  parameters: { gkDocStory: "presetsLayouts.column", controls: { include: ["children", "gap", "align"] } },
};

interface GridArgs {
  children: SizedEntry[];
  columns: number;
  gap: number;
  justifyItems: LayoutAlign;
  alignItems: LayoutAlign;
}

export const Grid: StoryObj<GridArgs> = {
  // Tracks fit their largest member, and a cell is an ADDRESS: five cards on three columns
  // leave the last row partial rather than recentred. `justifyItems`/`alignItems` move a card
  // within its cell only — watch the small one travel while every track holds still.
  render: (a) => {
    registerLayout("story.court", gridLayout({ columns: a.columns, gap: a.gap, justifyItems: a.justifyItems, alignItems: a.alignItems }));
    const desk = node("desk", Container({ layout: "story.court" }));
    seat(desk, a.children);
    return scene(desk).el;
  },
  args: {
    children: [...BENCH, { id: "card3", w: 0.7, h: 1.1 }, { id: "card4", w: 1, h: 0.7 }],
    columns: 3,
    gap: 0.2,
    justifyItems: "center",
    alignItems: "center",
  },
  argTypes: {
    columns: documented("arg.columns", { control: { type: "number", min: 1, step: 1 } }, "grid"),
    gap: documented("arg.gap", { control: { type: "number", min: 0, step: 0.05 } }, "grid"),
    justifyItems: documented("arg.justifyItems", { control: "inline-radio", options: ["start", "center", "end"] }, "grid"),
    alignItems: documented("arg.alignItems", { control: "inline-radio", options: ["start", "center", "end"] }, "grid"),
  },
  parameters: {
    gkDocStory: "presetsLayouts.grid",
    controls: { include: ["children", "columns", "gap", "justifyItems", "alignItems"] },
  },
};

interface SlotsArgs {
  children: SizedEntry[];
  slots: Point[];
}

export const Slots: StoryObj<SlotsArgs> = {
  // Prepared places, taken in tree order — a board drawn before anyone sits down. The bench
  // holds one card MORE than there are seats on purpose: the guest beyond the slots keeps its
  // own pose, off to the side, and the seated three do not shuffle to absorb it.
  render: (a) => {
    registerLayout("story.seats", slotsLayout({ slots: a.slots }));
    const desk = node("desk", Container({ layout: "story.seats" }));
    a.children.forEach((c, i) =>
      add(desk, node(c.id.trim() || `card${i}`, Bounded({ bounds: rect(c.w, c.h) }), Surfaced(), Transformable({ at: { x: 2.4, y: 1.6 } }))),
    );
    return scene(desk).el;
  },
  args: {
    children: [...BENCH, { id: "guest", w: 0.8, h: 1.1 }],
    slots: [
      { x: -1.6, y: 0 },
      { x: 0, y: -1 },
      { x: 1.6, y: 0 },
    ],
  },
  argTypes: { slots: documented("arg.slots", { control: "object" }, "slots") },
  parameters: { gkDocStory: "presetsLayouts.slots", controls: { include: ["children", "slots"] } },
};

interface RadialArgs {
  count: number;
  radius: number;
  startAngle: number;
  sweep: number;
}

export const Radial: StoryObj<RadialArgs> = {
  // Seats on a circle: degrees run clockwise from twelve o'clock, the same sense `angle`
  // turns. The full 360 shares evenly with no doubled seat at the seam; pull `sweep` under it
  // and the walk becomes an arc taken end to end — the fan's fencepost, not the circle's.
  render: (a) => {
    registerLayout("story.table", radialLayout({ radius: a.radius, start: a.startAngle, sweep: a.sweep }));
    const desk = node("desk", Container({ layout: "story.table" }));
    for (let i = 0; i < a.count; i += 1) add(desk, node(`card${i}`, Bounded({ bounds: rect(0.8, 1.1) }), Surfaced()));
    return scene(desk).el;
  },
  args: { count: 6, radius: 2, startAngle: 0, sweep: 360 },
  argTypes: {
    count: documented("arg.count", { control: { type: "range", min: 0, max: 12, step: 1 } }, "table"),
    radius: documented("arg.ringRadius", { control: { type: "number", min: 0.1, step: 0.1 } }, "radial"),
    startAngle: documented("arg.startAngle", { control: { type: "number", step: 15 } }, "radial"),
    sweep: documented("arg.sweep", { control: { type: "number", min: 0, max: 360, step: 15 } }, "radial"),
  },
  parameters: { gkDocStory: "presetsLayouts.radial", controls: { include: ["count", "radius", "startAngle", "sweep"] } },
};
