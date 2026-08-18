// THE LAW THIS FILE EXISTS FOR: a press must leave the control exactly where it found it.
//
// The seat is captured when the finger lands and never read back off the node — because by then the
// node is already nudged, and reading it back makes the nudge part of its "rest". Every further
// press then walks the control further down the desk, and the picture drifts a few pixels at a time
// until the finger and the contour no longer agree. That is what this suite watched happen once.

import { beforeEach, describe, expect, it } from "vitest";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { freeLayout, rowLayout } from "../core/atoms/layouts.js";
import { add, caps, fieldsOf, node, type Node } from "../core/node.js";
import { type TransformableFields } from "../core/atoms/transformable.js";
import { NO_COAT, type CoatedFields } from "../core/atoms/coated.js";
import { DEFAULT_VIEWER } from "../core/viewer.js";
import { rect } from "../presets/shapes.js";
import { button } from "../presets/button.js";
import { installStockSurfaces } from "../presets/surfaces.js";
import { installStockControls } from "../presets/controls.js";
import { resetSurfaces } from "./surfaces.js";
import { type Host } from "./host.js";
import { pick } from "./pointer.js";
import { wireButtons, type Meaning } from "./buttons.js";
import "../core/atoms/coated.js";

/** A view that only records its listeners — the wiring asks it for nothing else worth faking. */
function stubView(): { el: HTMLCanvasElement; fire: (type: string, x: number, y: number) => void } {
  const listeners = new Map<string, (e: PointerEvent) => void>();
  const el = {
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (t: string, f: (e: PointerEvent) => void) => void listeners.set(t, f),
    removeEventListener: (t: string) => void listeners.delete(t),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  } as unknown as HTMLCanvasElement;
  return {
    el,
    fire: (type, x, y) => listeners.get(type)?.({ clientX: x, clientY: y, pointerId: 1 } as unknown as PointerEvent),
  };
}

function fixture(): { host: Host; fire: (t: string, x: number, y: number) => void; root: Node; pressed: string[] } {
  const bar = node("bar", Container({ layout: "row" }));
  for (const id of ["a", "b", "c"]) add(bar, button(id, { bounds: rect(2, 0.7), means: { does: id } }));
  const view = stubView();
  const host = {
    view: view.el,
    root: bar,
    unit: () => 100,
    viewport: () => ({ width: 800, height: 600, dpr: 1 }),
    viewer: () => DEFAULT_VIEWER,
    setRoot: () => undefined,
  } as unknown as Host;
  const pressed: string[] = [];
  wireButtons({ host, onPress: (m: Meaning) => pressed.push(String(m["does"])) });
  return { host, fire: view.fire, root: bar, pressed };
}

beforeEach(() => {
  resetLayouts();
  registerLayout("free", freeLayout);
  registerLayout("row", rowLayout({ gap: 0.2, padding: 0 }));
  resetSurfaces();
  installStockSurfaces();
  installStockControls();
});

// Three 2-unit controls with 0.2 gaps on a 800×600 view at 100px/unit: centres land at x 180, 400, 620.
const CENTRES: readonly (readonly [number, string])[] = [
  [180, "a"],
  [400, "b"],
  [620, "c"],
];

describe("the button wiring", () => {
  it("buttons.a-press-reports-the-meaning-of-the-control-under-it", () => {
    const f = fixture();
    for (const [x, want] of CENTRES) {
      f.fire("pointerdown", x, 300);
      f.fire("pointerup", x, 300);
      expect(f.pressed[f.pressed.length - 1], `pressing at x=${x}`).toBe(want);
    }
  });

  it("buttons.a-press-puts-the-control-back-exactly — pressing does not walk it down the desk", () => {
    const f = fixture();
    const seat = (id: string) => fieldsOf<TransformableFields>(f.root.children.find((c) => c.id === id)!, "Transformable")?.at;
    for (let round = 0; round < 5; round++) {
      for (const [x] of CENTRES) {
        f.fire("pointermove", x, 300); // the hover that used to poison the seat
        f.fire("pointerdown", x, 300);
        f.fire("pointerup", x, 300);
      }
    }
    for (const [, id] of CENTRES) expect(seat(id), `${id} drifted`).toEqual({ x: 0, y: 0 });
    // And the picture agrees with the model: every control is still where the finger expects it.
    // The same predicate the wiring uses — a control is what carries `Pressable`, and the inner
    // face does not: picking with `() => true` would answer with the face and prove nothing.
    for (const [x, want] of CENTRES) expect(pick(f.host, f.root, { x, y: 300 }, (n) => caps(n).has("Pressable"))?.id).toBe(want);
  });

  it("buttons.the-hover-comes-off-again — a control does not stay lit for the session", () => {
    // THE BUG THIS RUNG WAS BORN FOR. Undressing used to read the coat standing on the node to
    // decide what to restore — and by then the coat standing there WAS the hover, so it put the
    // hover back on top of itself. Every control the pointer ever crossed stayed lit.
    const f = fixture();
    // `?? NO_COAT` because "no coat" is written two ways: no `Coated` atom at all before the first
    // gesture, and the empty coat after one. They mean the same thing and must compare the same.
    const coatOf = (id: string) => fieldsOf<CoatedFields>(f.root.children.find((c) => c.id === id)!, "Coated")?.cast ?? NO_COAT;
    const before = coatOf("a");

    f.fire("pointermove", 180, 300);
    expect(coatOf("a"), "the hover never went on").not.toEqual(before);

    f.fire("pointermove", 400, 300); // on to the neighbour
    expect(coatOf("a"), "the hover stayed on a control the pointer had left").toEqual(before);

    f.fire("pointerleave", 0, 0);
    expect(coatOf("b"), "the hover stayed on after the pointer left the glass").toEqual(before);
  });

  it("buttons.a-press-leaves-the-control-wearing-what-it-wore", () => {
    // The same law for the whole gesture: down, up and away must end where it started.
    const f = fixture();
    // `?? NO_COAT` because "no coat" is written two ways: no `Coated` atom at all before the first
    // gesture, and the empty coat after one. They mean the same thing and must compare the same.
    const coatOf = (id: string) => fieldsOf<CoatedFields>(f.root.children.find((c) => c.id === id)!, "Coated")?.cast ?? NO_COAT;
    const before = coatOf("a");
    f.fire("pointermove", 180, 300);
    f.fire("pointerdown", 180, 300);
    f.fire("pointerup", 180, 300);
    f.fire("pointerleave", 0, 0);
    expect(coatOf("a")).toEqual(before);
  });

  it("buttons.a-finger-that-slides-off-presses-nothing", () => {
    const f = fixture();
    f.fire("pointerdown", 180, 300);
    f.fire("pointermove", 260, 300); // well past the slop
    f.fire("pointerup", 260, 300);
    expect(f.pressed).toEqual([]);
  });

  it("buttons.a-release-on-a-neighbour-presses-neither", () => {
    const f = fixture();
    f.fire("pointerdown", 180, 300);
    f.fire("pointerup", 400, 300);
    expect(f.pressed).toEqual([]);
  });
});
