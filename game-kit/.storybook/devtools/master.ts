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

import {
  answer,
  applyMove,
  askFor,
  byId,
  compose,
  fieldsOf,
  locks,
  planMove,
  project,
  Transformable,
  type Answer,
  type Node,
  type NodeId,
  type Pending,
  type PoserFields,
  type TransformableFields,
  type Vec,
} from "../../src/index.js";

/** One move, as it goes over the wire: names and a point, nothing that could not be serialised. */
export interface Move {
  readonly source: NodeId;
  readonly touched: NodeId;
  readonly target: NodeId;
  /** Where the finger let go, in the TARGET's space — a free zone keeps it, an arranged one will not. */
  readonly at: Vec;
  readonly actor: string;
}

/** What is waiting on somebody's word right now — the part a projection cannot say by itself. */
export interface Waiting {
  /** What no finger may lift. */
  readonly held: ReadonlySet<NodeId>;
  /** Which zones have a question standing at them. */
  readonly zones: ReadonlySet<NodeId>;
  /**
   * Every question standing right now, by its own name — who asked and about what.
   *
   * Broadcast rather than kept by the asker alone: a client that only knew about its own question
   * because it happened to send it would forget on a reload, and a late viewer would never learn of
   * it at all. The record is in the state, so both ends read it from the same place.
   */
  readonly open: readonly Ask[];
  /**
   * WHERE each waiting load hangs, in root units — the point the finger let it go at.
   *
   * The tree cannot say this: the card has not moved, and in an arranged zone it could not be shown
   * moved anyway. It is the intent, kept beside the question, so every seat draws the card in the
   * same place and a late viewer joins to the same picture.
   */
  readonly hangs: ReadonlyMap<NodeId, Vec>;
}

/**
 * A HAND IN MOTION, as the others are told about it — ephemeral decoration, never truth.
 *
 * `at` is ABSENT when the master cut it: a finger over its owner's own hand tells the table THAT it
 * is dragging that card and never WHERE, or the shape of a secret hand would leak through the
 * coordinates alone. Present, the point is honest and every seat reads it in the same axes.
 */
export interface Carry {
  readonly actor: string;
  readonly els: readonly NodeId[];
  readonly at?: Vec;
  /** The hand let go. Whatever the others were drawing for it comes off. */
  readonly done: boolean;
}

/** A move that reached this seat as a QUESTION: somebody wants to put something in its zone. */
export interface Ask {
  readonly id: string;
  /** Who is asking. */
  readonly actor: string;
  /** What they want to put down. */
  readonly els: readonly NodeId[];
}

/** What one screen holds. It knows its seat and nothing about who else is connected. */
export interface Seatmate {
  readonly seat: string;
  /** Propose a move. It reaches the master after the delay, and the echo after it again. */
  send(move: Move): void;
  /**
   * Authoritative snapshots — this seat's PROJECTION of the board, including echoes of its own
   * moves — and what no finger may lift, which the projection alone cannot say: a card hanging on
   * somebody's word looks perfectly ordinary.
   */
  onState(cb: (seen: Node, wait: Waiting) => void): () => void;
  /** THIS seat is being asked. Whether it answers with a panel, a key or a bot is its own business. */
  onAsk(cb: (ask: Ask) => void): () => void;
  /** Say that this hand is carrying something. Retransmitted to the OTHERS, never echoed back. */
  carry(carry: Omit<Carry, "actor">): void;
  /** Somebody else's hand, in motion. */
  onCarry(cb: (carry: Carry) => void): () => void;
  /** The word. Only the seat that was asked is heard — and the asker, who may withdraw. */
  reply(id: string, said: Answer): void;
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
/** How long a question stands before it answers itself. A number, not a law — see `Pending`. */
export const PATIENCE = 8_000;

/**
 * How many questions one seat may have standing at it. Without a ceiling one player buries another
 * under twenty requests and the table stops being playable — the scenario names it (`maxOpen`), and
 * it belongs to whoever resolves, not to the record.
 */
export const MAX_OPEN = 3;

/**
 * What the master must be told and cannot work out: whether a point is over a PUBLIC part of the
 * desk. Zones and their boxes are in the tree, but which of them counts as public is the game's
 * knowledge — the same reason the drag wiring is handed `zoneAt` rather than picking for itself.
 */
export type PublicAt = (at: Vec) => boolean;

export function localMaster(truth: Node, latency = 0, maxOpen = MAX_OPEN, publicAt?: PublicAt): Master {
  const seats = new Map<string, ((seen: Node, wait: Waiting) => void)[]>();
  const asked = new Map<string, ((ask: Ask) => void)[]>();
  const hands = new Map<string, ((carry: Carry) => void)[]>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  /** Every question standing right now. A record in the state, exactly as the scenario has it. */
  const open: Pending[] = [];
  /** Where each of them hangs, by element — the intent the record carries beside the addresses. */
  const hangs = new Map<NodeId, Vec>();
  let asks = 0;
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
    const wait = snapshotWait();
    for (const [seat, subs] of seats) {
      const seen = project(truth, seat);
      for (const cb of subs) later(() => cb(seen, wait));
    }
  };

