// СТОПКИ НЕ ЛЕЖАТ ДРУГ НА ДРУГЕ: поставленная поверх другой отодвигается в свободное место; в стороне стоит где поставили.

import { describe, expect, it } from "vitest";
import { deal } from "./deal.js";
import { Table } from "./table.js";
import { MAIN_PILE, type Person } from "./contract.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const seated = () => { const t = new Table(deal().slice(0, 8), "a"); t.join(person("a")); t.join(person("b")); return t; };
const piles = (t: Table) => t.seenBy("a").piles;
/** Вторая стопка из двух карт. */
const second = (t: Table, at: { x: number; y: number }) => {
  const ids: string[] = [];
  for (const dx of [0, 0.3]) { const id = piles(t).find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id; t.act("a", { t: "grab", id }, 1); t.act("a", { t: "drop", id, to: { in: "felt", x: 3 + dx, y: 3, up: true, angle: 0 } }, 2); ids.push(id); }
  t.act("a", { t: "gather", ids, side: "keep", to: { x: at.x, y: at.y, angle: 0 } }, 3);
  return piles(t).find((p) => p.id !== MAIN_PILE)!;
};
const gap = (t: Table) => { const [a, b] = piles(t); return Math.hypot(a!.x - b!.x, a!.y - b!.y); };

describe("стопки не лежат друг на друге", () => {
  it("двинули стопку на другую — она отодвинулась, расстояние не меньше зазора", () => {
    const t = seated();
    t.act("a", { t: "deckMove", pile: MAIN_PILE, x: 0, y: 0 }, 0);
    const other = second(t, { x: -3, y: 0 });
    t.act("a", { t: "deckMove", pile: other.id, x: 0.2, y: 0.1 }, 4);
    expect(gap(t)).toBeGreaterThanOrEqual(1.44);
  });
  it("в стороне — стоит там, где поставили", () => {
    const t = seated();
    t.act("a", { t: "deckMove", pile: MAIN_PILE, x: 0, y: 0 }, 0);
    const other = second(t, { x: -3, y: 0 });
    t.act("a", { t: "deckMove", pile: other.id, x: -2.5, y: 1 }, 4);
    const now = piles(t).find((p) => p.id === other.id)!;
    expect(now).toMatchObject({ x: -2.5, y: 1 });
  });
  it("новая стопка из собранных карт, собранная поверх существующей, тоже не ложится на неё", () => {
    const t = seated();
    t.act("a", { t: "deckMove", pile: MAIN_PILE, x: 0, y: 0 }, 0);
    const other = second(t, { x: 0.1, y: 0.1 });
    const main = piles(t).find((p) => p.id === MAIN_PILE)!;
    expect(Math.hypot(other.x - main.x, other.y - main.y)).toBeGreaterThanOrEqual(1.44);
  });
});
