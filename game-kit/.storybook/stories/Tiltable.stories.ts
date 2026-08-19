import type { Meta, StoryObj } from "@storybook/html";
import { Bounded, node, rect, registerSurface, Surfaced, Tiltable, tiltAngle, Transformable } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// TILTABLE draws nothing on its own — it ANSWERS one angle, the stop the card rests on, and that
// answer is data. So the scene wires the answer to the glass: the card holds `Tiltable` and the
// runtime index, and what the renderer is actually told is `tiltAngle(card, index)`, written into
// `Transformable.angle`. Drag `index` and the card turns, because the resolver picked the next
// stop — the whole atom, seen through a renderer that knows nothing about tapping.
//
// Two fields, `stops` and `wrap`: the discrete angles the tap steps through, and whether stepping
// past the last returns to the first. Which stop it is ON is not stored here — that is runtime
// state, passed in, exactly as `faceUp` is for `Flippable`.

const meta: Meta = {
  title: "Atoms/Tiltable",
  parameters: {
    gkDoc: "tiltable.component",
    gkAtom: "Tiltable",
    // The atom's two fields, and the controls that reach each: the stops are a list of degrees,
    // and `wrap` is the one switch that decides what the tap does at the end of that list.
    gkFields: { stops: ["stops"], wrap: ["wrap"] },
  },
};
export default meta;

const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };

interface TapArgs {
  id: string;
  cardW: number;
  cardH: number;
  cardSurface: string;
  cardPaint: string;
  cardRadius: number;
  stops: string;
  wrap: boolean;
  index: number;
}

/** The text control's `"0, 90, 180"` as the number list the atom holds; empty falls to the default. */
function parseStops(text: string): number[] {
  const nums = text
    .split(/[,\s]+/)
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n));
  return nums.length > 0 ? nums : [0, 90];
}

export const Tap: StoryObj<TapArgs> = {
  // ONE CARD and a dial that taps it. `stops` are the angles it may rest at, `index` is the runtime
  // stop it rests on now. Everything the renderer is told is `tiltAngle`'s answer, written into a
  // pose — there is no second code path anywhere that says «the card is tapped».
  render: ({ id, cardW, cardH, cardSurface, cardPaint, cardRadius, stops, wrap, index }) => {
    registerSurface(cardSurface, { layers: [{ paint: cardPaint }], radius: cardRadius });
    const card = node(
      id.trim() || "card",
      Bounded({ bounds: rect(cardW, cardH) }),
      Surfaced({ surface: cardSurface }),
      Transformable({}),
      Tiltable({ stops: parseStops(stops), wrap }),
    );
    // The resolver's answer is the ONLY thing the display node carries — the same shape and record,
    // posed at the stop the tap landed on. An out-of-range index clamps into the list, so the card
    // never points nowhere.
    return scene(
      node(
        id.trim() || "card",
        Bounded({ bounds: rect(cardW, cardH) }),
        Surfaced({ surface: cardSurface }),
        Transformable({ angle: tiltAngle(card, index) ?? 0 }),
      ),
    ).el;
  },
  // Colours are TOKEN names, never literals — a token follows the theme and crosses the wire; a
  // pasted hex does neither, and `guard.no-raw-colour` keeps every one of them out of this file.
  args: {
    id: "card",
    cardW: 1,
    cardH: 1.4,
    cardSurface: "story.tilt.face",
    cardPaint: "accent",
    cardRadius: 0.08,
    stops: "0, 90",
    wrap: true,
    index: 0,
  },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "card/node"),
    cardW: documented("arg.w", SIZE, "card/bounds"),
    cardH: documented("arg.h", SIZE, "card/bounds"),
    cardSurface: documented("arg.registerAs", { control: "text" }, "card/surface"),
    cardPaint: documented("arg.fill", { control: "select", options: PAINTS }, "card/surface"),
    cardRadius: documented("arg.radius", RADIUS, "card/surface"),
    stops: documented("arg.stops", { control: "text" }, "card/tiltable"),
    wrap: documented("arg.wrap", { control: "boolean" }, "card/tiltable"),
    // Runtime, not a field: the stop the card rests on now, dragged like a tap. It clamps into the
    // stop list, so it can be pulled past the end and the card simply holds on the last one.
    index: documented("arg.index", { control: { type: "range", min: 0, max: 5, step: 1 } }, "card/tap"),
  },
  parameters: { gkDocStory: "tiltable.tap" },
};