  /** What is waiting, right now — one shape, so a boot and a broadcast cannot describe it differently. */
  const snapshotWait = (): Waiting => ({
    held: locks(open),
    zones: new Set(open.map((q) => q.to.parent)),
    open: open.map((q) => ({ id: q.id, actor: q.actor, els: q.els })),
    hangs: new Map(hangs),
  });

  /** Whose word a zone waits on. No owner means nobody's, and the question answers itself. */
  const ownerOf = (zone: Node): string => fieldsOf<PoserFields>(zone, "Poser")?.owner ?? "";

  /** How many questions are standing at one seat right now — the ceiling `maxOpen` is read against. */
  const standingAt = (seat: string): number =>
    open.filter((q) => ownerOf(byId(truth, q.to.parent) ?? truth) === seat).length;

  /** Close a question, however it ended, and let every screen see the result. */
  const close = (p: Pending, said: Answer): void => {
    const at = open.indexOf(p);
    if (at < 0) return; // already closed: races are settled by ORDER, and the first one home won
    open.splice(at, 1);
    for (const id of p.els) hangs.delete(id);
    answer(truth, p, said);
    broadcast();
  };

  const apply = (move: Move): void => {
    const source = byId(truth, move.source);
    const touched = byId(truth, move.touched);
    const target = byId(truth, move.target);
    if (!source || !touched || !target || touched.parent !== source) return; // a stale message is dropped, not fatal
    const own = fieldsOf<TransformableFields>(touched, "Transformable");
    if (own) compose(touched, Transformable({ ...own, at: move.at }));
    // The actor rides along: without it the accept rule cannot tell my own hand from anyone
    // else's, and the whole difference would have to be re-invented outside the tree.
    const req = { source, touched, target, seat: move.actor, carried: { angle: own?.angle ?? 0 } };
    const plan = planMove(req);
    // A MOVE SHORT OF AUTHORITY DOES NOT HAPPEN YET. It becomes a record, the load is locked for
    // everyone — the asker included — and the owner of the zone is asked. Five inputs will end it;
    // the master supplies one of them itself, by letting the clock run out.
    const who = plan.verdict === "ask" ? ownerOf(target) : "";
    // A SEAT THAT IS ALREADY BURIED IS NOT ASKED AGAIN. The move does not hang and does not commit:
    // it simply did not happen, which is the same answer a refusal gives and costs nobody a wait.
    if (plan.verdict === "ask" && standingAt(who) >= maxOpen) return;
    const p = askFor(req, plan, { id: `ask:${(asks += 1)}`, actor: move.actor, deadline: Date.now() + PATIENCE });
    if (p) {
      open.push(p);
      // The zone's own seat, so the point the message carried in the TARGET's space comes out in
      // root units — the axes every seat shares. The demo desks are unposed free layouts, where a
      // zone's `at` IS its place on the board.
      const seat = fieldsOf<TransformableFields>(target, "Transformable")?.at ?? { x: 0, y: 0 };
      for (const id of p.els) hangs.set(id, { x: move.at.x + seat.x, y: move.at.y + seat.y });
      broadcast(); // the lock has to reach every screen before anyone reaches for that card again
      const question: Ask = { id: p.id, actor: p.actor, els: p.els };
      for (const cb of asked.get(who) ?? []) later(() => cb(question));
      const t = setTimeout(() => {
        timers.delete(t);
        if (!gone) close(p, "expired");
      }, PATIENCE);
      timers.add(t);
      return;
    }
    applyMove(req, plan);
    broadcast();
  };

