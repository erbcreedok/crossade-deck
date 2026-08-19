// PRESSING A CONTROL — the pointer wiring the kit DOES own, and the one exception worth naming.
//
// The kit hands a game three functions (`glassOf`, `toUnits`, `pick`) and refuses to write the
// twenty lines around them, because what a gesture MEANS is the game's business: a tap on a card is
// an auto-move in Klondike and a bid in another game. A BUTTON is the exception — "the finger came
// down on me and went up on me" means the same thing in every game there will ever be. So this is
// here, and every consumer that grew its own copy (the hub did, twice) can stop.
//
// It is deliberately NOT a gesture recogniser. There is no drag here, no double-tap, no long press:
// a control that wanted those would be a control whose meaning is the game's again. The slop below
// is a threshold for REFUSING a press, not for switching into another mode.

import { byId, caps, compose, fieldsOf, type Node } from "../core/node.js";
import { pressableOf, wearPress } from "../core/atoms/pressable.js";
import { Transformable, type TransformableFields } from "../core/atoms/transformable.js";
import { type ValuedFields } from "../core/atoms/valued.js";
import { type Transform } from "../core/transform.js";
import { type Host } from "./host.js";
import { glassOf, pick } from "./pointer.js";

/** A finger that slid this far was going somewhere else. In GLASS pixels — a slip is a hand, not a unit. */
const SLOP = 5;

/** What a pressed control meant, read off `Valued` — never parsed out of an id, which is opaque. */
export type Meaning = Readonly<Record<string, unknown>>;

export interface ButtonWiring {
  readonly host: Host;
  /** Called once, on a completed press: down and up on the same control, without wandering off. */
  readonly onPress: (meaning: Meaning, control: Node) => void;
  /**
   * The view the controls are drawn through, asked FRESH — a camera's `transform()`.
   *
   * A getter for the reason the painter's is one: the wiring is attached once and the view moves
   * between frames. Absent, the plain centred view, which is every scene with no camera in it.
   */
  readonly view?: (() => Transform) | undefined;
}

/** Anything carrying `Pressable` answers a finger. A capability, never a name or a sort. */
const answers = (n: Node): boolean => caps(n).has("Pressable");

/**
 * Wire every `Pressable` in the host's tree. Returns the teardown.
 *
 * Nothing is registered per control and nothing is walked at rest: the tree is asked WHO IS UNDER
 * THE POINTER at the moment there is one, through the same `pick` the painter's own contours feed.
 * So a control added, removed or renamed mid-game needs no re-wiring — which is the whole reason a
 * scene may rebuild its bar every frame.
 */
