// PRESSING A TILE — the pointer wiring, which the kit deliberately does not own.
//
// The kit hands over three functions (`glassOf`, `toUnits`, `pick`) and expects the consumer to
// write the twenty lines around them, because what a gesture MEANS is the game's business. The
// solitaire next door uses the same three to tell a tap from a drag; the hub needs only half of
// that, since nothing here is ever dragged: the slop is a threshold for REFUSING a press, not for
// switching into another mode.
//
// The press itself is client1's `:active` rule, expressed in the model: the tile moves three pixels
// down and right, and its shadow halves. The shadow is not drawn by hand — `z` goes down, and the
// plan's own arithmetic (`base + perZ * z`) shortens the fall. That is the whole reason a press
// writes `z` at all.

import {
  byId,
  caps,
  compose,
  fieldsOf,
  glassOf,
  pick,
  Transformable,
  type Host,
  type TransformableFields,
  type Node,
  type ValuedFields,
} from "game-kit";
import { PRESS_PX } from "../look/palette.js";

/** A finger that slid this far was going somewhere else. The same number the solitaire uses. */
const SLOP = 5;
/** How much the press pushes the tile toward the desk. Its shadow shortens by `perZ` times this. */
const PRESS_Z = -0.8;

/** What a pressed node meant, read off `Valued` — never parsed out of an id, which is opaque. */
export type Meaning = Readonly<Record<string, unknown>>;

export interface PressWiring {
  readonly host: Host;
  /** Called once, on a completed press: down and up on the same node, without wandering off. */
  readonly onPress: (meaning: Meaning, node: Node) => void;
}

/** Anything carrying `Valued` is pressable here — a capability, never a name or a type. */
const pressable = (n: Node): boolean => caps(n).has("Valued");

export function wirePress(w: PressWiring): () => void {
  const view = w.host.view;
  view.style.touchAction = "none";

  let held: { id: string; pointerId: number; startG: { x: number; y: number }; rest: { x: number; y: number } } | undefined;

  /**
   * Push a node in, or let it back out. The nudge is RELATIVE to the node's own resting pose, which
   * has to be remembered: writing `{0, 0}` back on release would not restore a node, it would MOVE
   * one — and a control that carries its own place (the bar's, for instance) would jump to the
   * middle of the desk the moment a finger lifted, out from under the very press that lifted it.
   */
  const show = (id: string, rest: { x: number; y: number }, down: boolean): void => {
    const n = byId(w.host.root, id);
    if (!n) return;
    const nudge = down ? PRESS_PX / w.host.unit() : 0;
    compose(n, Transformable({ at: { x: rest.x + nudge, y: rest.y + nudge }, z: down ? PRESS_Z : 0 }));
    w.host.setRoot(w.host.root);
  };

  const restOf = (n: Node): { x: number; y: number } => {
    const at = fieldsOf<TransformableFields>(n, "Transformable")?.at;
    return { x: at?.x ?? 0, y: at?.y ?? 0 };
  };

  const letGo = (): string | undefined => {
    const was = held;
    held = undefined;
    if (was) show(was.id, was.rest, false);
    return was?.id;
  };

  const onDown = (e: PointerEvent): void => {
    const g = glassOf(view, e);
    // `pick` tests the REAL drawn contour off the same plan the painter drew, so what the finger
    // hits is exactly what the eye sees — the gold ring's outline, not a bounding box around it.
    const hit = pick(w.host, w.host.root, g, pressable);
    if (!hit) return;
    held = { id: hit.id, pointerId: e.pointerId, startG: g, rest: restOf(hit) };
    show(hit.id, held.rest, true);
    // Capture keeps the gesture even if the finger leaves the canvas. It is allowed to fail — a
    // pointer the browser no longer considers active throws — and a press must survive that: the
    // gesture still works, it just stops tracking outside the glass.
    try {
      view.setPointerCapture(e.pointerId);
    } catch {
      /* not an active pointer; the press carries on without capture */
    }
  };

  const onMove = (e: PointerEvent): void => {
    if (!held) return;
    const g = glassOf(view, e);
    // Slid off: the press is abandoned, and the tile comes back out. A press that fired anyway
    // would mean a finger could never be taken back once it had landed.
    if (Math.hypot(g.x - held.startG.x, g.y - held.startG.y) > SLOP) letGo();
  };

  const onUp = (e: PointerEvent): void => {
    const id = letGo();
    try {
      view.releasePointerCapture(e.pointerId);
    } catch {
      /* never captured, or already released */
    }
    if (!id) return;
    // The release must land on the SAME node: a finger that travelled to a neighbour pressed
    // neither of them.
    const hit = pick(w.host, w.host.root, glassOf(view, e), pressable);
    if (!hit || hit.id !== id) return;
    const meaning = fieldsOf<ValuedFields>(hit, "Valued")?.values;
    if (meaning) w.onPress(meaning, hit);
  };

  const onCancel = (): void => {
    letGo();
  };

  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onCancel);

  return () => {
    letGo();
    view.removeEventListener("pointerdown", onDown);
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("pointerup", onUp);
    view.removeEventListener("pointercancel", onCancel);
  };
}
