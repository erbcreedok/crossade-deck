import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { add, node } from "./node.js";
import { Container } from "./atoms/container.js";
import { Grabber, installStockGrabs, resetGrabs } from "./atoms/grab.js";
import { Grippable } from "./atoms/grippable.js";
import { Keeper } from "./atoms/keeps.js";
import { Acceptor } from "./atoms/acceptor.js";
import { Displacer, installStockOccupied, resetOccupied } from "./atoms/occupied.js";
import { Draggable } from "./atoms/draggable.js";
import { planMove } from "./move.js";
import { installStockGrains, keep, Poser, resetGrains, stamp, up } from "./atoms/pose.js";
import { Transformable } from "./atoms/transformable.js";
import { Flippable } from "./atoms/flippable.js";

const ALLOW = { and: [] } as const;
const DENY = { or: [] } as const;
const ASK = { ask: { and: [] } } as const;

beforeEach(() => {
  installStockGrabs();
  installStockOccupied();
  installStockGrains();
});
afterEach(() => {
  resetGrabs();
  resetOccupied();
  resetGrains();
});

/** A grabbable source holding one draggable card; returns both nodes. */
const withCard = (...srcExtra: any[]) => {
  const source = node("src", Container({}), Grabber({ grab: "one" }), ...srcExtra);
  const card = node("card", Draggable({ onReject: "home" }));
  add(source, card);
  return { source, card };
};

const allowTarget = (...extra: any[]) => node("tgt", Container({}), Acceptor({ accept: ALLOW }), ...extra);

