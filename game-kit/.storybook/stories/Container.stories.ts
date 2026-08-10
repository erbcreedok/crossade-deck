import type { Meta, StoryObj } from "@storybook/html";
import { add, Bounded, Container, freeLayout, node, registerLayout, registerSurface, rowLayout, Surfaced, Transformable } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// The atom has ONE field — `layout`, a name pointing at a REGISTERED RECORD — and that is why
// this section is five scenes rather than five dropdowns: what is worth learning is what the
// record on the other end of the name does. `Free` and `Row` are the two stock records side by
// side over the SAME tree; `Gap` and `Spread` open a record up and show that spacing and padding
// are ITS parameters, not fields of the node; `Reserve` is the one promise a record must keep to
// every child — room for what will actually be seen.

/** One real child, an entry per node — carrying the pose it BRINGS, for records that keep it. */
interface ChildEntry {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

interface DeskArgs {
  children: ChildEntry[];
}

/** The same three cards, the same three poses, in every scene that takes the list. */
const DESK: ChildEntry[] = [
  { id: "card0", x: -0.9, y: -0.6 },
  { id: "card1", x: 0, y: 0.5 },
  { id: "card2", x: 1.1, y: -0.3 },
];

const meta: Meta<DeskArgs> = {
  title: "Atoms/Container",
  parameters: {
    gkDoc: "container.component",
    gkAtom: "Container",
    // A field may be served by SCENES instead of a control, and this one is: the two pictures
    // side by side ARE the lesson, and one dropdown switching between them would hide it. The
    // guard accepts either, so long as the field is reachable from the catalog at all.
    gkFields: { layout: ["Free", "Row"] },
  },
  argTypes: { children: documented("arg.children", { control: "object" }, "container") },
  args: { children: DESK },
};
export default meta;

export const Free: StoryObj<DeskArgs> = {
  // The record that places NOBODY: every pose in the list stands. Compare with `Row` — the tree
  // there is the same down to the poses, and only the layout's name differs.
  render: ({ children }) => {
    const desk = node("desk", Container({ layout: "free" }));
    children.forEach((c, i) => add(desk, node(c.id.trim() || `card${i}`, Bounded(), Surfaced(), Transformable({ at: { x: c.x, y: c.y } }))));
    return scene(desk).el;
  },
  parameters: { gkDocStory: "container.free", controls: { include: ["children"] } },
};

export const Row: StoryObj<DeskArgs> = {
  // The same list, and not one of its poses survives: a record that places, places. Each child
  // takes the width its own footprint asks for — the row is not a grid of equal cells.
  render: ({ children }) => {
    const desk = node("desk", Container({ layout: "row" }));
    children.forEach((c, i) => add(desk, node(c.id.trim() || `card${i}`, Bounded(), Surfaced(), Transformable({ at: { x: c.x, y: c.y } }))));
    return scene(desk).el;
  },
  parameters: { gkDocStory: "container.row", controls: { include: ["children"] } },
};

interface GapArgs extends DeskArgs {
  gap: number;
}

export const Gap: StoryObj<GapArgs> = {
  // Spacing belongs to the RECORD: the reader registers a row of their own and the container
  // only names it. There is no `gap` on the node to reach for — a field four arrangements out
  // of five cannot use is a field that gets misread.
  render: (a) => {
    registerLayout("story.aisle", rowLayout({ gap: a.gap }));
    const desk = node("desk", Container({ layout: "story.aisle" }));
    a.children.forEach((c, i) => add(desk, node(c.id.trim() || `card${i}`, Bounded(), Surfaced())));
    return scene(desk).el;
  },
  args: { gap: 0.3 },
  argTypes: { gap: documented("arg.gap", { control: { type: "number", min: 0, step: 0.02 } }, "row") },
  parameters: { gkDocStory: "container.gap", controls: { include: ["children", "gap"] } },
};

interface SpreadArgs extends DeskArgs {
  padding: number;
}

export const Spread: StoryObj<SpreadArgs> = {
  // The other source of area: a desk with NO box of its own paints the tight wrap of what it
  // holds. Drag a card outward and the surface follows; `padding` widens that wrap — and it is
  // a parameter of the record too, even of a free one that never places anybody.
  render: (a) => {
    registerSurface("story.meadow", { layers: [{ paint: "panelBg" }] });
    registerLayout("story.meadow", { ...freeLayout, padding: a.padding });
    const desk = node("desk", Container({ layout: "story.meadow" }), Surfaced({ surface: "story.meadow" }));
    a.children.forEach((c, i) => add(desk, node(c.id.trim() || `card${i}`, Bounded(), Surfaced(), Transformable({ at: { x: c.x, y: c.y } }))));
    return scene(desk).el;
  },
  args: { padding: 0.25 },
  argTypes: { padding: documented("arg.padding", { control: { type: "number", min: 0, step: 0.02 } }, "free") },
  parameters: { gkDocStory: "container.spread", controls: { include: ["children", "padding"] } },
};

interface ReserveArgs {
  scale: number;
}

export const Reserve: StoryObj<ReserveArgs> = {
  // The promise every placing record keeps: room is reserved for what will be SEEN. The first
  // card's scale is the only control — grow it and the neighbours step aside, because the row
  // measures the scaled footprint, not the declared box.
  render: (a) => {
    const desk = node("desk", Container({ layout: "row" }));
    add(desk, node("card0", Bounded(), Surfaced(), Transformable({ scale: a.scale })));
    add(desk, node("card1", Bounded(), Surfaced()));
    add(desk, node("card2", Bounded(), Surfaced()));
    return scene(desk).el;
  },
  args: { scale: 2 },
  argTypes: { scale: documented("arg.scale", { control: { type: "number", min: 0, step: 0.1 } }, "card0 transformable") },
  parameters: { gkDocStory: "container.reserve", controls: { include: ["scale"] } },
};
