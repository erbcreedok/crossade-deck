// THE DELIVERY, on a fake clock. What is tested here is not the rules — the kit plans and applies
// the move, and its own suite covers that — but the SEMANTICS a room has: everyone hears it, the
// author included; a round trip costs the delay twice; a message about a card that has since moved
// is dropped rather than fatal.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Acceptor,
  add,
  Container,
  Draggable,
  Grabber,
  installStockGrabs,
  installStockGrains,
  node,
  keep,
  Poser,
  Private,
  Transformable,
  type Node,
} from "../../src/index.js";
import { localMaster, MAX_OPEN, PATIENCE } from "./master.js";

/** A desk, a source holding one card, and an open target. */
function board(): Node {
  const desk = node("desk", Container({}));
  const src = node("src", Container({}), Grabber({ grab: "one" }), Private({ access: ["north"] }));
  add(src, node("card", Draggable({ onReject: "home" }), Transformable({})));
  const zone = node("zone", Container({}), Acceptor({ accept: { and: [] } }));
  add(desk, src);
  add(desk, zone);
  return desk;
}

const MOVE = { source: "src", touched: "card", target: "zone", at: { x: 0, y: 0 }, actor: "north" } as const;

beforeEach(() => {
  vi.useFakeTimers();
  installStockGrabs();
  installStockGrains();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the local master", () => {
  it("master.a-seat-is-handed-the-state-on-connect", () => {
    // A room does this, and without it a screen has nothing to draw an ephemeral gesture on top of
    // until somebody happens to move.
    const m = localMaster(board());
    let seen = 0;
    m.join("north").onState(() => (seen += 1));
    expect(seen).toBe(1);
    m.dispose();
  });

  it("master.everyone-hears-it-including-the-author", () => {
    const m = localMaster(board());
    const seen: string[] = [];
    m.join("north").onState(() => seen.push("north"));
    m.join("south").onState(() => seen.push("south"));
    seen.length = 0; // the two boot snapshots are not what this is about
    m.join("north").send({ ...MOVE });
    expect(seen.sort()).toEqual(["north", "south"]); // the echo is just another snapshot
    m.dispose();
  });

  it("master.a-round-trip-costs-the-delay-twice", () => {
    const m = localMaster(board(), 100);
    let snapshots = 0;
    m.join("north").onState(() => (snapshots += 1));
    vi.advanceTimersByTime(100); // the boot snapshot travels the same wire
    snapshots = 0;
    m.join("north").send({ ...MOVE });
    vi.advanceTimersByTime(99);
    expect(snapshots, "the message has not even reached the master").toBe(0);
    vi.advanceTimersByTime(1);
    expect(snapshots, "applied, but the echo is still on its way").toBe(0);
    vi.advanceTimersByTime(100);
    expect(snapshots, "and back").toBe(1);
    m.dispose();
  });

  it("master.the-truth-moves-once-and-every-seat-reads-it", () => {
    const m = localMaster(board());
    let north: Node | undefined;
    let south: Node | undefined;
    m.join("north").onState((s) => (north = s));
    m.join("south").onState((s) => (south = s));
    m.join("south").send({ ...MOVE });
    expect(m.truth().children.find((c) => c.id === "zone")!.children.map((c) => c.id)).toEqual(["card"]);
    // Each seat gets its OWN projection of that one board: north may see inside the private source,
    // south may not, and neither of them is looking at the truth itself.
    expect(north!.children.map((c) => c.id)).toEqual(["src", "zone"]);
    expect(south!.children.map((c) => c.id)).toEqual(["zone"]);
    m.dispose();
  });

  it("master.a-stale-message-is-dropped-not-fatal", () => {
    // Two clients aimed at the same card and the delay let both messages out. The second arrives
    // about a card that is no longer where it says — it is ignored, and the desk lives on.
    const m = localMaster(board());
    const north = m.join("north");
    north.send({ ...MOVE });
    expect(() => north.send({ ...MOVE })).not.toThrow();
    expect(m.truth().children.find((c) => c.id === "zone")!.children.map((c) => c.id)).toEqual(["card"]);
    m.dispose();
  });

  it("master.a-dead-master-delivers-nothing — a scene that left takes its timers with it", () => {
    const m = localMaster(board(), 50);
    let snapshots = 0;
    m.join("north").onState(() => (snapshots += 1));
    m.join("north").send({ ...MOVE });
    m.dispose();
    vi.advanceTimersByTime(1000);
    expect(snapshots).toBe(0);
  });

  it("master.the-delay-is-live — the panel's newest number reaches the standing master", () => {
    const m = localMaster(board(), 1000);
    let snapshots = 0;
    m.join("north").onState(() => (snapshots += 1));
    m.retune(0);
    snapshots = 0; // the boot is still in flight at the old number; this is about the new one
    m.join("north").send({ ...MOVE });
    expect(snapshots).toBe(1); // no rebuild, no reconnect: the same master, a new number
    m.dispose();
  });

  // ── a move short of AUTHORITY ────────────────────────────────────────────────────────────────
  //
  // The other half of delivery: a question that stands in the state, a load nobody may lift while
  // it does, and five ways for it to end in one of two outcomes. The master supplies one of those
  // inputs itself, by letting the clock run out.

  /** The same desk, but the target belongs to south and asks before it takes anything. */
  function guarded(): Node {
    const desk = node("desk", Container({}));
    const src = node("src", Container({}), Grabber({ grab: "one" }));
    add(src, node("card", Draggable({ onReject: "home" }), Transformable({})));
    const zone = node("hand", Container({}), Acceptor({ accept: { ask: { and: [] } } as never }), Poser({ side: keep(), owner: "south" }));
    add(desk, src);
    add(desk, zone);
    return desk;
  }
  const ASKED = { source: "src", touched: "card", target: "hand", at: { x: 0, y: 0 }, actor: "north" } as const;
  const landed = (m: ReturnType<typeof localMaster>) =>
    m.truth().children.find((c) => c.id === "hand")!.children.map((c) => c.id);

  it("master.an-ask-reaches-the-owner-and-nobody-else", () => {
    const m = localMaster(guarded());
    const heard: string[] = [];
    m.join("south").onAsk((a) => heard.push(`south:${a.actor}`));
    m.join("north").onAsk(() => heard.push("north"));
    m.join("north").send({ ...ASKED });
    expect(heard).toEqual(["south:north"]);
    expect(landed(m), "nothing has moved: the move is a question, not an act").toEqual([]);
    m.dispose();
  });

  it("master.the-load-is-locked-while-the-question-stands", () => {
    const m = localMaster(guarded());
    let held: ReadonlySet<string> = new Set();
    m.join("north").onState((_, w) => (held = w.held));
    m.join("north").send({ ...ASKED });
    expect(held.has("card"), "the asker is locked out too — withdrawing is not taking it back").toBe(true);
    m.join("south").reply("ask:1", "granted");
    expect(held.size, "and the lock lifts with the question").toBe(0);
    m.dispose();
  });

  it("master.consent-commits-and-refusal-returns", () => {
    for (const [said, expected] of [["granted", ["card"]], ["refused", []]] as const) {
      const m = localMaster(guarded());
      m.join("north").send({ ...ASKED });
      m.join("south").reply("ask:1", said);
      expect(landed(m), said).toEqual(expected);
      m.dispose();
    }
  });

  it("master.only-the-two-with-standing-are-heard", () => {
    const m = localMaster(guarded());
    m.join("north").send({ ...ASKED });
    m.join("north").reply("ask:1", "granted"); // the ASKER cannot grant themselves permission
    expect(landed(m)).toEqual([]);
    m.join("north").reply("ask:1", "withdrawn"); // but they may take the question back
    expect(landed(m)).toEqual([]);
    m.join("south").reply("ask:1", "granted"); // and now the word comes too late: it is closed
    expect(landed(m)).toEqual([]);
    m.dispose();
  });

  it("master.silence-answers-itself — the clock is the fifth input", () => {
    const m = localMaster(guarded());
    let held: ReadonlySet<string> = new Set();
    m.join("north").onState((_, w) => (held = w.held));
    m.join("north").send({ ...ASKED });
    expect(held.has("card")).toBe(true);
    vi.advanceTimersByTime(PATIENCE + 1);
    expect(landed(m), "nobody answered, so the card went home").toEqual([]);
    expect(held.size, "and stopped being locked").toBe(0);
    m.dispose();
  });

  it("master.a-seat-is-not-buried — the ceiling on open questions", () => {
    // Three cards, a ceiling of two: the third question is not asked at all. It does not hang and
    // it does not commit — it simply did not happen, which costs nobody a wait.
    const desk = node("desk", Container({}));
    const src = node("src", Container({}), Grabber({ grab: "one" }));
    for (const id of ["a", "b", "c"]) add(src, node(id, Draggable({ onReject: "home" }), Transformable({})));
    const hand = node("hand", Container({}), Acceptor({ accept: { ask: { and: [] } } as never }), Poser({ side: keep(), owner: "south" }));
    add(desk, src);
    add(desk, hand);
    const m = localMaster(desk, 0, 2);
    const heard: string[] = [];
    m.join("south").onAsk((a) => heard.push(a.id));
    const north = m.join("north");
    for (const card of ["a", "b", "c"]) north.send({ source: "src", touched: card, target: "hand", at: { x: 0, y: 0 }, actor: "north" });
    expect(heard).toEqual(["ask:1", "ask:2"]);
    m.dispose();
  });

  // ── a hand in motion ────────────────────────────────────────────────────────────────────────

  it("master.a-gesture-reaches-the-others-and-never-its-author", () => {
    const m = localMaster(guarded());
    const heard: string[] = [];
    m.join("south").onCarry((c) => heard.push(`south<-${c.actor}`));
    const north = m.join("north");
    north.onCarry(() => heard.push("north"));
    north.carry({ els: ["card"], at: { x: 1, y: 1 }, done: false });
    expect(heard, "their own hand is already on their own glass, at the speed of a finger").toEqual(["south<-north"]);
    m.dispose();
  });

  it("master.the-coordinates-are-cut-over-ones-own-hand", () => {
    // South drags a card of its OWN hand. The table is told THAT it is moving and never where —
    // the shape of a secret hand leaks through coordinates alone. The cut is made by the MASTER, so
    // a client that forgot to withhold them could not leak them either.
    const desk = guarded();
    add(desk.children.find((c) => c.id === "hand")!, node("mine", Draggable({ onReject: "home" }), Transformable({})));
    const m = localMaster(desk);
    let told: { at?: { x: number; y: number } } | undefined;
    m.join("north").onCarry((c) => (told = c));
    m.join("south").carry({ els: ["mine"], at: { x: 2, y: 2 }, done: false });
    expect(told?.at).toBeUndefined();
    m.dispose();
  });

  it("master.the-cut-lifts-over-the-open-desk", () => {
    // Carried OUT of the hand onto something everyone can see anyway, the point becomes honest —
    // and the cut lifts at the edge of the hand, not at the end of the gesture.
    const desk = guarded();
    add(desk.children.find((c) => c.id === "hand")!, node("mine", Draggable({ onReject: "home" }), Transformable({})));
    const m = localMaster(desk, 0, MAX_OPEN, (at) => at.x > 5);
    let told: { at?: { x: number; y: number } } | undefined;
    m.join("north").onCarry((c) => (told = c));
    m.join("south").carry({ els: ["mine"], at: { x: 9, y: 0 }, done: false });
    expect(told?.at).toEqual({ x: 9, y: 0 });
    m.dispose();
  });
});
