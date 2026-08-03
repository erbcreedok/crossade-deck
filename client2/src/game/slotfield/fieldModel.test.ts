import { describe, it, expect } from "vitest";
import { wrapRule } from "./fieldModel";
import type { SlotField } from "./slotField";

describe("wrapRule", () => {
  it("нет правила → undefined", () => {
    expect(wrapRule(undefined, {})).toBeUndefined();
  });
  it("прокидывает лица груза/верхней карты цели и ключ", () => {
    const rule = wrapRule((fig, top, key) => `${fig}|${top}|${key}` === "Q♥|K♠|0,1", { f0: "Q♥", t0: "K♠" });
    const board: SlotField = { slots: { "0,1": { members: ["t0"] } }, onEmpty: "keep" };
    expect(rule!({ figureId: "f0", fromKey: "0,0", toKey: "0,1", board })).toBe(true);
    // пустой целевой слот → top=null
    const empty: SlotField = { slots: { "0,2": { members: [] } }, onEmpty: "keep" };
    const rule2 = wrapRule((fig, top) => top === null, { f0: "Q♥" });
    expect(rule2!({ figureId: "f0", fromKey: "0,0", toKey: "0,2", board: empty })).toBe(true);
  });
});
