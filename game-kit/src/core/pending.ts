// A MOVE WAITING ON A PERSON — the one wait worth showing, and the one the tree has to survive.
//
// A drop into someone else's hand is legal in FORM and short of AUTHORITY: the verdict is `ask`, and
// what happens next is not a state machine but a record. `docs/scenarios/hand-accept.md` §E settles
// its shape, and the two hardest lines in it are not about consent at all:
//
//   THE RULE IS JUDGED TWICE — once when the card was let go, and again at the commit. Consent is
//   permission, never a licence: the hand may have filled up while its owner was thinking, and then
//   the card goes home however warmly it was invited.
//
//   ONLY THE ELEMENT IS LOCKED. Not the target — the owner goes on playing their own hand — and not
//   the source, where the desk goes on living. The card in waiting is nobody's to pick up, INCLUDING
//   the one who asked: they may withdraw the request, which is not the same as taking the card back.
//
// FIVE INPUTS, EXACTLY TWO OUTCOMES: consent, refusal, withdrawal, timeout, and the rule breaking
// underneath — all of them end in a commit or a return, and the request has no third state to be in.
//
// The waiting itself is a RECORD IN THE STATE and not a flag on the card: both ends of the
// interaction read it, it travels, and a late viewer sees the same card hanging. WHO is asked and
// HOW is the consumer's business entirely — the kit hands over the record and the two answers; the
// "accept / decline" panel belongs to the game, most likely in its HUD.

import { byId, type Node, type NodeId } from "./node.js";
import { applyMove, planMove, type MovePlan, type MoveRequest } from "./move.js";

/** What came back — or did not. The fifth input, a broken rule, is found here rather than told. */
export type Answer = "granted" | "refused" | "withdrawn" | "expired";

/** Where a request ends. There is no third one. */
export type Outcome = "committed" | "returned";

/** One end of the move, as it must be remembered — see `Pending.from` on why `after` and not an index. */
export interface Berth {
  readonly parent: NodeId;
  /**
   * The sibling this load sat AFTER, or `undefined` when it sat first. A neighbour and never an
   * index: the owner may reorder while they think, and an absolute position is a lie by then. It is
   * the same principle as a stack keyed by identity rather than by depth.
   */
  readonly after: NodeId | undefined;
}

export interface Pending {
  /** The request's own name — input, like a node's id, and for the same reasons. */
  readonly id: string;
  /** The whole load. A pack is asked about as ONE request, not as several. */
  readonly els: readonly NodeId[];
  readonly from: Berth;
  readonly to: Berth;
  /** Who asked. Only they may withdraw it. */
  readonly actor: string;
  /** When the wait runs out, on the one clock. Reaching it is an input like any other. */
  readonly deadline: number;
}

/** What the caller knows and the plan does not: who is asking, under what name, and until when. */
export interface AskOptions {
  readonly id: string;
  readonly actor: string;
  readonly deadline: number;
}

/**
 * THE RECORD, or nothing. Only `ask` hangs: `allow` commits on the spot and `deny` never happened,
 * and neither of them has anybody to wait for.
 */
export function askFor(req: MoveRequest, plan: MovePlan, opts: AskOptions): Pending | undefined {
  if (plan.verdict !== "ask" || plan.load.length === 0) return undefined;
  const lead = plan.load[0]!;
  const seats = req.source.children.map((c) => c.id);
  const at = seats.indexOf(lead);
  return {
    id: opts.id,
    els: [...plan.load],
    from: { parent: req.source.id, after: at > 0 ? seats[at - 1] : undefined },
    to: { parent: req.target.id, after: req.target.children.at(-1)?.id },
    actor: opts.actor,
    deadline: opts.deadline,
  };
}

/**
 * The word came — or the clock ran out, or the asker changed their mind. Every one of them lands on
 * one of two outcomes, and only consent can reach the first.
 *
 * A grant does NOT apply the stored plan. The tree is re-read and the move planned AGAIN, because
 * everything the first plan was true about may have moved since: the hand filled, the card was
 * eaten, the seat went. A stored verdict applied blind is how a rule gets broken with permission.
 */
export function answer(root: Node, p: Pending, said: Answer): Outcome {
  if (said !== "granted") return "returned";
  const source = byId(root, p.from.parent);
  const touched = byId(root, p.els[0] ?? "");
  const target = byId(root, p.to.parent);
  // A card that is no longer where it was asked from makes the answer moot rather than a failure:
  // the request outlived its subject, which is an ordinary end and not an error.
  if (!source || !touched || !target || touched.parent !== source) return "returned";
  const req: MoveRequest = { source, touched, target };
  const plan = planMove(req);
  // Consent covers exactly the authority that was missing, and nothing else: `ask` becomes `allow`,
  // while a `deny` reached in the meantime stands. The rule is judged the second time HERE.
  if (plan.verdict === "deny") return "returned";
  applyMove(req, { ...plan, verdict: "allow" });
  return "committed";
}

/**
 * WHAT NO FINGER MAY LIFT while these requests are open — the load, and nothing else.
 *
 * Not the target and not the source: locking either would stop a table over one player's question.
 * The asker is inside this set too, which is the point — withdrawing a request is a different act
 * from picking the card back up, and only one of them exists.
 */
export function locks(open: readonly Pending[]): ReadonlySet<NodeId> {
  const held = new Set<NodeId>();
  for (const p of open) for (const id of p.els) held.add(id);
  return held;
}
