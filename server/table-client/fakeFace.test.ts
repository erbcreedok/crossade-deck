import { describe, expect, it } from "vitest";
import { deal } from "../src/table/deal.js";
import { Table } from "../src/table/table.js";
import type { Person } from "../src/table/contract.js";
import { fakeFace, maskFaces, shownNow } from "./fakeFace.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });

describe("подставные лица в реплее", () => {
  it("лицо карты считается от её номера: одно и то же, без случайности", () => {
    expect(fakeFace("c7")).toEqual(fakeFace("c7"));
    const faces = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(fakeFace(`карта-${i}`))));
    expect(faces.size).toBeGreaterThan(10);
  });

  it("лицо остаётся, только если игрок видит эту карту и сейчас; у остальных — подставное; места карт не меняются", () => {
    const t = new Table(deal(), "a");
    t.join(person("a")); t.join(person("b"));
    const truth = t.seenBy("", true);
    const forB = t.seenBy("b");
    const shown = shownNow(forB);
    const past = maskFaces(truth, shown);
    for (const c of [...past.chairs.flatMap((x) => x.hand), ...past.piles.flatMap((p) => p.cards), ...past.felt]) {
      if (shown.has(c.id)) continue;
      const real = [...truth.chairs.flatMap((x) => x.hand), ...truth.piles.flatMap((p) => p.cards), ...truth.felt].find((x) => x.id === c.id)!;
      if (real.face) expect(c.face, `${c.id}: лицо должно быть подставным`).toEqual(fakeFace(c.id));
    }
    // Структура не тронута.
    expect(past.piles.map((p) => p.cards.map((c) => c.id))).toEqual(truth.piles.map((p) => p.cards.map((c) => c.id)));
    // Исходный снимок не испорчен.
    expect(truth.piles[0]!.cards.some((c) => c.face)).toBe(true);
  });
});