  return {
    join(seat) {
      if (!seats.has(seat)) seats.set(seat, []);
      if (!asked.has(seat)) asked.set(seat, []);
      if (!hands.has(seat)) hands.set(seat, []);
      return {
        seat,
        send: (move) => later(() => apply(move)),
        onState(cb) {
          const subs = seats.get(seat)!;
          subs.push(cb);
          // THE CURRENT STATE, AT ONCE — a room hands one over on connect, and without it a screen
          // has nothing to redraw an ephemeral gesture ON TOP OF until somebody happens to move.
          later(() => cb(project(truth, seat), snapshotWait()));
          return () => {
            const i = subs.indexOf(cb);
            if (i >= 0) subs.splice(i, 1);
          };
        },
        onAsk(cb) {
          const subs = asked.get(seat)!;
          subs.push(cb);
          return () => {
            const i = subs.indexOf(cb);
            if (i >= 0) subs.splice(i, 1);
          };
        },
        carry(carry) {
          // PRIVACY IS THE MASTER'S TO ENFORCE, not the sender's: a client that forgot to withhold
          // its own coordinates would leak the shape of its hand to everyone, and no receiver could
          // tell. So the cut is made HERE, once, against the tree the master holds.
          // THE CUT LIFTS AT THE EDGE OF THE HAND, not at the end of the gesture. While the finger
          // is over its owner's own hand the table is told THAT a card is moving and never where —
          // the shape of a secret hand leaks through coordinates alone. Carry it out onto the open
          // desk and the point becomes honest: it is over something everyone can see anyway.
          const owner = ownerOf(byId(truth, carry.els[0] ?? "")?.parent ?? truth);
          const home = owner !== "" && owner === seat;
          const secret = home && !(carry.at && (publicAt?.(carry.at) ?? false));
          const told: Carry =
            secret || !carry.at
              ? { actor: seat, els: carry.els, done: carry.done }
              : { actor: seat, els: carry.els, at: carry.at, done: carry.done };
          // NO ECHO TO THE AUTHOR: their own hand is already on their own glass, at the frame rate
          // of a finger. Sending it back would be a slower copy of what they can already see.
          for (const [other, subs] of hands) {
            if (other === seat) continue;
            for (const cb of subs) later(() => cb(told));
          }
        },
        onCarry(cb) {
          const subs = hands.get(seat)!;
          subs.push(cb);
          return () => {
            const i = subs.indexOf(cb);
            if (i >= 0) subs.splice(i, 1);
          };
        },
        reply(id, said) {
          later(() => {
            const p = open.find((q) => q.id === id);
            // Only two seats have standing: the one being asked, and the asker withdrawing. A word
            // from anyone else is not a refusal — it is simply not heard.
            if (!p) return;
            const mine = said === "withdrawn" ? p.actor === seat : ownerOf(byId(truth, p.to.parent) ?? truth) === seat;
            if (mine) close(p, said);
          });
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
      asked.clear();
      hands.clear();
    },
  };
}
