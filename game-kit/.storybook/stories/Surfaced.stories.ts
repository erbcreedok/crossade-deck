import type { Meta, StoryObj } from "@storybook/html";
import { add, Bounded, Container, node, Surfaced, surfaceNames } from "../../src/index.js";
import { scene } from "../devtools/scene.js";

interface SurfacedArgs {
  surface: string;
  w: number;
  h: number;
}

interface TableArgs {
  surface: string;
  children: number;
}

const meta: Meta = {
  title: "Start/Atoms/Surfaced",
  parameters: { gkDoc: "surfaced.component" },
  argTypes: {
    // The choices come from the REGISTRY, so a record added to the kit shows up here without
    // anybody remembering to extend a list.
    surface: { control: "select", options: surfaceNames() },
  },
};
export default meta;

export const Plate: StoryObj<SurfacedArgs> = {
  // The same square as `Bounded/Box`, one atom later — and now it can be seen.
  render: ({ surface, w, h }) =>
    scene(node("card", Bounded({ size: { kind: "rect", w, h } }), Surfaced({ surface }))).el,
  args: { surface: "plate", w: 1, h: 1 },
  argTypes: {
    // Typed, not dragged: a size is a value the reader states, not one they sweep towards.
    w: { control: { type: "number", min: 0.1, step: 0.1 } },
    h: { control: { type: "number", min: 0.1, step: 0.1 } },
  },
  parameters: { gkDocStory: "surfaced.plate" },
};

export const Table: StoryObj<TableArgs> = {
  // A surface with no box of its own: the area comes from what the node HOLDS. Take the
  // children away and there is nothing left to paint on.
  render: ({ surface, children }) => {
    const table = node("table", Container({ layout: "row" }), Surfaced({ surface }));
    for (let i = 0; i < children; i += 1) add(table, node(`card${i}`, Bounded(), Surfaced()));
    return scene(table).el;
  },
  args: { surface: "bare", children: 2 },
  argTypes: { children: { control: { type: "range", min: 0, max: 6, step: 1 } } },
  parameters: { gkDocStory: "surfaced.table" },
};
