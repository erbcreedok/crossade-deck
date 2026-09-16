import { describe, expect, it } from "vitest";
import { croupierAngle } from "./ring.js";
import { plan } from "./script.js";
import { deal } from "./deal.js";
import { Table } from "./table.js";
import type { Person } from "./contract.js";

const bot: Person = { key: "bot:table", name: "CrossaderBot", door: "telegram", ink: "#fff", bot: true };
const man: Person = { key: "tg:1", name: "А", door: "telegram", ink: "#0f0" };

describe("крупье", () => {
  it("садится на десять часов от админа", () => {
    const table = new Table(deal(), man.key);
    table.join(man);
    const mine = table.seenBy(man.key).chairs.find((c) => c.owner === man.key)!;
    table.seatCroupier(bot);
    const his = table.seenBy(man.key).chairs.find((c) => c.croupier)!;
    expect(his.angle).toBe(croupierAngle(mine.angle));
    // Десять часов — это два часа против часовой от «напротив»: 240° от своей стороны.
    expect(croupierAngle(0)).toBe(240);
    expect(croupierAngle(120)).toBe(0);
  });

  it("раздача его стулу карт не даёт", () => {
    const table = new Table(deal(), man.key);
    table.join(man);
    table.seatCroupier(bot);
    const his = table.croupierChair()!.id;
    const people = [{ key: man.key, name: man.name, seat: table.seenBy(man.key).chairs.find((c) => c.owner === man.key)!.id }];
    const made = plan(table, { t: "deal", rule: "each", n: 3 }, people, man.key);
    expect("steps" in made).toBe(true);
    if (!("steps" in made)) return;
    const toHim = made.steps.filter((step) => step.t === "move" && step.to.in === "hand" && step.to.chair === his);
    expect(toHim).toHaveLength(0);
    // …а игрокам карты идут.
    expect(made.steps.some((step) => step.t === "move" && step.to.in === "hand")).toBe(true);
  });

  it("садится вне кольца, со своей рукой, и он один", () => {
    const table = new Table(deal(), man.key);
    table.join(man);
    table.seatCroupier(bot);
    const chairs = table.seenBy(man.key).chairs;
    const his = chairs.filter((c) => c.croupier);
    expect(his).toHaveLength(1);
    expect(his[0]!.croupier).toBe(true);
    expect(his[0]!.owner).toBe(bot.key);
    // Рука открыта, без замка и принимает карты — пока админ не решит иначе.
    expect(his[0]!.lock).toBe(false);
    expect(his[0]!.hide).toBe(false);
    expect(table.hasCroupier).toBe(true);
    // Второго не бывает.
    expect(table.seatCroupier(bot)).toEqual([]);
    expect(table.seenBy(man.key).chairs.filter((c) => c.croupier)).toHaveLength(1);
  });

  it("место игрока крупье не занимает", () => {
    const table = new Table(deal(), man.key);
    table.seatCroupier(bot);
    table.join(man);
    const mine = table.seenBy(man.key).chairs.find((c) => c.owner === man.key)!;
    expect(mine.croupier).toBeUndefined();
  });

  it("убрали — карты падают на стол закрытой стопкой, сам он уходит", () => {
    const table = new Table(deal(), man.key);
    table.join(man);
    table.seatCroupier(bot);
    const chair = table.croupierChair()!;
    const feltWas = table.seenBy(man.key).felt.length;
    chair.hand.push(...table.seenBy(man.key).piles[0]!.cards.slice(0, 3).map((c) => c.id));
    table.removeCroupier();
    const after = table.seenBy(man.key);
    expect(table.hasCroupier).toBe(false);
    expect(after.chairs.some((c) => c.croupier)).toBe(false);
    expect(after.people.some((p) => p.key === bot.key)).toBe(false);
    expect(after.felt.length).toBe(feltWas + 3);
  });
});
