// A MOVE WAITING ON A PERSON — the one wait the kit indicates, and the one it has to survive.
//
// The spec is `docs/scenarios/hand-accept.md` §C and §E, recorded from the owner. Its hardest lines
// are not about consent at all: what is LOCKED while a card hangs, and the fact that the rule is
// judged TWICE — consent does not override a hand that filled up while its owner was thinking.

import { beforeEach, describe, expect, it } from "vitest";
import { add, compose, node } from "./node.js";
import { Container } from "./atoms/container.js";
import { Acceptor } from "./atoms/acceptor.js";
import { Grabber, installStockGrabs, resetGrabs } from "./atoms/grab.js";
import { Draggable } from "./atoms/draggable.js";
import { Transformable } from "./atoms/transformable.js";
import { installStockGrains, resetGrains } from "./atoms/pose.js";
import { planMove } from "./move.js";
import { answer, askFor, locks, type Pending } from "./pending.js";

const ALLOW = { and: [] } as const;
const ASK = { ask: { and: [] } } as const;
const DENY = { or: [] } as const;

/** A desk, a source holding two cards, and a target that asks before it takes anything. */
function desk(accept: unknown = ASK) {
  const root = node("desk", Container({}));
  const source = node("src", Container({}), Grabber({ grab: "one" }));
  const card = node("card", Draggable({ onReject: "home" }), Transformable({}));
  const mate = node("mate", Draggable({ onReject: "home" }), Transformable({}));
  add(source, mate);
  add(source, card);
  const target = node("hand", Container({}), Acceptor({ accept: accept as never }), Grabber({ grab: "one" }));
  add(root, source);
  add(root, target);
  return { root, source, card, mate, target };
}

const ask = (d: ReturnType<typeof desk>): Pending | undefined => {
  const req = { source: d.source, touched: d.card, target: d.target };
  return askFor(req, planMove(req), { id: "req-1", actor: "south", deadline: 5_000 });
};

describe("a move waiting on a person", () => {
  beforeEach(() => {
    resetGrabs();
    installStockGrabs();
    resetGrains();
    installStockGrains();
  });

  it("pending.only-an-ask-hangs — allow commits at once, deny never happened", () => {
    expect(ask(desk(ALLOW))).toBeUndefined();
    expect(ask(desk(DENY))).toBeUndefined();
    expect(ask(desk())).toBeDefined();
  });

  it("pending.the-record-remembers-the-neighbour-not-the-index", () => {
    // The owner may reorder while thinking, and an absolute index is a lie by then. The card came
    // after `mate`, and that is what a return home aims at.
    const p = ask(desk())!;
    expect(p.els).toEqual(["card"]);
    expect(p.from).toEqual({ parent: "src", after: "mate" });
    expect(p.to.parent).toBe("hand");
    expect(p.actor).toBe("south");
  });

  it("pending.consent-commits — the card lands where it was asked to", () => {
    const d = desk();
    const p = ask(d)!;
    expect(answer(d.root, p, "granted")).toBe("committed");
    expect(d.target.children.map((c) => c.id)).toEqual(["card"]);
  });

  it("pending.refusal-withdrawal-and-timeout-all-return — five inputs, two outcomes", () => {
    for (const said of ["refused", "withdrawn", "expired"] as const) {
      const d = desk();
      const p = ask(d)!;
      expect(answer(d.root, p, said), said).toBe("returned");
      expect(d.source.children.map((c) => c.id), said).toEqual(["mate", "card"]);
      expect(d.target.children.length, said).toBe(0);
    }
  });

  it("pending.the-rule-is-judged-twice — consent does not override a hand that filled up", () => {
    // The owner said yes, but by then the hand takes nothing. Consent is permission, not a licence
    // to break the rule that was legal when the card was let go.
    const d = desk();
    const p = ask(d)!;
    compose(d.target, Acceptor({ accept: DENY as never }));
    expect(answer(d.root, p, "granted")).toBe("returned");
    expect(d.source.children.map((c) => c.id)).toEqual(["mate", "card"]);
  });

  it("pending.a-vanished-card-is-not-a-crash — the answer is simply moot", () => {
    const d = desk();
    const p = ask(d)!;
    d.source.children.length = 0;
    expect(answer(d.root, p, "granted")).toBe("returned");
  });

  it("pending.only-the-element-is-locked — the desk goes on living around it", () => {
    const p = ask(desk())!;
    const held = locks([p]);
    expect(held.has("card")).toBe(true);
    // The asker is locked out too: a card in waiting is nobody's to pick up, not even its own.
    expect(held.has("mate")).toBe(false);
    expect(held.has("hand")).toBe(false); // the owner goes on playing their own hand
    expect(held.has("src")).toBe(false); // and the desk goes on living
  });

  it("pending.a-pack-hangs-as-one — the load is a list, not an element", () => {
    const root = node("desk", Container({}));
    const source = node("src", Container({}), Grabber({ grab: "above" }));
    const one = node("one", Draggable({ onReject: "home" }));
    const two = node("two", Draggable({ onReject: "home" }));
    add(source, one);
    add(source, two);
    const target = node("hand", Container({}), Acceptor({ accept: ASK as never }));
    add(root, source);
    add(root, target);
    const req = { source, touched: one, target };
    const p = askFor(req, planMove(req), { id: "r", actor: "south", deadline: 1 })!;
    expect(p.els).toEqual(["one", "two"]);
    expect(locks([p])).toEqual(new Set(["one", "two"]));
  });
});
