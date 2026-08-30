// THE RUNTIME, AS THE VERBS SEE IT.
//
// A choreography or a throw is a LEAF of this machine: it builds one record, files it and asks for
// a frame. Nothing in the loop calls back into it. That is the seam the verbs are cut along — and
// the reason the rest of the runtime is NOT cut further: `reconcile`, `land`, `step` and the loop
// call each other in a ring, and modules passing a shared mutable bag round that ring would hide
// exactly the kind of seam a bug lives on, not expose it.
//
// The mutable words are GETTERS. `warped` and `tuning` move under the verbs' feet — the clock runs
// and a game retunes — so a verb must read them at the moment it is called, never at the moment it
// was built.

import { type NodeId } from "../../core/node.js";
import { type MotionTuning } from "../../core/motion.js";
import { type Transform, type Vec } from "../../core/transform.js";
import { type Host } from "../host.js";
import { type ShuffleBox } from "../shuffles.js";
import { type Choreo, type Flight } from "./records.js";

export interface Runtime {
  readonly host: Host;
  /** The warped clock's now, in ms — read at call time, because it is running. */
  readonly warped: number;
  /** The tuning in force right now — read at call time, because a game may retune between verbs. */
  readonly tuning: MotionTuning;
  readonly choreos: Map<NodeId, Choreo>;
  /** Where a node stands on the glass this instant — a throw or a tumble starts from here. */
  restOf(id: NodeId): Transform | undefined;
  /** What the onlooker can see, root units — a shuffle carries a packet off the glass through it. */
  visibleBox(): ShuffleBox;
  /** The glass in root units — the floor a launch bounces off and the edge it is gone past. */
  glass(): { readonly halfW: number; readonly halfH: number };
  /** File a flight. The finger lets go at once; a settle it was riding runs on until the flight goes. */
  beginFlight(id: NodeId, f: Flight): void;
  /** Move a flight's destination while it is on the way — silent on a flight that has none. */
  aim(id: NodeId, to: Vec, up: number | undefined): void;
  ensureLoop(): void;
}
