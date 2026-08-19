import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  Draggable,
  draggable,
  FLING,
  FREE_INPUT,
  freeLayout,
  installStockCarries,
  node,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
  ZOOM_SENS,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// THE CAMERA IS NOT AN ELEMENT — it takes up no room and accepts nothing. It is the way the desk is
// LOOKED AT, and this is the first page where a scene is bigger than the glass and has to be.
//
// The desk here reaches from -1000 to 1000 on both axes: a zone, not a table. Nothing on the page
// fits, and that is the lesson — the reader arrives somewhere in the middle of it and gets around by
// hand. Drag to pan, throw and let go, pinch or ctrl+wheel to zoom, wheel to scroll. The one card
// is the arbitration: a gesture over an ELEMENT drives the element, over empty desk it drives the
// camera, and the two never argue about a finger. Two fingers also TURN it, once they have meant
// it — and every one of the three gestures can be closed from the panel while the desk stands,
// which is what a game's own rule does when it pins the view for one move.
//
// ONE UNIT IS ONE PIXEL AT ZOOM 1 on this desk, and that is a decision the story makes rather than
// something the kit imposes: there is no universal measure for a desk (`docs/design/camera.md`).
// Sizes are written as ordinary numbers in world coordinates and the SCREEN is caught up with by
// the camera — a second scale on top of her would be two rulers for one job, and they would drift.
//
// The carry styles are installed here, as an ordinary consumer would install them.
installStockCarries();

const meta: Meta = {
  title: "Canvas/Camera",
  parameters: { gkDoc: "canvasCamera.component" },
};
export default meta;

interface ZoneArgs {
  w: number;
  h: number;
  pan: boolean;
  zoom: boolean;
  rotate: boolean;
  turn: number;
  minZoom: number;
  maxZoom: number;
  sensitivity: number;
  fling: boolean;
  cap: number;
  floor: number;
  decay: number;
  smoothing: number;
}

/**
 * Where the landmarks stand, in units — seven each way, a quarter of the zone apart.
 *
 * Close enough that a phone holds five or six of them at zoom 1, which is what makes motion
 * legible: a camera with nothing to measure itself against reads as a canvas that did not load.
 * They stop well short of the edge on purpose, so the bare strip before the border says "this is
 * where the desk ends" before the clamp does.
 */
const MARKS = [-750, -500, -250, 0, 250, 500, 750];
/** A landmark's box, and the card's — both in units, and a unit here is a pixel at zoom 1. */
const PLATE = 170;
const CARD = { w: 130, h: 182 };

const limit = (key: "arg.minZoom" | "arg.maxZoom"): Record<string, unknown> =>
  documented(key, { control: { type: "number", min: 0.01, step: 0.05 } }, "camera/limits");
/** A fling field, and it disappears with the switch it hangs off: no inertia, nothing to tune. */
const flung = (key: string, spec: Record<string, unknown>): Record<string, unknown> =>
  documented(key, { ...spec, if: { arg: "fling" } }, "camera/fling");