describe("planMove", () => {
  it("move.plain-move-allows — grab a card onto an open, accepting pile", () => {
    const { source, card } = withCard();
    const plan = planMove({ source, touched: card, target: allowTarget() });
    expect(plan).toEqual({ verdict: "allow", load: ["card"], pose: { angle: 0, side: "up" } });
  });

  it("move.grab-empty-denies — nothing under the finger, nothing moves", () => {
    const source = node("src", Container({}), Grabber({ grab: "top" })); // empty pile
    const ghost = node("card", Draggable({ onReject: "home" }));
    const plan = planMove({ source, touched: ghost, target: allowTarget() });
    expect(plan).toEqual({ verdict: "deny", load: [], block: "empty" });
  });

  it("move.gripped-by-another-seat-denies — a card in north's hand is not south's to lift", () => {
    const { source, card } = withCard(Grippable({ by: ["north"] }));
    const plan = planMove({ source, touched: card, target: allowTarget(), seat: "south" });
    expect(plan.block).toBe("gripped");
    expect(plan.verdict).toBe("deny");
  });

  it("move.no-seat-skips-grip — with no seat given the grip gate does not run", () => {
    const { source, card } = withCard(Grippable({ by: ["north"] }));
    const plan = planMove({ source, touched: card, target: allowTarget() });
    expect(plan.verdict).toBe("allow");
  });

  it("move.kept-cannot-leave — a source that keeps nothing pins its cards inside", () => {
    const { source, card } = withCard(Keeper({ keeps: [] }));
    const plan = planMove({ source, touched: card, target: allowTarget() });
    expect(plan).toEqual({ verdict: "deny", load: ["card"], block: "kept" });
  });

  it("move.kept-allows-what-it-lists — Draggable in the keep-list may be carried out", () => {
    const { source, card } = withCard(Keeper({ keeps: ["Draggable"] }));
    const plan = planMove({ source, touched: card, target: allowTarget() });
    expect(plan.verdict).toBe("allow");
  });

  it("move.target-rejects — the target refuses the load", () => {
    const { source, card } = withCard();
    const target = node("tgt", Container({}), Acceptor({ accept: DENY }));
    const plan = planMove({ source, touched: card, target });
    expect(plan).toEqual({ verdict: "deny", load: ["card"], block: "rejected" });
  });

  it("move.ask-target-requests — the target wants a confirmation first", () => {
    const { source, card } = withCard();
    const target = node("tgt", Container({}), Acceptor({ accept: ASK }));
    const plan = planMove({ source, touched: card, target });
    expect(plan.verdict).toBe("ask");
  });

  it("move.occupied-slot-reject-denies — a filled reject-slot refuses the incomer", () => {
    const { source, card } = withCard();
    const target = allowTarget(Displacer({ occupied: "reject" }));
    add(target, node("sitter"));
    const plan = planMove({ source, touched: card, target });
    expect(plan.block).toBe("rejected");
    expect(plan.occupied).toEqual({ kind: "reject" });
  });

  it("move.occupied-slot-swap-allows — a filled swap-slot takes the incomer, sitter goes home", () => {
    const { source, card } = withCard();
    const target = allowTarget(Displacer({ occupied: "swap" }));
    add(target, node("sitter"));
    const plan = planMove({ source, touched: card, target });
    expect(plan.verdict).toBe("allow");
    expect(plan.occupied).toEqual({ kind: "swap" });
  });

  it("move.pile-without-displacer-never-conflicts — a full pile just grows", () => {
    const { source, card } = withCard();
    const target = allowTarget();
    add(target, node("resident"));
    const plan = planMove({ source, touched: card, target });
    expect(plan).toEqual({ verdict: "allow", load: ["card"], pose: { angle: 0, side: "up" } });
  });

  // ── the pose the drop comes to rest in ──────────────────────────────────────────────────────
  //
  // A move is not only "may it" — it is also "and how does it lie afterwards". The two are one
  // resolution because they are one question asked of the same zone, and splitting them is how the
  // verdict and the pose come to disagree about which zone answered.

  it("move.plan-carries-the-rest-pose — a drop answers where it lies, not only whether it may", () => {
    const { source, card } = withCard();
    const plan = planMove({ source, touched: card, target: allowTarget() });
    expect(plan.pose).toEqual({ angle: 0, side: "up" });
  });

  it("move.a-denied-move-has-no-pose — nothing lands, so nothing lies anywhere", () => {
    const { source, card } = withCard(Keeper({ keeps: [] }));
    const plan = planMove({ source, touched: card, target: allowTarget() });
    expect(plan.verdict).toBe("deny");
    expect(plan.pose).toBeUndefined();
  });

  it("move.the-target-stamps-the-pose — the zone imposes, the carried turn is ignored", () => {
    const { source, card } = withCard();
    const target = allowTarget(Poser({ angle: stamp(0) }));
    const plan = planMove({ source, touched: card, target, carried: { angle: 15 } });
    expect(plan.pose?.angle).toBe(0);
  });

  it("move.the-carried-pose-comes-from-the-request — a turn owned by the gesture is not on the node", () => {
    // 15° under the finger is in FLIGHT: local, per-frame, on no node. The runtime holds it and
    // hands it over at the drop — reading the node instead would resolve the pre-drag angle.
    const { source, card } = withCard();
    const target = allowTarget(Poser({ angle: keep() }));
    const plan = planMove({ source, touched: card, target, carried: { angle: 15 } });
    expect(plan.pose?.angle).toBe(15);
  });

  it("move.without-a-carried-pose-the-node-answers — a dealt card carries what it already had", () => {
    const source = node("src", Container({}), Grabber({ grab: "one" }));
    const card = node("card", Draggable({ onReject: "home" }), Transformable({ angle: 15 }), Flippable({ turns: 1 }));
    add(source, card);
    const target = allowTarget(Poser({ angle: keep(), side: keep() }));
    expect(planMove({ source, touched: card, target }).pose).toEqual({ angle: 15, side: "down" });
  });

  it("move.the-target-turns-the-card-over — the side is a grain of the same pose", () => {
    const { source, card } = withCard();
    const target = allowTarget(Poser({ side: up() }));
    const plan = planMove({ source, touched: card, target, carried: { side: "down" } });
    expect(plan.pose?.side).toBe("up");
  });
});
