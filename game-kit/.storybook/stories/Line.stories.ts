import type { Meta, StoryObj } from "@storybook/html";
import { arrow, headNames, installStockHeads, registerSurface } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import {
  RECORD_ARGS,
  documented,
  endRecordOf,
  recordArgTypes,
  recordArgsAt,
  recordOf,
  startRecordOf,
  type RecordArgs,
} from "./surfaceControls.js";

// THE FIRST PRESET THAT IS AN ASSEMBLY, and the reason it is not on an atom's shelf.
//
// `Atoms/Surfaced` shows one node at a time, because that is what an atom is. `arrow()` comes back
// as THREE: the run, and a node for each end that has something standing on it. Nothing new was
// needed to make that possible — no atom, no field, no sort. It is `Bounded + Surfaced` three times
// over, and this page exists to show the nesting rather than hide it behind one picture.
//
// So the panel holds three whole records, one per node. A hairline run under a solid point is two
// of them disagreeing on purpose; a head with a picture on it is a third. Sewn into the line's own
// contour, a head would have been stuck with the line's paint and with being a path at all.
//
// What is NOT here, deliberately: anything that walks the path over time. Footprints laid along a
// route, a run that draws itself on arrival, a silhouette traced round a contour — those are a
// mechanic of their own, and keeping them out is what leaves this one simple enough to build them
// from.

const meta: Meta = {
  title: "Presets/Line",
  parameters: { gkDoc: "line.component" },
};
export default meta;

interface ArrowArgs extends RecordArgs {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  bend: number;
  startHead: string;
  startSize: number;
  endHead: string;
  endSize: number;
}

const place = (key: string, part: string): Record<string, unknown> =>
  documented(key, { control: { type: "number", step: 0.05 } }, `line/${part}`);

const headPicker = (key: string, group: string): Record<string, unknown> =>
  documented(key, { control: "select", options: ["", ...headNames()] }, `${group}/bounds`);

const headSize = (key: string, group: string): Record<string, unknown> =>
  documented(key, { control: { type: "number", min: 0, step: 0.02 } }, `${group}/bounds`);

/** A run's record: a stroke and NO fill, because a walk out and back has no inside to paint. */
const INK: Partial<RecordArgs> = {
  fill: "",
  radius: 0,
  strokeWidth: 0.04,
  alignment: 0.5,
  cap: "round",
  join: "round",
};

/** And a head's: solid, no stroke — a closed shape standing on a line that has no inside at all. */
const SOLID: Partial<RecordArgs> = { fill: "accent", radius: 0, stroke: false };

export const CurvedArrow: StoryObj<ArrowArgs> = {
  // THE WHOLE FAMILY IN ONE SCENE, opening on the case a reader came for: a dashed curve with a
  // hollow ring where it starts and a solid point where it lands.
  //
  // `through` names the places the run is dragged through. It is written out in the code rather
  // than put on a control, because what it is FOR is a curve that arrived from a drawing tool;
  // `bend` bows THAT path rather than replacing it. The heads are not a special case for a curve —
  // each reads the direction of the path where it stands.
  //
  // Clear a head and its node is not there at all: an end with nothing on it is the ordinary case,
  // not an empty box. The node tree below is the honest picture of what came back.
  render: (a) => {
    registerSurface("story.run", recordOf(a));
    registerSurface("story.run.start", startRecordOf(a));
    registerSurface("story.run.end", endRecordOf(a));
    installStockHeads();
    return scene(
      arrow({
        id: "swoosh",
        from: { x: a.fromX, y: a.fromY },
        to: { x: a.toX, y: a.toY },
        through: [
          { x: -0.4, y: 0.45 },
          { x: 0.45, y: 0.2 },
        ],
        bend: a.bend,
        surface: "story.run",
        startHead: a.startHead,
        startSize: a.startSize,
        startSurface: "story.run.start",
        endHead: a.endHead,
        endSize: a.endSize,
        endSurface: "story.run.end",
      }),
    ).el;
  },
  args: {
    fromX: -1.15,
    fromY: 0.1,
    toX: 1.2,
    toY: -0.5,
    bend: 0,
    startHead: "begin",
    startSize: 0.18,
    endHead: "pointer",
    endSize: 0.32,
    ...RECORD_ARGS,
    ...INK,
    dash: true,
    dashOn: 0.12,
    dashOff: 0.1,
    // The ring is hollow and the point is solid: two records, two nodes, one call.
    ...recordArgsAt("start", { fill: "", radius: 0, strokeWidth: 0.04, alignment: 0.5 }),
    ...recordArgsAt("end", SOLID),
  },
  argTypes: {
    fromX: place("arg.fromX", "from"),
    fromY: place("arg.fromY", "from"),
    toX: place("arg.toX", "to"),
    toY: place("arg.toY", "to"),
    bend: documented("arg.bend", { control: { type: "range", min: -1, max: 1, step: 0.05 } }, "line"),
    // The run's own record, and then a whole one for each end — the same twenty-one controls,
    // three times over, because there are three nodes and each wears one.
    ...recordArgTypes("path", "", "surface"),
    startHead: headPicker("arg.startHead", "start"),
    startSize: headSize("arg.startSize", "start"),
    ...recordArgTypes("start", "start", "surface"),
    endHead: headPicker("arg.endHead", "end"),
    endSize: headSize("arg.endSize", "end"),
    ...recordArgTypes("end", "end", "surface"),
  },
  parameters: { gkDocStory: "line.curvedArrow" },
};
