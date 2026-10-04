// ПЕРЕВОРОТ В ВОЗДУХЕ: угол, с которым несут карту, доходит до остальных; лишнее обрезается, без угла поля нет.

import { describe, expect, it } from "vitest";
import { deal } from "./deal.js";
import { Table } from "./table.js";
import type { Person } from "./contract.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const seated = () => { const t = new Table(deal(), "a"); t.join(person("a")); t.join(person("b")); return t; };
const felt = { in: "felt", x: 0, y: 0, up: false, angle: 0 } as const;

describe("carry.flip", () => {
  it("угол виден другому, чужой несущий угла не видит у себя", () => {
    const t = seated();
    const id = t.seenBy("a").piles[0]!.cards.at(-1)!.id;
    t.act("a", { t: "grab", id }, 0);
    t.carry("a", { id, over: felt, flip: 70 }, 1);
    expect(t.carriesSeenBy("b")[0]!.flip).toBe(70);
    expect(t.carriesSeenBy("a")).toEqual([]);
  });
  it("за пределами и не число — обрезается или отбрасывается", () => {
    const t = seated();
    const id = t.seenBy("a").piles[0]!.cards.at(-1)!.id;
    t.act("a", { t: "grab", id }, 0);
    t.carry("a", { id, over: felt, flip: 999 }, 1);
    expect(t.carriesSeenBy("b")[0]!.flip).toBe(180);
    t.carry("a", { id, over: felt, flip: Number.NaN }, 2);
    expect(t.carriesSeenBy("b")[0]!.flip).toBeUndefined();
    t.carry("a", { id, over: felt }, 3);
    expect(t.carriesSeenBy("b")[0]!.flip).toBeUndefined();
  });
});
