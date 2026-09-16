import { describe, expect, it } from "vitest";
import type { Chair, FeltCard, Pile, Snapshot } from "./contract.js";
import { CUES_PER_FRAME, cuesBetween } from "./cues.js";

const pile = (id: string, cards: string[], extra: Partial<Pile> = {}): Pile =>
  ({ id, x: 0, y: 0, forever: false, pin: false, lock: false, shut: false, seal: false, angle: 0, cards: cards.map((c) => ({ id: c })), shuffles: 0, ...extra }) as Pile;
const felt = (id: string, x = 0, y = 0, up = false): FeltCard => ({ id, x, y, up, angle: 0 });
const chair = (id: string, hand: string[]): Chair => ({ id, angle: 0, owner: id, hand: hand.map((c) => ({ id: c })) }) as unknown as Chair;
const snap = (s: { piles?: Pile[]; felt?: FeltCard[]; chairs?: Chair[] }): Snapshot =>
  ({ v: 1, people: [], chairs: s.chairs ?? [], piles: s.piles ?? [], felt: s.felt ?? [], trails: {}, locks: {}, picks: {}, rules: {}, admin: null }) as unknown as Snapshot;

describe("звуковые поводы", () => {
  it("карта с колоды на сукно — стук там, где легла", () => {
    expect(cuesBetween(snap({ piles: [pile("deck", ["a", "b"])] }), snap({ piles: [pile("deck", ["a"])], felt: [felt("b", 2, 3)] })))
      .toEqual([{ kind: "drop", at: { felt: { x: 2, y: 3 } } }]);
  });

  it("карту несли в воздухе (в кадре её не было) и положили — стук", () => {
    expect(cuesBetween(snap({}), snap({ felt: [felt("a", 4, 5)] }))).toEqual([{ kind: "drop", at: { felt: { x: 4, y: 5 } } }]);
    expect(cuesBetween(snap({ chairs: [chair("me", [])] }), snap({ chairs: [chair("me", ["a"])] }))).toEqual([{ kind: "hand", at: { chair: "me" } }]);
    expect(cuesBetween(snap({ chairs: [chair("me", ["a"])] }), snap({ felt: [{ id: "a", x: 1, y: 2, up: true }] as never, chairs: [chair("me", [])] }))).toEqual([{ kind: "out", at: { felt: { x: 1, y: 2 } } }]);
  });

  it("нажали и отпустили на месте — тишина; перевернули, пока держали, — переворот", () => {
    const known = new Map([["a", { in: "felt" as const, x: 1, y: 2, up: false }]]);
    expect(cuesBetween(snap({}), snap({ felt: [felt("a", 1, 2)] }), known)).toEqual([]);
    expect(cuesBetween(snap({}), snap({ felt: [felt("a", 1, 2, true)] }), known)).toEqual([{ kind: "turn", at: { felt: { x: 1, y: 2 } } }]);
  });

  it("карту переставили внутри руки — перестановка; тот же порядок — тишина", () => {
    const was = snap({ chairs: [chair("me", ["a", "b", "c"])] });
    expect(cuesBetween(was, snap({ chairs: [chair("me", ["b", "a", "c"])] }))).toEqual([{ kind: "sort", at: { chair: "me" } }]);
    expect(cuesBetween(was, snap({ chairs: [chair("me", ["a", "b", "c"])] }))).toEqual([]);
    // Карта ушла из руки на сукно — это вынос, а не перестановка: рука не звучит дважды.
    const out = cuesBetween(was, snap({ chairs: [chair("me", ["a", "b"])], felt: [felt("c", 1, 1)] }));
    expect(out.some((c) => c.kind === "sort")).toBe(false);
    expect(out).toEqual([{ kind: "out", at: { felt: { x: 1, y: 1 } } }]);
  });

  it("карту передвинули по сукну — тоже стук", () => {
    expect(cuesBetween(snap({ felt: [felt("a")] }), snap({ felt: [felt("a", 1, 1)] }))).toEqual([{ kind: "drop", at: { felt: { x: 1, y: 1 } } }]);
  });

  it("карта в руку — звук у того стула, в чью руку, свою или чужую", () => {
    expect(cuesBetween(snap({ felt: [felt("a")], chairs: [chair("me", []), chair("you", [])] }), snap({ chairs: [chair("me", []), chair("you", ["a"])] })))
      .toEqual([{ kind: "hand", at: { chair: "you" } }]);
  });

  it("переворот на месте — шелест переворота, на сукне и в стопке", () => {
    expect(cuesBetween(snap({ felt: [felt("a")] }), snap({ felt: [felt("a", 0, 0, true)] }))).toEqual([{ kind: "turn", at: { felt: { x: 0, y: 0 } } }]);
    const up = pile("p", ["a", "b"]);
    up.cards = up.cards.map((c) => ({ ...c, up: true }));
    expect(cuesBetween(snap({ piles: [pile("p", ["a", "b"])] }), snap({ piles: [up] }))).toEqual([{ kind: "turn", at: { pile: "p" } }]);
  });

  it("сукно в новую стопку — один звук сборки, а не по карте", () => {
    expect(cuesBetween(snap({ felt: [felt("a"), felt("b"), felt("c")] }), snap({ piles: [pile("new", ["a", "b", "c"])] })))
      .toEqual([{ kind: "gather", at: { pile: "new" } }]);
  });

  it("стопка в стопку — мерж", () => {
    expect(cuesBetween(snap({ piles: [pile("deck", ["a"]), pile("p", ["b", "c"])] }), snap({ piles: [pile("deck", ["a", "b", "c"])] })))
      .toEqual([{ kind: "merge", at: { pile: "deck" } }]);
  });

  it("одна карта в стопку — стук у стопки", () => {
    expect(cuesBetween(snap({ piles: [pile("deck", [])], felt: [felt("a")] }), snap({ piles: [pile("deck", ["a"])] }))).toEqual([{ kind: "drop", at: { pile: "deck" } }]);
  });

  it("стопку перенесли по столу — стук у стопки", () => {
    expect(cuesBetween(snap({ piles: [pile("p", ["a", "b"])] }), snap({ piles: [pile("p", ["a", "b"], { x: 3, y: 1 })] }))).toEqual([{ kind: "drop", at: { pile: "p" } }]);
  });

  it("перемешали — шафл; ничего не поменялось — тишина", () => {
    expect(cuesBetween(snap({ piles: [pile("deck", ["a", "b"])] }), snap({ piles: [pile("deck", ["b", "a"], { shuffles: 1 })] }))).toEqual([{ kind: "shuffle", at: { pile: "deck" } }]);
    const same = snap({ piles: [pile("deck", ["a"])], felt: [felt("b")] });
    expect(cuesBetween(same, same)).toEqual([]);
  });

  it("синк с кучей перемен звучит не больше, чем разрешено за кадр", () => {
    const prev = snap({ piles: [pile("deck", ["a", "b", "c", "d", "e", "f"])] });
    const next = snap({ felt: ["a", "b", "c", "d", "e", "f"].map((id, i) => felt(id, i, i)) });
    expect(cuesBetween(prev, next)).toHaveLength(CUES_PER_FRAME);
  });
});
