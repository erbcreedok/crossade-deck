import { describe, expect, it } from "vitest";
import { SOLITAIRE_BOARD_CONFIG } from "./preset";

// Пасьянс — статичная схема поля: 13 слотов (сток, отбой, 4 фундамента, 7 колонок стола), все
// пустые при старте. onEmpty:"keep" — слоты структурные (не должны исчезать при опустошении),
// в отличие от свободных досок, где onEmpty по умолчанию "collapse".
describe("SOLITAIRE_BOARD_CONFIG", () => {
  it("содержит ровно 13 слотов", () => {
    expect(Object.keys(SOLITAIRE_BOARD_CONFIG.slots)).toHaveLength(13);
  });

  it("набор ключей слотов соответствует раскладке Клондайка", () => {
    const expectedKeys = [
      "stock",
      "waste",
      "found:S",
      "found:H",
      "found:D",
      "found:C",
      "tab:0",
      "tab:1",
      "tab:2",
      "tab:3",
      "tab:4",
      "tab:5",
      "tab:6",
    ];
    expect(new Set(Object.keys(SOLITAIRE_BOARD_CONFIG.slots))).toEqual(new Set(expectedKeys));
  });

  it("каждый слот — пустой контейнер", () => {
    for (const key of Object.keys(SOLITAIRE_BOARD_CONFIG.slots)) {
      expect(SOLITAIRE_BOARD_CONFIG.slots[key]).toEqual({ members: [] });
    }
  });

  it("сток — пустой контейнер", () => {
    expect(SOLITAIRE_BOARD_CONFIG.slots.stock!.members).toEqual([]);
  });

  it("onEmpty === 'keep' — слоты пасьянса структурные, не исчезают при опустошении", () => {
    expect(SOLITAIRE_BOARD_CONFIG.onEmpty).toBe("keep");
  });
});
