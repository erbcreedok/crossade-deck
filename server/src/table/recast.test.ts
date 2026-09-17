// СМЕНА РОДА СТОЛА НА ХОДУ. Правила меняются, стол остаётся: карты, руки и стулья на местах.
//
// Ломается это тихо и обидно: либо места ушедшего рода остаются висеть навсегда, либо вместе с
// пустым местом сгребаются чужие карты, которые туда клали люди.

import { describe, expect, it } from "vitest";
import { deal } from "./deal.js";
import { deskOf } from "./desks.js";
import { Table } from "./table.js";
import { RING } from "./games/krest.js";
import { recast, openEntry, forgetAll, kindOf, attach } from "./lobby.js";
import type { Person } from "./contract.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const krest = () => deskOf("krest", () => null);
const sandbox = () => deskOf("sandbox", () => null);
const ringOf = (t: Table, who: string) => t.seenBy(who).piles.find((p) => p.id === RING);

describe("стол меняет род, не разгоняя стола", () => {
  it("песочница стала крестовым — на сукне появилось кольцо", () => {
    const t = new Table(deal(), "Аня", sandbox());
    t.join(person("Аня"));
    expect(ringOf(t, "Аня"), "в песочнице кольца нет").toBe(undefined);
    t.recast(krest());
    expect(ringOf(t, "Аня")?.pose).toBe("ring");
  });

  it("крестовый стал песочницей — пустое кольцо убрано", () => {
    const t = new Table(deal(), "Аня", krest());
    t.join(person("Аня"));
    t.recast(sandbox());
    expect(ringOf(t, "Аня")).toBe(undefined);
  });

  it("В КОЛЬЦЕ БЫЛИ КАРТЫ — оно остаётся обычной стопкой, а не исчезает вместе с ними", () => {
    const t = new Table(deal(), "Аня", krest());
    t.join(person("Аня"));
    const chair = t.layout().chairs.find((c) => c.owner === "Аня")!;
    const top = t.seenBy("Аня").piles.find((p) => p.id === "deck")!.cards.at(-1)!.id;
    t.act("Аня", { t: "grab", id: top }, 0);
    t.act("Аня", { t: "drop", id: top, to: { in: "hand", chair: chair.id, i: 0 } }, 0);
    t.act("Аня", { t: "grab", id: top }, 0);
    const laid = t.act("Аня", { t: "drop", id: top, to: { in: "deck", pile: RING } }, 0);
    expect("refused" in laid ? laid.refused : "ok").toBe("ok");

    t.recast(sandbox());
    const ring = ringOf(t, "Аня");
    expect(ring?.cards.map((c) => c.id), "карты на месте").toEqual([top]);
    expect(ring?.forever, "но место больше не вечное: опустеет — уйдёт само").toBe(false);
  });

  it("карты и руки смену рода переживают", () => {
    const t = new Table(deal(), "Аня", sandbox());
    t.join(person("Аня"));
    const before = t.seenBy("Аня").piles.find((p) => p.id === "deck")!.cards.length;
    t.recast(krest());
    expect(t.seenBy("Аня").piles.find((p) => p.id === "deck")!.cards.length).toBe(before);
    expect(t.layout().chairs.some((c) => c.owner === "Аня")).toBe(true);
  });

  it("версия стола выросла: клиентам есть что перечитать", () => {
    const t = new Table(deal(), "Аня", sandbox());
    const was = t.version;
    t.recast(krest());
    expect(t.version).toBeGreaterThan(was);
  });
});

describe("род комнаты в лобби", () => {
  it("смена рода записана в комнате и дошла до живого стола", () => {
    forgetAll();
    openEntry("r1", { kind: "inline", message: "m" }, "tg:1", "Стол", Date.now(), "sandbox");
    const heard: string[] = [];
    attach("r1", { people: () => [], close: () => {}, recast: (k) => heard.push(k) });
    const card = recast("r1", "krest");
    expect(card?.kind).toBe("krest");
    expect(kindOf("r1")).toBe("krest");
    expect(heard, "живой стол узнал о смене").toEqual(["krest"]);
  });

  it("незнакомый род — отказ, а не тихая песочница", () => {
    forgetAll();
    openEntry("r2", { kind: "inline", message: "m" }, "tg:1", "Стол", Date.now(), "krest");
    expect(recast("r2", "преферанс")).toBe(undefined);
    expect(kindOf("r2"), "род остался прежним").toBe("krest");
  });
});
