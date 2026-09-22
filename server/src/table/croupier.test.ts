import { describe, expect, it } from "vitest";
import { croupierAngle } from "./ring.js";
import { plan } from "./script.js";
import { deal } from "./deal.js";
import { Table } from "./table.js";
import { MAIN_PILE, type Person } from "./contract.js";
import { deskOf } from "./desks.js";

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

  it("КОЛОДА В ЕГО РУКАХ — ПУСТОГО КОНТУРА НА СУКНЕ НЕТ, если род стола колоду не держит: ни после смены колоды, ни после убранных карт", () => {
    const table = new Table(deal(), man.key, deskOf("krest"));
    table.join(man);
    table.seatCroupier(bot);
    const his = table.croupierChair()!.id;
    // Колода целиком в руки крупье — контур ушёл вместе с последней картой.
    expect("ops" in table.act(man.key, { t: "pileDrop", pile: MAIN_PILE, to: { in: "hand", chair: his, i: 0 } }, 0)).toBe(true);
    expect(table.seenBy(man.key).piles.some((p) => p.id === MAIN_PILE)).toBe(false);
    // Новая колода при смене ложится ему же в руки — и контура на сукне не появляется.
    const faces = table.layout().chairs.find((c) => c.id === his)!.hand.map((id) => table.faceOf(id)!);
    expect(table.restock(faces)).not.toBeNull();
    expect(table.seenBy(man.key).piles.some((p) => p.id === MAIN_PILE), "после смены колоды").toBe(false);
    // Карты убрали со стола совсем — опустевшая стопка уходит следом.
    const fresh = new Table(deal(), man.key, deskOf("krest"));
    fresh.join(man);
    fresh.unmake(fresh.layout().deck);
    expect(fresh.seenBy(man.key).piles.some((p) => p.id === MAIN_PILE), "после unmake").toBe(false);
    // Слепок с пустой вечной колодой (песочница) поднят как крестовый — контур не поднимается с ним.
    const sand = new Table(deal(), man.key);
    sand.join(man);
    sand.unmake(sand.layout().deck);
    expect(sand.seenBy(man.key).piles.some((p) => p.id === MAIN_PILE), "в песочнице колода вечная").toBe(true);
    const raised = Table.restore(sand.dump(), man.key, deskOf("krest"));
    expect(raised.seenBy(man.key).piles.some((p) => p.id === MAIN_PILE), "после подъёма слепка").toBe(false);
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
