import { describe, expect, it } from "vitest";
import type { RoomCard } from "../../../server/src/table/contract.js";
import { MENU, menuOf, parseOrder, refusedSay } from "./orders.js";

const card: RoomCard = { room: "R".repeat(23), title: "Дурак", by: "tg:1", home: { kind: "chat", chat: "-1" }, people: [], seats: [], createdAt: 0, kind: "sandbox", crew: "sandbox", admins: [] };

describe("команды комнаты в чате", () => {
  it("крупье: сажается и уводится словом и кнопкой", () => {
    expect(parseOrder("croupier", "")).toEqual({ t: "croupier", on: true });
    expect(parseOrder("croupier", "убрать")).toEqual({ t: "croupier", on: false });
    expect(parseOrder("croupier", "чепуха")).toBeNull();
    expect(MENU.cr1!.command).toEqual({ t: "croupier", on: true });
    expect(MENU.cr0!.command).toEqual({ t: "croupier", on: false });
    const rows = menuOf(card).rows.flat();
    expect(rows.some((b) => "data" in b && b.data === `tbr:${card.room}:cr1`)).toBe(true);
  });

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

  it("вид колоды: лица, рубашка или оба; чужое слово — подсказка", () => {
    expect(parseOrder("deck", "minimal")).toEqual({ t: "look", faces: "minimal" });
    expect(parseOrder("deck", "Plaid classic")).toEqual({ t: "look", faces: "classic", back: "plaid" });
    expect(parseOrder("deck", "")).toBeNull();
    expect(parseOrder("deck", "ink gothic")).toBeNull();
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

describe("меню знает род комнаты", () => {
  const kinds = [{ id: "sandbox", name: "песочница" }, { id: "krest", name: "крестовый" }];
  const table = { ...card, kind: "sandbox" };

  it("род назван в тексте, и на него есть кнопки", () => {
    const said = menuOf(table, kinds);
    expect(said.text).toContain("игра: песочница");
    const row = said.rows.find((r) => r[0]!.text === "Род:")!;
    expect(row.map((b) => b.text)).toEqual(["Род:", "• песочница", "крестовый"]);
    expect(row.at(-1)).toEqual({ text: "крестовый", data: `tbk:${table.room}:krest` });
  });

  it("нынешний род нажатием ничего не меняет", () => {
    const here = menuOf(table, kinds).rows.find((r) => r[0]!.text === "Род:")![1]!;
    expect(here).toEqual({ text: "• песочница", data: "tbx" });
  });

  it("переименовать и закрыть — из того же меню", () => {
    const row = menuOf(table, kinds).rows.find((r) => r[0]!.text === "Комната:")!;
    expect(row.map((b) => b.text)).toEqual(["Комната:", "Переименовать", "Закрыть"]);
  });

  it("род один — выбирать нечего, ряда нет", () => {
    expect(menuOf(table, [kinds[0]!]).rows.some((r) => r[0]!.text === "Род:")).toBe(false);
  });
});

describe("роли в меню комнаты", () => {
  const kinds = [{ id: "sandbox", name: "песочница" }];
  const withPeople = {
    ...card,
    kind: "sandbox",
    crew: "sandbox",
    admins: [] as string[],
    people: [
      { key: "tg:1", name: "Хозяин", ink: "#fff", door: "telegram" as const },
      { key: "tg:2", name: "Гость", ink: "#fff", door: "telegram" as const },
    ],
  };

  it("ХОЗЯИН ВИДИТ РОЛИ И «ЗАКРЫТЬ»", () => {
    const said = menuOf(withPeople, kinds, "tg:1");
    const roles = said.rows.find((r) => r[0]!.text === "Роли:");
    expect(roles, "ряд ролей есть").toBeDefined();
    const row = said.rows.find((r) => r[0]!.text === "Гость")!;
    expect(row[1]).toEqual({ text: "Сделать распорядителем", data: `tba:1:${card.room}:tg:2` });
    expect(said.rows.some((r) => r.some((b) => b.text === "Закрыть"))).toBe(true);
  });

  it("выданный распорядитель помечен, и кнопка становится «Забрать»", () => {
    const said = menuOf({ ...withPeople, admins: ["tg:2"] }, kinds, "tg:1");
    const row = said.rows.find((r) => r[0]!.text.includes("Гость"))!;
    expect(row[0]!.text).toContain("★");
    expect(row[1]).toEqual({ text: "Забрать", data: `tba:0:${card.room}:tg:2` });
  });

  it("РАСПОРЯДИТЕЛЬ РОЛЕЙ НЕ ВИДИТ И КОМНАТУ НЕ ЗАКРЫВАЕТ", () => {
    const said = menuOf({ ...withPeople, admins: ["tg:2"] }, kinds, "tg:2");
    expect(said.rows.some((r) => r[0]!.text === "Роли:"), "ролей нет").toBe(false);
    expect(said.rows.some((r) => r.some((b) => b.text === "Закрыть")), "и «Закрыть» нет").toBe(false);
    expect(said.rows.some((r) => r.some((b) => b.text === "Переименовать")), "а переименовать может").toBe(true);
  });

  it("за столом никого — говорим об этом, а не рисуем пустой ряд", () => {
    const said = menuOf({ ...withPeople, people: [] }, kinds, "tg:1");
    expect(said.rows.some((r) => r[0]!.text.includes("ещё никого"))).toBe(true);
  });
});
