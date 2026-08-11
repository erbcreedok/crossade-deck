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

const ALLOW = { and: [] } as const;
const DENY = { or: [] } as const;
const ASK = { ask: { and: [] } } as const;

beforeEach(() => {
  installStockGrabs();
  installStockOccupied();
});
afterEach(() => {
  resetGrabs();
  resetOccupied();
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
    expect(plan).toEqual({ verdict: "allow", load: ["card"] });
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
    expect(plan).toEqual({ verdict: "allow", load: ["card"] });
  });
});
