// THE LOCAL MASTER — one authoritative board, N clients on one page, and a delay you can dial.
//
// It is a DEBUG interface, not a server: its whole job is the semantics of DELIVERY — who is
// authoritative, that a broadcast reaches everyone INCLUDING the author, that messages are applied
// in the order they arrive, and that all of it can be made slow on purpose. Rules are not its
// business; the move is planned and applied by the kit, exactly as a single screen would.
//
// The shape is client2's, deliberately: a scene must not be able to tell whether the thing under it
// is a mock on the same page or a shared master over a socket. Swapping this for a real transport
// is replacing one implementation, never touching a scene.
//
// LATENCY IS THE POINT. A round trip costs it twice — once to reach the master, once for the echo
// to come back — which is what makes a card visibly hang and what makes stale echoes reachable
// without a network at all. `0` is the honest default: the delay is a thing a reader turns ON.
//
// WHAT TRAVELS IS A MOVE, in the kit's own terms: which load, out of which container, into which.
// Not `play_card` and not `take_card` — those are a card game's verbs, and the engine has no cards
// in it. A game maps its own vocabulary onto this; the kit carries the transaction.

import { applyMove, byId, compose, fieldsOf, planMove, project, Transformable, type Node, type NodeId, type TransformableFields, type Vec } from "../../src/index.js";

/** One move, as it goes over the wire: names and a point, nothing that could not be serialised. */
export interface Move {
  readonly source: NodeId;
  readonly touched: NodeId;
  readonly target: NodeId;
  /** Where the finger let go, in the TARGET's space — a free zone keeps it, an arranged one will not. */
  readonly at: Vec;
  readonly actor: string;
}

/** What one screen holds. It knows its seat and nothing about who else is connected. */
export interface Seatmate {
  readonly seat: string;
  /** Propose a move. It reaches the master after the delay, and the echo after it again. */
  send(move: Move): void;
  /** Authoritative snapshots — this seat's PROJECTION of the board, including echoes of its own moves. */
  onState(cb: (seen: Node) => void): () => void;
}

export interface Master {
  join(seat: string): Seatmate;
  /** The panel's newest number, live — a re-render retunes the standing master rather than rebuilding it. */
  retune(latency: number): void;
  /** The board itself, for a consumer that needs to look at the truth (a test, a debug panel). */
  truth(): Node;
  dispose(): void;
}

/**
 * A master over one tree. `latency` is one way in milliseconds, so a round trip is twice it.
 *
 * Applying is the kit's ordinary path — `planMove` then `applyMove` — because the master must not
 * grow a second copy of the rules. What it owns is delivery, and delivery alone.
 */
export function localMaster(truth: Node, latency = 0): Master {
  const seats = new Map<string, ((seen: Node) => void)[]>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let delay = latency;
  let gone = false;

  const later = (run: () => void): void => {
    if (gone) return;
    if (delay <= 0) {
      run();
      return;
    }
    const t = setTimeout(() => {
      timers.delete(t);
      if (!gone) run();
    }, delay);
    timers.add(t);
  };

  /** Everyone hears it, the author included — the semantics a real room has, and the reason a
   *  client needs no special case for its own move: the echo is just another snapshot. */
  const broadcast = (): void => {
    for (const [seat, subs] of seats) {
      const seen = project(truth, seat);
      for (const cb of subs) later(() => cb(seen));
    }
  };

  const apply = (move: Move): void => {
    const source = byId(truth, move.source);
    const touched = byId(truth, move.touched);
    const target = byId(truth, move.target);
    if (!source || !touched || !target || touched.parent !== source) return; // a stale message is dropped, not fatal
    const own = fieldsOf<TransformableFields>(touched, "Transformable");
    if (own) compose(touched, Transformable({ ...own, at: move.at }));
    const req = { source, touched, target, carried: { angle: own?.angle ?? 0 } };
    applyMove(req, planMove(req));
    broadcast();
  };

  return {
    join(seat) {
      if (!seats.has(seat)) seats.set(seat, []);
      return {
        seat,
        send: (move) => later(() => apply(move)),
        onState(cb) {
          const subs = seats.get(seat)!;
          subs.push(cb);
          return () => {
            const i = subs.indexOf(cb);
            if (i >= 0) subs.splice(i, 1);
          };
        },
      };
    },
    retune(next) {
      delay = next;
    },
    truth: () => truth,
    dispose() {
      gone = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      seats.clear();
    },
  };
}
