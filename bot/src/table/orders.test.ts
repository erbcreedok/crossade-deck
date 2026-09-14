import { describe, expect, it } from "vitest";
import type { RoomCard } from "../../../server/src/table/contract.js";
import { MENU, menuOf, parseOrder, refusedSay } from "./orders.js";

const card: RoomCard = { room: "R".repeat(23), title: "Дурак", home: { kind: "chat", chat: "-1" }, people: [], createdAt: 0 };

describe("команды стола в чате", () => {
  it("сборка и перемешивание — без слов", () => {
    expect(parseOrder("collect", "")).toEqual({ t: "collect" });
    expect(parseOrder("shuffle", "")).toEqual({ t: "shuffle" });
    expect(parseOrder("shuffle", "всё")).toBeNull();
  });

  it("пресеты: колода отдельно, белка всегда 36", () => {
    expect(parseOrder("durak", "")).toEqual({ t: "preset", game: "durak", size: 36 });
    expect(parseOrder("krest", "52 jokers")).toEqual({ t: "preset", game: "krest", size: 52, jokers: true });
    expect(parseOrder("belka", "")).toEqual({ t: "preset", game: "belka" });
    expect(parseOrder("durak", "54")).toBeNull();
  });

  it("раздача: правило, раздающий и флаги", () => {
    expect(parseOrder("deal", "3")).toEqual({ t: "deal", rule: "each", n: 3 });
    expect(parseOrder("deal", "krest @Cemal -as-dealer -skip-empty")).toEqual({ t: "deal", rule: "krest", dealer: "@Cemal", asDealer: true, skipEmpty: true });
    expect(parseOrder("deal", "durak -force")).toEqual({ t: "deal", rule: "durak", force: true });
    expect(parseOrder("deal", "")).toBeNull();
    expect(parseOrder("deal", "poker")).toBeNull();
    expect(parseOrder("deal", "3 -wat")).toBeNull();
  });

  it("кнопки меню влезают в 64 байта callback_data и все ведут в команду", () => {
    const said = menuOf(card);
    for (const b of said.rows.flat()) if ("data" in b) expect(Buffer.byteLength(b.data)).toBeLessThanOrEqual(64);
    const codes = said.rows.flat().flatMap((b) => ("data" in b && b.data.startsWith("tbr:") ? [b.data.split(":")[2]!] : []));
    expect(codes.every((c) => MENU[c])).toBe(true);
    expect(codes).toHaveLength(Object.keys(MENU).length);
  });

  it("не собрано — кнопка «Собрать и раздать»", () => {
    expect(refusedSay("needs-collect", "r", "p1").rows[0]![0]).toEqual({ text: "Собрать и раздать", data: "tbf:r:p1" });
    expect(refusedSay("busy", "r", "p1").rows).toEqual([]);
  });
});
