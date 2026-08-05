import { describe, expect, it } from "vitest";
import { faceUpInSlot } from "./faceUp";
import type { ElementDef, ZoneSpec } from "./spec";

// Правило вынесено из BoardScene: где житель лежит рубашкой — структурный факт (колода, свободная
// стопка, чужая рука), а не поле снимка.

const card: ElementDef = { id: "AS", kind: "card", face: "A♠" };
const chip: ElementDef = { id: "ch1", kind: "chip", denom: 5 };

const zones: ZoneSpec[] = [
  { id: "deck", title: "", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
  { id: "discard", title: "", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
  { id: "board", title: "", layout: { kind: "free" }, policy: { onOccupied: "merge" } },
  { id: "table", title: "", layout: { kind: "radial" }, policy: { onOccupied: "merge" } },
];

const at = (slot: string, def: ElementDef | undefined = card) => faceUpInSlot({ def, zones, slot });

describe("faceUpInSlot", () => {
  it("колода — рубашкой: её номинал не виден никому, пока карта её не покинула", () => {
    expect(at("deck:0")).toBe(false);
  });

  it("свободная зона — рубашкой в любом её слоте (и колода-слот, и брошенные стопки)", () => {
    expect(at("board:0")).toBe(false);
    expect(at("board:3")).toBe(false);
  });

  it("чужая рука — рубашкой (приватность)", () => {
    expect(at("seat:p2")).toBe(false);
  });

  it("сброс и стол — лицом: они для того и лежат, чтобы их видели", () => {
    expect(at("discard:0")).toBe(true);
    expect(at("table:0")).toBe(true);
  });

  it("не-карте вопрос не задаётся: у фишки нет рубашки", () => {
    expect(at("deck:0", chip)).toBe(true);
    expect(at("seat:p2", chip)).toBe(true);
  });

  it("незнакомая зона — лицом: прятать нечего, правил на неё нет", () => {
    expect(at("нетакой:0")).toBe(true);
  });

  it("другая pile-зона рубашкой НЕ становится — правило именно про колоду", () => {
    const asDeck = faceUpInSlot({ def: card, zones: [{ ...zones[0]!, id: "discard" }], slot: "discard:0" });
    expect(asDeck).toBe(true);
  });

  it("открытая рука (hand.hidden:false) показывает ЧУЖОЕ место лицом; скрытая/дефолт — рубашкой", () => {
    expect(faceUpInSlot({ def: card, zones, slot: "seat:p2", handHidden: false })).toBe(true);
    expect(faceUpInSlot({ def: card, zones, slot: "seat:p2", handHidden: true })).toBe(false);
    expect(faceUpInSlot({ def: card, zones, slot: "seat:p2" })).toBe(false); // нет конфига — приватность
  });
});