export const Zone: StoryObj<ZoneArgs> = {
  // A ZONE OF TWO THOUSAND UNITS, opened in the middle of it at zoom 1 — so a phone shows about a
  // fifth of the desk and the first thing that works is the hand. The chequer is there to be moved
  // past: motion on a plain surface is invisible, and a camera with nothing to measure against
  // reads as a canvas that did not load.
  render: ({ w, h, pan, zoom, rotate, turn, minZoom, maxZoom, sensitivity, fling, cap, floor, decay, smoothing }) => {
    registerLayout("story.camera.free", freeLayout);
    registerSurface("story.camera.zone", {
      layers: [{ paint: "sunkBg" }],
      radius: 24,
      // The desk's own edge, so the bound the camera stops at is a thing the eye can see it reach.
      stroke: { color: "accent", width: 6, opacity: 0.5 },
    });
    registerSurface("story.camera.plate", { layers: [{ paint: "panelBg" }], radius: 16 });
    registerSurface("story.camera.axis", { layers: [{ paint: "textMuted", opacity: 0.5 }], radius: 16 });
    registerSurface("story.camera.card", { layers: [{ paint: "accent" }], radius: 12 });

    const desk = node(
      "zone",
      Bounded({ bounds: rect(w, h) }),
      Container({ layout: "story.camera.free" }),
      Surfaced({ surface: "story.camera.zone" }),
    );
    for (const y of MARKS) {
      for (const x of MARKS) {
        if (x === 0 && y === 0) continue; // the middle belongs to the card
        add(
          desk,
          node(
            `mark ${x} ${y}`,
            Bounded({ bounds: rect(PLATE, PLATE) }),
            // The row and the column through zero wear their own coat, so "where am I" has an
            // answer at any zoom without a single word of text.
            Surfaced({ surface: x === 0 || y === 0 ? "story.camera.axis" : "story.camera.plate" }),
            Transformable({ at: { x, y } }),
          ),
        );
      }
    }
    add(
      desk,
      node(
        "card",
        Bounded({ bounds: rect(CARD.w, CARD.h) }),
        Surfaced({ surface: "story.camera.card" }),
        Transformable({ at: { x: 0, y: 0 }, z: 1 }),
        // Dropped anywhere and it stays there: on a desk this size, flying home would be a card
        // vanishing off the screen the reader is looking at.
        Draggable({ onReject: "stay" }),
      ),
    );

    const built = scene(desk, {
      animate: true,
      camera: {
        limits: {
          minZoom,
          maxZoom,
          fling: fling ? { cap, floor, decay, smoothing, maxGap: FLING.maxGap } : { ...FLING, cap: 0, floor: Infinity },
          // THE THREE GATES, live: a re-render retunes the STANDING camera, so closing one here is
          // the same call a game's own rule would make in the middle of a turn.
          input: { pan, zoom, rotate },
        },
        // Applied only when this number changes, so the slider and the fingers do not fight over
        // the angle — twist the desk by hand and the panel leaves it alone until it is moved.
        turn,
        // The desk is laid out AROUND zero, so its corner is at minus half — the camera is told the
        // rect and not the size, or three quarters of the zone would be unreachable.
        content: { x: -w / 2, y: -h / 2, w, h },
        // One unit, one pixel at zoom 1. See the note at the top of the file.
        unit: 1,
        sensitivity,
        // THE ARBITRATION, as one predicate: whatever can be picked up takes its own finger.
        claims: draggable,
        // Opened in the middle at zoom 1 — a phone then holds about a fifth of the desk, so there
        // is somewhere to go in every direction from the first touch. Opening at the fit would
        // show the whole zone and leave the first gesture doing nothing at all: a desk smaller
        // than the glass is centred rather than scrolled.
        start: { at: { x: 0, y: 0 }, zoom: 1 },
      },
    });
    return wireDrag(built, { view: () => built.camera!.transform() }).el;
  },
  args: {
    w: 2000,
    h: 2000,
    pan: FREE_INPUT.pan,
    zoom: FREE_INPUT.zoom,
    rotate: FREE_INPUT.rotate,
    turn: 0,
    minZoom: 0.2,
    maxZoom: 3,
    sensitivity: ZOOM_SENS,
    fling: true,
    cap: FLING.cap,
    floor: FLING.floor,
    decay: FLING.decay,
    smoothing: FLING.smoothing,
  },
  argTypes: {
    w: documented("arg.w", { control: { type: "number", min: 100, step: 100 } }, "desk"),
    h: documented("arg.h", { control: { type: "number", min: 100, step: 100 } }, "desk"),
    pan: documented("arg.inputPan", {}, "camera/input"),
    zoom: documented("arg.inputZoom", {}, "camera/input"),
    rotate: documented("arg.inputRotate", {}, "camera/input"),
    turn: documented("arg.cameraTurn", { control: { type: "range", min: -180, max: 180, step: 5 } }, "camera"),
    minZoom: limit("arg.minZoom"),
    maxZoom: limit("arg.maxZoom"),
    sensitivity: documented(
      "arg.zoomSensitivity",
      { control: { type: "number", min: 0.0002, max: 0.01, step: 0.0002 } },
      "camera/wheel",
    ),
    fling: documented("arg.fling", {}, "camera/fling"),
    cap: flung("arg.flingCap", { control: { type: "number", min: 0, step: 200 } }),
    floor: flung("arg.flingFloor", { control: { type: "number", min: 0, step: 5 } }),
    decay: flung("arg.flingDecay", { control: { type: "number", min: 0.5, step: 0.5 } }),
    smoothing: flung("arg.flingSmoothing", { control: { type: "range", min: 0.05, max: 1, step: 0.05 } }),
  },
  parameters: { gkDocStory: "canvasCamera.zone" },
};
