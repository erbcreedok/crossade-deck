// В КРЕСТОВОМ РУКА — ЭТО СЧЁТ. По числу карт видно, кто близок к выходу и кто останется последним,
// поэтому охапку в руку игрока не бросишь: только по одной карте. Стопку целиком принимает лишь
// крупье — он не играет, и его рука счёта не ведёт.

import { describe, expect, it } from "vitest";
import { deal } from "../deal.js";
import { deskOf } from "../desks.js";
import { Table } from "../table.js";
import { MAIN_PILE, type Person } from "../contract.js";
import { krestDesk } from "./krest.js";
import type { DeskAsk } from "../rules.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });

describe("правило рода: стопку — только крупье", () => {
  const ask = (croupier: string): DeskAsk => ({
    face: () => undefined,
    pile: () => [],
    hand: () => [],
    admin: () => false,
    croupier: (chair) => chair === croupier,
  });
  const desk = krestDesk(() => null);

  it("в руку игрока стопку не бросить", () => {
    expect(desk.mayPile(ask("c9"), "p1", { in: "hand", chair: "c1" }, "Аня")).toBe(false);
  });

  it("в руку крупье — можно", () => {
    expect(desk.mayPile(ask("c9"), "p1", { in: "hand", chair: "c9" }, "Аня")).toBe(true);
  });

  it("в стопку и на сукно — по-прежнему можно: запрет только про руки", () => {
    expect(desk.mayPile(ask("c9"), "p1", { in: "deck", pile: "другая" }, "Аня")).toBe(true);
    expect(desk.mayPile(ask("c9"), "p1", { in: "felt" }, "Аня")).toBe(true);
  });

  it("в песочнице запрета нет: там разрешено всё", () => {
    expect(deskOf("sandbox", () => null).mayPile(ask("c9"), "p1", { in: "hand", chair: "c1" }, "Аня")).toBe(true);
  });
});

describe("за столом крестового", () => {
  const krestTable = () => {
    const t = new Table(deal(), "Аня", deskOf("krest", () => null));
    t.join(person("Аня"));
    t.join(person("Боря"));
    return t;
  };
  const chairOf = (t: Table, who: string) => t.layout().chairs.find((c) => c.owner === who)!.id;

  it("КОЛОДУ В СВОЮ РУКУ НЕ ВЫСЫПАТЬ — отказ, и карты остались в колоде", () => {
    const t = krestTable();
    const was = t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!.cards.length;
    const out = t.act("Аня", { t: "pileDrop", pile: MAIN_PILE, to: { in: "hand", chair: chairOf(t, "Аня"), i: 0 } }, 0);
    expect("refused" in out ? out.refused : "ok").toBe("locked");
    expect(t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!.cards.length).toBe(was);
    expect(t.layout().chairs.find((c) => c.owner === "Аня")!.hand).toHaveLength(0);
  });

  it("и в чужую руку тоже", () => {
    const t = krestTable();
    const out = t.act("Аня", { t: "pileDrop", pile: MAIN_PILE, to: { in: "hand", chair: chairOf(t, "Боря"), i: 0 } }, 0);
    expect("refused" in out ? out.refused : "ok").toBe("locked");
  });

  it("а ПО ОДНОЙ КАРТЕ в руку — пожалуйста", () => {
    const t = krestTable();
    const top = t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
    t.act("Аня", { t: "grab", id: top }, 0);
    const out = t.act("Аня", { t: "drop", id: top, to: { in: "hand", chair: chairOf(t, "Аня"), i: 0 } }, 0);
    expect("refused" in out ? out.refused : "ok").toBe("ok");
    expect(t.layout().chairs.find((c) => c.owner === "Аня")!.hand).toHaveLength(1);
  });

  it("РУКА КРУПЬЕ ПРИНИМАЕТ СТОПКУ ЦЕЛИКОМ", () => {
    const t = krestTable();
    t.seatCroupier({ ...person("Крупье"), ink: "#fff" });
    const seat = t.layout().chairs.find((c) => c.croupier)!.id;
    const was = t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!.cards.length;
    const out = t.act("Аня", { t: "pileDrop", pile: MAIN_PILE, to: { in: "hand", chair: seat, i: 0 } }, 0);
    expect("refused" in out ? out.refused : "ok").toBe("ok");
    expect(t.layout().chairs.find((c) => c.croupier)!.hand).toHaveLength(was);
  });

  it("в песочнице колода высыпается в руку по-старому", () => {
    const t = new Table(deal(), "Аня", deskOf("sandbox", () => null));
    t.join(person("Аня"));
    const out = t.act("Аня", { t: "pileDrop", pile: MAIN_PILE, to: { in: "hand", chair: chairOf(t, "Аня"), i: 0 } }, 0);
    expect("refused" in out ? out.refused : "ok").toBe("ok");
  });
});
