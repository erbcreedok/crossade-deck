import { describe, expect, it } from "vitest";
import { faceUpInSlot } from "./faceUp";
import type { ElementDef, ZoneSpec } from "./spec";

// Правило вынесено из BoardScene: где житель лежит рубашкой — структурный факт (колода, свободная
// стопка, чужая лента с hidden), а не поле снимка.

const card: ElementDef = { id: "AS", kind: "card", face: "A♠" };
const chip: ElementDef = { id: "ch1", kind: "chip", denom: 5 };

const zones: ZoneSpec[] = [
  { id: "deck", title: "", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
  { id: "discard", title: "", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
  { id: "board", title: "", layout: { kind: "free" }, policy: { onOccupied: "merge" } },
  { id: "table", title: "", layout: { kind: "radial" }, policy: { onOccupied: "merge" } },
  { id: "hand", title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" } },
];

const at = (slot: string, def: ElementDef | undefined = card) => faceUpInSlot({ def, zones, slot, selfSeat: "p1" });

describe("faceUpInSlot", () => {
  it("колода — рубашкой: её номинал не виден никому, пока карта её не покинула", () => {
    expect(at("deck:0")).toBe(false);
  });

  it("свободная зона — рубашкой в любом её слоте (и колода-слот, и брошенные стопки)", () => {
    expect(at("board:0")).toBe(false);
    expect(at("board:3")).toBe(false);
  });

  it("лента: своя — лицом владельцу, чужая — рубашкой (приватность, hidden дефолт true)", () => {
    expect(at("hand:p1")).toBe(true);
    expect(at("hand:p2")).toBe(false);
  });

  it("сброс и стол — лицом: они для того и лежат, чтобы их видели", () => {
    expect(at("discard:0")).toBe(true);
    expect(at("table:0")).toBe(true);
  });

  it("не-карте вопрос не задаётся: у фишки нет рубашки", () => {
    expect(at("deck:0", chip)).toBe(true);
    expect(at("hand:p2", chip)).toBe(true);
  });

  it("незнакомая зона — лицом: прятать нечего, правил на неё нет", () => {
    expect(at("нетакой:0")).toBe(true);
  });

  it("другая pile-зона рубашкой НЕ становится — правило именно про колоду", () => {
    const asDeck = faceUpInSlot({ def: card, zones: [{ ...zones[0]!, id: "discard" }], slot: "discard:0", selfSeat: "p1" });
    expect(asDeck).toBe(true);
  });

  it("открытая лента (hidden:false) показывает ЧУЖОЙ экземпляр лицом", () => {
    const open = zones.map((z) => (z.id === "hand" ? { ...z, hidden: false } : z));
    expect(faceUpInSlot({ def: card, zones: open, slot: "hand:p2", selfSeat: "p1" })).toBe(true);
  });
});