export function wireButtons(w: ButtonWiring): () => void {
  const view = w.host.view;
  view.style.touchAction = "none";

  let over: string | undefined; // the control the pointer is hovering, if any
  /** Puts back the coat that stood before the current gesture dressed the control. See `wearPress`. */
  let undress: (() => void) | undefined;
  let held: { id: string; startG: { x: number; y: number }; rest: { x: number; y: number } } | undefined;

  const restOf = (n: Node): { x: number; y: number } => {
    const at = fieldsOf<TransformableFields>(n, "Transformable")?.at;
    return { x: at?.x ?? 0, y: at?.y ?? 0 };
  };

  /**
   * Put a control into one of its states.
   *
   * ONLY THE HELD STATE TOUCHES THE POSE, and it writes the seat captured when the finger landed —
   * never a seat read back off the node. Reading it back is how a press DRIFTS: the node is already
   * nudged when the read happens, so the nudge becomes part of its "rest", and every further press
   * walks the control further down the desk. Hover and rest write no pose at all, which also leaves
   * a layout-placed control entirely alone between gestures.
   */
  const show = (id: string, state: "hover" | "held" | "rest", seat?: { x: number; y: number }): void => {
    const n = byId(w.host.root, id);
    if (!n) return;
    const press = pressableOf(n);
    if (state === "held" && seat) {
      const nudge = press?.nudge ?? { x: 0, y: 0 };
      // `z` carries the DEPTH and the plan shortens the cast shadow from it; `nudge` carries the
      // DISPLACEMENT. Two fields because they are two statements, and a look may want either alone.
      compose(n, Transformable({ at: { x: seat.x + nudge.x, y: seat.y + nudge.y }, z: press?.sink ?? 0 }));
    } else if (seat) {
      // Coming back up: the seat is the one remembered at the press, so what is restored is where
      // the control actually stood — not where it stands now, mid-nudge.
      compose(n, Transformable({ at: seat, z: 0 }));
    }
    // The PREVIOUS dressing comes off first, and it comes off through the closure that knows what
    // was underneath — never by writing a "rest" coat, which is how a hover ends up restoring
    // itself and lighting a control for the rest of the session.
    undress?.();
    undress = state === "rest" ? undefined : wearPress(n, state);
    w.host.setRoot(w.host.root);
  };

  const under = (e: PointerEvent): Node | undefined =>
    pick(w.host, w.host.root, glassOf(view, e), answers, w.view?.());

  const leaveHover = (): void => {
    if (over === undefined) return;
    show(over, "rest"); // no seat: a hover never moved it, so nothing has to be put back
    over = undefined;
  };

  const letGo = (): string | undefined => {
    const was = held;
    held = undefined;
    if (was) show(was.id, "rest", was.rest);
    return was?.id;
  };

  const onMove = (e: PointerEvent): void => {
    if (held) {
      // Slid off: the press is abandoned and the control comes back out. A press that fired anyway
      // would mean a finger could never be taken back once it had landed.
      const g = glassOf(view, e);
      if (Math.hypot(g.x - held.startG.x, g.y - held.startG.y) > SLOP) letGo();
      return;
    }
    const hit = under(e);
    if (hit?.id === over) return;
    leaveHover();
    if (hit) {
      over = hit.id;
      show(hit.id, "hover");
    }
  };

  const onDown = (e: PointerEvent): void => {
    const hit = under(e);
    if (!hit) return;
    leaveHover();
    held = { id: hit.id, startG: glassOf(view, e), rest: restOf(hit) };
    show(hit.id, "held", held.rest);
    // Capture keeps the gesture even if the finger leaves the canvas. It is allowed to fail — a
    // pointer the browser no longer considers active throws — and a press must survive that: the
    // gesture still works, it just stops tracking outside the glass.
    try {
      view.setPointerCapture(e.pointerId);
    } catch {
      /* not an active pointer; the press carries on without capture */
    }
  };

  const onUp = (e: PointerEvent): void => {
    const id = letGo();
    try {
      view.releasePointerCapture(e.pointerId);
    } catch {
      /* never captured, or already released */
    }
    if (id === undefined) return;
    // The release must land on the SAME control: a finger that travelled to its neighbour pressed
    // neither of them.
    const hit = under(e);
    if (!hit || hit.id !== id) return;
    // A mouse is still over it after the click — go straight back to hover, or the control would sit
    // flat under a pointer that never left it. A finger's `pointerup` is followed by no move at all,
    // so the hover it briefly wears is undressed by the next `pointerleave`.
    over = hit.id;
    show(hit.id, "hover");
    const meaning = fieldsOf<ValuedFields>(hit, "Valued")?.values;
    // A control with nothing to say is still a control: it lights, it sinks, and it reports nothing.
    if (meaning) w.onPress(meaning, hit);
  };

  const onLeave = (): void => {
    letGo();
    leaveHover();
  };

  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onLeave);
  view.addEventListener("pointerleave", onLeave);

  return () => {
    letGo();
    leaveHover();
    view.removeEventListener("pointerdown", onDown);
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("pointerup", onUp);
    view.removeEventListener("pointercancel", onLeave);
    view.removeEventListener("pointerleave", onLeave);
  };
}
