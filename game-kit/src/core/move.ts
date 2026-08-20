// MOVE — the whole drop, as one PLAN. Grab, grip, keeps, accept and occupied are each their own
// small law; a move is where they meet. `planMove` reads them in the order a real drop tests them
// and returns what WOULD happen — never mutating the tree. The runtime applies the plan; the plan
// itself is data, like every other answer in the kit (the model is truth, the view is local).
//
// The order is not free — each gate can only DENY, so the first denial wins and the rest are moot:
//   1. grab   — what even leaves the source? Nothing grabbed, nothing moves.
//   2. grip   — may this seat lift that load at all? (skipped when no seat is given)
//   3. keeps   — does the source let a `Draggable` be carried OUT, or is it pinned inside?
//   4. accept  — does the target want it? A three-valued verdict: allow / ask / deny.
//   5. occupied — if the target is a one-seat slot already filled, what happens to the sitter?
// A target is a "slot" precisely when it carries a `Displacer`; a pile has none and simply grows.
// See CANONS.md §3, docs/design/container.md and NIGHT-DECISIONS.md.

import { add, caps, compose, fieldsOf, remove, type Node, type NodeId } from "./node.js";
import { canAccept } from "./atoms/acceptor.js";
import { grabFrom } from "./atoms/grab.js";
import { grippableBy } from "./atoms/grippable.js";
import { keepsAllows } from "./atoms/keeps.js";
import { admitsOccupied, resolveOccupied } from "./atoms/occupied.js";
import { type OccupiedOutcome } from "./atoms/occupied.js";
import { type Verdict } from "./accept.js";
import { restPose, type CarriedPose, type RestPose } from "./atoms/pose.js";
import { ownFacing, setFacing } from "./atoms/flippable.js";
import { Transformable, type TransformableFields } from "./atoms/transformable.js";

/** Why a move was denied, when it was — the gate that stopped it. */
export type MoveBlock = "empty" | "gripped" | "kept" | "rejected";

export interface MoveRequest {
  /** The container the load leaves. */
  readonly source: Node;
  /** The child grabbed under the finger. */
  readonly touched: Node;
  /** The container it is dropped on. */
  readonly target: Node;
  /** Who is performing the move, for the grip check. Omit to skip grip entirely. */
  readonly seat?: string;
  /**
   * The pose the GESTURE holds, grain by grain — the turn a finger left the load at, the side a
   * flick sent it away on. In flight none of it is on the node: it is local, per-frame and
   * predicted, so the runtime hands it over here at the drop. Omit a grain, or the whole thing, and
   * the node's own value answers — which is exactly right for a deal nobody's finger touched.
   */
  readonly carried?: CarriedPose;
}

export interface MovePlan {
  /** allow / ask / deny — `ask` means the target wants a confirmation before it takes the load. */
  readonly verdict: Verdict;
  /** The ids that leave the source. Empty only when nothing was grabbed. */
  readonly load: readonly NodeId[];
  /** The gate that denied, present iff `verdict` is `deny`. */
  readonly block?: MoveBlock;
  /** What happens to a sitter, present iff the target is a filled slot the move may enter. */
  readonly occupied?: OccupiedOutcome;
  /**
   * How the load LIES once it lands — present iff the move may proceed, absent on a denial for the
   * plain reason that nothing that does not land lies anywhere.
   *
   * One resolution answers both halves on purpose. "May it" and "how does it lie afterwards" are
   * the same question put to the same zone, and asking them separately is how a verdict from one
   * zone comes to be paired with a pose from another.
   */
  readonly pose?: RestPose;
}

/** The capability a load needs to be carried out of a container: it is being dragged away. */
const CARRY = "Draggable";

/**
 * What the load brings in, grain by grain: the gesture's value where it holds one, the node's own
 * otherwise. Per grain and not all-or-nothing — a finger that turned a card did not thereby say
 * anything about which side is up.
 */
function carriedInto(touched: Node, given: CarriedPose | undefined): CarriedPose {
  return {
    angle: given?.angle ?? fieldsOf<TransformableFields>(touched, "Transformable")?.angle,
    side: given?.side ?? ownFacing(touched),
  };
}

/**
 * What a drop of `touched` from `source` onto `target` would do. Pure — reads the policies, moves
 * nothing. The first gate to deny wins; a target with no `Displacer` is a pile and never conflicts.
 */
export function planMove(req: MoveRequest): MovePlan {
  const { source, touched, target, seat } = req;
  // The arrangement is not asked for a turn: `place` answers in points, and no registered layout
  // has an opinion about one yet. `derive` therefore reads "straight", which is what a grid means.
  const pose = (): RestPose => restPose(target, carriedInto(touched, req.carried), {});

  const load = grabFrom(source, touched.id);
  if (load.length === 0) return { verdict: "deny", load, block: "empty" };

  if (seat !== undefined && !grippableBy(touched, seat)) return { verdict: "deny", load, block: "gripped" };

  if (!keepsAllows(source, CARRY)) return { verdict: "deny", load, block: "kept" };

  const verdict = canAccept(target, touched);
  if (verdict === "deny") return { verdict, load, block: "rejected" };

  if (target.children.length > 0 && caps(target).has("Displacer")) {
    const occupied = resolveOccupied(target); // opaque plan data for the runtime — never dispatched on here
    if (!admitsOccupied(target)) return { verdict: "deny", load, block: "rejected", occupied };
    return { verdict, load, occupied, pose: pose() };
  }

  return { verdict, load, pose: pose() };
}

/**
 * CARRY THE PLAN OUT — the one place the tree actually moves.
 *
 * Split from `planMove` on purpose, and not for tidiness: a verdict of `ask` has to be able to HANG
 * there, waiting on a person, and a resolver that applied itself has nowhere to hang. So the plan is
 * data a caller may hold, show, send or drop, and this is the separate act of committing it. Only
 * `allow` commits: `ask` is a question that has not been answered yet, and `deny` never happens.
 *
 * Every id in the load moves, in the order the grab named them, and each comes to rest in ITS OWN
 * pose — the finger held one turn for the whole sub-pile, but the side is each card's own bit, and
 * smearing the touched card's over its neighbours would turn half a column face-down on landing.
 *
 * THE TWO GRAINS ARE WRITTEN IN DIFFERENT TERMS, and it is worth knowing which:
 *   - the angle is the node's OWN turn, the same terms it was read in;
 *   - the side is what the OWNER SEES, so it goes through `setFacing` AFTER the load has changed
 *     owner — which is what folds the new zone's own turn back in and lets `up` mean the plain word.
 * A node with no `Transformable` gets no angle written: it declined to have a pose, and inventing
 * one here would be handing a node a capability it does not carry.
 */
export function applyMove(req: MoveRequest, plan: MovePlan): void {
  if (plan.verdict !== "allow") return;
  const { source, target } = req;
  for (const id of plan.load) {
    const load = source.children.find((c) => c.id === id);
    if (!load) continue;
    const rest = restPose(target, carriedInto(load, req.carried), {});
    remove(source, load);
    add(target, load);
    const own = fieldsOf<TransformableFields>(load, "Transformable");
    if (own) compose(load, Transformable({ ...own, angle: rest.angle }));
    setFacing(load, rest.side);
  }
}
