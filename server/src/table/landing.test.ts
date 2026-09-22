// КУДА ЭТО МОЖНО ПОЛОЖИТЬ — один ответ для отказа и для подсветки.
//
// Закон: ответ зависит от того, ЧТО в руке. Карта и охапка — разные вещи, и место, принимающее одно,
// вправе не принять другое. Пока экран этого не спрашивал, он зажигал контуры на стульях, куда
// стопку всё равно не положат, — а игрок узнавал об этом отказом.

import { describe, it, expect } from "vitest";
import { lands } from "./landing.js";
import { deskOf } from "./desks.js";
import type { Snapshot } from "./contract.js";

const стол = (ход: Partial<Snapshot> = {}): Snapshot => ({
  v: 1,
  people: [],
  chairs: [
    { id: "c1", angle: 0, owner: "я", lock: false, hide: false, reject: false, forever: false, out: false, pose: { fan: true, shrink: false, tuck: false }, hand: [] },
    { id: "c2", angle: 180, owner: "сосед", lock: false, hide: false, reject: false, forever: false, out: false, pose: { fan: true, shrink: false, tuck: false }, hand: [] },
    { id: "c3", angle: 90, owner: "бот", croupier: true, lock: false, hide: false, reject: false, forever: false, out: false, pose: { fan: true, shrink: false, tuck: false }, hand: [] },
  ],
  piles: [
    { id: "deck", cards: [], shuffles: 0, x: 3, y: 0, angle: 0, below: [], forever: true, pin: false, lock: false, shut: false, seal: false },
    { id: "ring", cards: [], shuffles: 0, x: 0, y: 0, angle: 0, below: [], forever: true, pin: false, lock: false, shut: false, seal: false, pose: "ring", zone: true },
  ],
  felt: [],
  trails: {},
  locks: {},
  picks: {},
  rules: { dropEmptyChairs: true, faces: "classic", back: "plaid" },
  admin: "я",
  dealer: null,
  rights: ["hand.drop", "pile.drop"],
  play: null,
  ...ход,
});

const крест = deskOf("krest");
const песок = deskOf("sandbox");

describe("landing.one-law-for-refusal-and-for-glow", () => {
  it("карту круг принимает, охапку — нет", () => {
    const to = { in: "deck", pile: "ring" } as const;
    expect(lands(стол(), "я", "card", to, крест).yes).toBe(true);
    expect(lands(стол(), "я", "pile", to, крест).yes).toBe(false);
  });

  it("в крестовом охапку принимает только рука крупье", () => {
    expect(lands(стол(), "я", "pile", { in: "hand", chair: "c2", i: 0 }, крест).yes, "чужая рука").toBe(false);
    expect(lands(стол(), "я", "pile", { in: "hand", chair: "c1", i: 0 }, крест).yes, "и своя тоже").toBe(false);
    expect(lands(стол(), "я", "pile", { in: "hand", chair: "c3", i: 0 }, крест).yes, "а рука крупье — да").toBe(true);
  });

  it("а в песочнице охапку берёт любая рука: это правило крестового, не общее", () => {
    expect(lands(стол(), "я", "pile", { in: "hand", chair: "c2", i: 0 }, песок).yes).toBe(true);
  });

  it("карту чужая рука берёт, пока хозяин не заперся", () => {
    const to = { in: "hand", chair: "c2", i: 0 } as const;
    expect(lands(стол(), "я", "card", to, песок).yes).toBe(true);
    const заперт = стол({ chairs: стол().chairs.map((c) => (c.id === "c2" ? { ...c, lock: true } : c)) });
    expect(lands(заперт, "я", "card", to, песок).yes, "замок закрывает чужому").toBe(false);
    expect(lands(заперт, "сосед", "card", to, песок).yes, "а хозяину — нет").toBe(true);
  });

  it("отклонение закрывает руку всем, включая хозяина", () => {
    const тихо = стол({ chairs: стол().chairs.map((c) => (c.id === "c2" ? { ...c, reject: true } : c)) });
    expect(lands(тихо, "сосед", "card", { in: "hand", chair: "c2", i: 0 }, песок).yes).toBe(false);
  });

  it("закрытая стопка не принимает ничего", () => {
    const шут = стол({ piles: стол().piles.map((p) => (p.id === "deck" ? { ...p, shut: true } : p)) });
    expect(lands(шут, "я", "card", { in: "deck", pile: "deck" }, песок).yes).toBe(false);
    expect(lands(шут, "я", "pile", { in: "deck", pile: "deck" }, песок).yes).toBe(false);
  });

  it("запечатанная стопка берёт карту, но не охапку", () => {
    const печать = стол({ piles: стол().piles.map((p) => (p.id === "deck" ? { ...p, seal: true } : p)) });
    expect(lands(печать, "я", "card", { in: "deck", pile: "deck" }, песок).yes).toBe(true);
    expect(lands(печать, "я", "pile", { in: "deck", pile: "deck" }, песок).yes).toBe(false);
  });

  it("сукно принимает всё: там нет ни замков, ни правил", () => {
    expect(lands(стол(), "я", "pile", { in: "felt", x: 0, y: 0, up: true, angle: 0 }, крест).yes).toBe(true);
  });

  it("места, которого нет, не существует и для подсветки", () => {
    expect(lands(стол(), "я", "card", { in: "deck", pile: "нет-такой" }, песок).yes).toBe(false);
  });
});
