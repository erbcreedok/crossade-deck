// A BUTTON, as one literal of data assembled into an element — the same bargain `pile()` strikes.
//
// Every game grows controls: undo, restart, a hint, end turn, a settings gear. Every one of them is
// the SAME assembly — a box, a face by registry name, a caption already written, what a press MEANS,
// and what it wears while a pointer is over it. This preset is that assembly and nothing more. No
// behaviour lives here: the press wiring is `render/buttons.ts`, the look is a registered record,
// and the meaning is read by whoever handles it.
//
// TWO NODES WHEN — AND ONLY WHEN — THE LOOK ASKS FOR TWO.
//
// One quad carries one stroke. A plate with a coloured ring OUTSIDE a keyline is two strokes, so it
// is two nodes: an outer plate and an inner face inset by `inset`. Given no `face`, a button is one
// node, because a look that needs one stroke must not pay for a second node it never uses.
//
// THERE IS NO `variant`. A "primary" and a "danger" button are two registered SURFACES, and the
// switch between them is a name on a field — the kit reads no sorts (`guard.no-kind`). That is what
// makes a fifth look cost a registration instead of a branch in this file.

import { add, compose, node, type Node } from "../core/node.js";
import { Bounded, extentOf, type Shape } from "../core/atoms/bounded.js";
import { transformShape } from "../core/path.js";
import { type Coat } from "../core/atoms/coated.js";
import { Container } from "../core/atoms/container.js";
import { Labeled } from "../core/atoms/labeled.js";
import { Pressable } from "../core/atoms/pressable.js";
import { ShadowCaster } from "../core/atoms/shadow.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { Valued } from "../core/atoms/valued.js";
import { type Vec } from "../core/transform.js";
import { type Atom } from "../core/atom.js";

export interface ButtonSpec {
  /** The control's seat on its owner, in units. Absent, the layout (or nobody) places it. */
  readonly at?: Vec;
  /** The box. Required — a control with no footprint can be neither pressed nor seen. */
  readonly bounds: Shape;
  /** The face, by registry name. Absent, the button is invisible and still pressable — legal, and
   *  exactly what an invisible hit area is. */
  readonly surface?: string;
  /** The INNER face, by registry name. Given, the button is two nodes and this one is inset. */
  readonly face?: string;
  /** How far the inner face sits inside the outer plate, in units. The ring is what shows between. */
  readonly inset?: number;
  /** The caption, ALREADY WRITTEN in the reader's language — the kit knows no localization. */
  readonly label?: string;
  /** A registered text style's NAME, never a font. Absent, the default face and size. */
  readonly style?: string;
  /** What a press MEANS, as data a handler reads — never parsed out of the id. Absent, it says nothing. */
  readonly means?: Readonly<Record<string, unknown>>;
  /** What it wears under a pointer. Absent, the atom's own faint wash. */
  readonly hover?: Coat;
  /** What it wears while held. Absent, the atom's own. */
  readonly held?: Coat;
  /** How far it sinks while held, in units — the shadow shortens with it. Absent, the atom's own. */
  readonly sink?: number;
  /** How far it MOVES while held, in units. Absent, the atom's own down-and-right nudge. */
  readonly nudge?: Vec;
  /** The contour it lays as a shadow. Absent, it casts nothing. */
  readonly shadow?: "footprint" | "silhouette";
  /** The arrangement of whatever is put INSIDE it, by registry name. Absent, its children are unplaced. */
  readonly layout?: string;
}

/**
 * Assemble a button. Returns the OUTER node either way, so a caller adds one thing to its bar and
 * never has to know whether the look asked for a ring.
 *
 * The caption rides the node that shows the face — the inner one when there is one — so it sits
 * inside the ring rather than across it.
 */
export function button(id: string, spec: ButtonSpec): Node {
  const outer: Atom[] = [Bounded({ bounds: spec.bounds })];
  if (spec.at) outer.push(Transformable({ at: spec.at }));
  if (spec.surface) outer.push(Surfaced({ surface: spec.surface }));
  if (spec.shadow) outer.push(ShadowCaster({ from: spec.shadow }));
  // The press lands on the OUTER node — it is what the finger sees the edge of, and hit-testing the
  // inner face would leave a dead ring the width of the inset around every control.
  outer.push(pressAtoms(spec));
  if (spec.means) outer.push(Valued({ values: spec.means }));
  const plate = node(id, ...outer);

  // The caption and the arrangement ride whichever node SHOWS the face, so a caption sits inside
  // the ring rather than across it.
  const shows = spec.face ? node(`${id}/face`, Bounded({ bounds: insetOf(spec.bounds, spec.inset ?? 0) }), Surfaced({ surface: spec.face })) : plate;
  if (spec.layout) compose(shows, Container({ layout: spec.layout }));
  if (spec.label !== undefined) {
    compose(shows, Labeled(spec.style === undefined ? { label: spec.label } : { label: spec.label, style: spec.style }));
  }
  if (shows !== plate) add(plate, shows);
  return plate;
}

/** The one place the press look is assembled, so the defaults live in the atom and not in two files. */
function pressAtoms(spec: ButtonSpec): Atom {
  const fields: Record<string, unknown> = {};
  if (spec.hover) fields["hover"] = spec.hover;
  if (spec.held) fields["held"] = spec.held;
  if (spec.sink !== undefined) fields["sink"] = spec.sink;
  if (spec.nudge) fields["nudge"] = spec.nudge;
  return Pressable(fields as never);
}

/**
 * The inner box: the same shape pulled in on every side.
 *
 * A shape is a PATH, not a rectangle with a width, so "smaller by `inset`" is a scale about the
 * centre — computed from the shape's own extent and applied by `transformShape`, which already
 * knows how to carry curves. Exact for the rectangles a control is built from, and an honest
 * approximation for anything more exotic; offsetting a contour properly is the dash machinery's
 * job and far more than a button needs.
 */
function insetOf(bounds: Shape, inset: number): Shape {
  if (inset <= 0) return bounds;
  const { w, h } = extentOf(bounds);
  return transformShape(bounds, {
    scaleX: w > 0 ? Math.max(0, (w - inset * 2) / w) : 1,
    scaleY: h > 0 ? Math.max(0, (h - inset * 2) / h) : 1,
  });
}
