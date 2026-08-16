// A PILE, as one literal of data assembled into an element. Every game keeps stacks of things —
// a stock of cards, a column, a poker bank of chips, captured chess pieces, monopoly houses on a
// street — and every one of them is the SAME assembly: a seat, maybe a box and a face, an
// arrangement by registry name, and the policies of what leaves, what may land, what it wears
// while willing, and what shadow the resting stack lays. This preset is that assembly and nothing
// more: no behaviour lives here, every capability rides the atom that already owns it, and a
// field left out leaves its atom out — absence is the refusal, exactly as everywhere else.

import { node, type Node } from "../core/node.js";
import { type AcceptRule } from "../core/accept.js";
import { Acceptor } from "../core/atoms/acceptor.js";
import { Bounded, type Shape } from "../core/atoms/bounded.js";
import { type Coat } from "../core/atoms/coated.js";
import { Container } from "../core/atoms/container.js";
import { Grabber } from "../core/atoms/grab.js";
import { Inviting } from "../core/atoms/inviting.js";
import { ShadowCaster } from "../core/atoms/shadow.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { type Vec } from "../core/transform.js";
import { type Atom } from "../core/atom.js";

export interface PileSpec {
  /** The pile's seat on its owner, in units. Absent, the layout (or nobody) places it. */
  readonly at?: Vec;
  /** The slot's own box — what an EMPTY pile occupies and shows. Absent, content is the size. */
  readonly bounds?: Shape;
  /** The slot's face, by registry name. Absent, an empty pile is invisible — and that is legal. */
  readonly surface?: string;
  /** The arrangement, by registry name: a squared stack, a column, a fan — the consumer's word. */
  readonly layout: string;
  /** What a finger may LIFT, by grab-registry name (`top`, `above`, `one`…). Absent, nothing. */
  readonly grab?: string;
  /** The zone's judgement of a drop. Absent, this pile judges nothing — some other law decides. */
  readonly accept?: AcceptRule;
  /** What the pile wears while a drag it would take is in flight. Absent, it never lights. */
  readonly invite?: Coat;
  /** The contour a resting stack lays as its one shadow. Absent, the pile casts nothing. */
  readonly shadow?: "footprint" | "silhouette";
}

/** Assemble a pile from its spec — a registration away from a new game, never a new engine case. */
export function pile(id: string, spec: PileSpec): Node {
  const atoms: Atom[] = [Container({ layout: spec.layout })];
  if (spec.at) atoms.push(Transformable({ at: spec.at }));
  if (spec.bounds) atoms.push(Bounded({ bounds: spec.bounds }));
  if (spec.surface) atoms.push(Surfaced({ surface: spec.surface }));
  if (spec.grab) atoms.push(Grabber({ grab: spec.grab }));
  if (spec.accept) atoms.push(Acceptor({ accept: spec.accept }));
  if (spec.invite) atoms.push(Inviting({ coat: spec.invite }));
  if (spec.shadow) atoms.push(ShadowCaster({ from: spec.shadow }));
  return node(id, ...atoms);
}
