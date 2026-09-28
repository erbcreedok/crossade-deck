import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "./migrations.js";
import { carryOwned, grantParts, ownedParts, visit } from "./tableOwnedRepo.js";

const fresh = () => {
  const d = new DatabaseSync(":memory:");
  for (const m of MIGRATIONS) m.up(d);
  return d;
};

describe("что есть у человека и его заходы", () => {
  it("выданное хранится, повтор не удваивает; гостевое переезжает на Telegram", () => {
    const d = fresh();
    expect(ownedParts("dev:a", d)).toEqual([]);
    grantParts("dev:a", ["spade-K:head", "spade-K:body"], "visit-2", 1, d);
    grantParts("dev:a", ["spade-K:head"], "visit-2", 2, d);
    expect(ownedParts("dev:a", d)).toEqual(["spade-K:body", "spade-K:head"]);
    carryOwned("dev:a", "tg:1", 3, d);
    expect(ownedParts("tg:1", d)).toEqual(["spade-K:body", "spade-K:head"]);
  });

  it("заход — после перерыва; перезагрузка через минуту — тот же заход", () => {
    const d = fresh();
    expect(visit("tg:2", 1000, 0, d)).toEqual({ visits: 1, fresh: true });
    expect(visit("tg:2", 1000, 500, d)).toEqual({ visits: 1, fresh: false });
    expect(visit("tg:2", 1000, 2000, d)).toEqual({ visits: 2, fresh: true });
  });
});
