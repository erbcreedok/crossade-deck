// ТУЛТИП КРИВОЙ КАРТЫ НЕ ДОЛЖЕН ГАСНУТЬ ЧЕРЕЗ МИГ ПОСЛЕ КАСАНИЯ.
//
// Жалоба владельца: «не получается тапать по кривым картам — тултип показывается на миллисекунду и
// испаряется». Причина не в касании: ключ места склеивался из сырых чисел, а они уплывают в
// последнем знаке при пересчёте. У ровной карты угол ровно `0`, дрейфа нет — оттого баг и цеплялся
// только к кривым.

import { describe, expect, it } from "vitest";
import type { Snapshot } from "../src/table/contract.js";
import { tipKeyOf } from "./tipKey.js";

const стол = (felt: { id: string; x: number; y: number; angle: number; up: boolean }[]): Snapshot =>
  ({ felt, piles: [], chairs: [] }) as unknown as Snapshot;

describe("tip.a-key-says-whether-the-card-moved-not-whether-bits-match", () => {
  it("ДРЕЙФ В ПОСЛЕДНЕМ ЗНАКЕ — НЕ ПЕРЕЕЗД: ключ тот же", () => {
    // Ровно те числа, что нашлись в живом столе: попросили угол, получили его же плюс 1e-14.
    const просили = стол([{ id: "c1", x: 1.234567, y: -2.345678, angle: -35.71723456, up: true }]);
    const вышло = стол([{ id: "c1", x: 1.2345671, y: -2.3456781, angle: -35.71723456000001, up: true }]);
    expect(tipKeyOf(вышло, "c1")).toBe(tipKeyOf(просили, "c1"));
  });

  it("ровная карта — тем более: у неё угол ровно ноль", () => {
    const a = стол([{ id: "c1", x: 0, y: 0, angle: 0, up: true }]);
    const b = стол([{ id: "c1", x: 0, y: 0, angle: -0, up: true }]);
    expect(tipKeyOf(b, "c1")).toBe(tipKeyOf(a, "c1"));
  });

  it("НАСТОЯЩИЙ ПЕРЕЕЗД ВИДЕН: сдвинули, повернули, перевернули", () => {
    const было = стол([{ id: "c1", x: 1, y: 1, angle: 30, up: true }]);
    const сдвинули = стол([{ id: "c1", x: 1.2, y: 1, angle: 30, up: true }]);
    const повернули = стол([{ id: "c1", x: 1, y: 1, angle: 35, up: true }]);
    const перевернули = стол([{ id: "c1", x: 1, y: 1, angle: 30, up: false }]);
    for (const [имя, стало] of [["сдвинули", сдвинули], ["повернули", повернули], ["перевернули", перевернули]] as const) {
      expect(tipKeyOf(стало, "c1"), имя).not.toBe(tipKeyOf(было, "c1"));
    }
  });

  it("в руке ключ — только чей стул: перестановка карт не переезд", () => {
    const рука = (ids: string[]): Snapshot =>
      ({ felt: [], piles: [], chairs: [{ id: "c3", hand: ids.map((id) => ({ id })) }] }) as unknown as Snapshot;
    expect(tipKeyOf(рука(["a", "b"]), "a")).toBe(tipKeyOf(рука(["b", "a"]), "a"));
    expect(tipKeyOf(рука(["a"]), "a")).toBe("hand:c3");
  });

  it("карты нет нигде — ключа нет", () => {
    expect(tipKeyOf(стол([]), "c1")).toBe(null);
  });
});
