import { describe, expect, it } from "vitest";
import type { RoomCard } from "../../../server/src/table/contract.js";
import { dealMenu, MENU, menuOf, parseOrder, refusedSay, seatCard, seatMenu } from "./orders.js";

const card: RoomCard = { room: "R".repeat(23), title: "Дурак", by: "tg:1", home: { kind: "chat", chat: "-1" }, people: [], seats: [], deck: { size: 36, jokers: false }, createdAt: 0, kind: "sandbox", crew: "sandbox", admins: [] };

describe("команды комнаты в чате", () => {
  it("крупье: сажается и уводится словом и кнопкой", () => {
    expect(parseOrder("croupier", "")).toEqual({ t: "croupier", on: true });
    expect(parseOrder("croupier", "убрать")).toEqual({ t: "croupier", on: false });
    expect(parseOrder("croupier", "чепуха")).toBeNull();
    // В МЕНЮ КРУПЬЕ НЕТ: в крестовом он есть всегда, и сажать его кнопкой незачем.
    const rows = menuOf(card).rows.flat();
    expect(rows.some((b) => b.text.includes("рупье") && "data" in b && b.data.startsWith("tbr:"))).toBe(false);
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
    seats: [
      { id: "c1", who: { key: "tg:1", name: "Хозяин" }, cards: 0 },
      { id: "c2", who: { key: "tg:2", name: "Гость" }, cards: 0 },
    ],
  };

  it("ХОЗЯИН ВИДИТ ВЫДАЧУ РАСПОРЯДИТЕЛЯ И «ЗАКРЫТЬ»", () => {
    const said = menuOf(withPeople, kinds, "tg:1");
    expect(said.rows.some((r) => r[0]!.text === "Рассадка"), "вход в рассадку есть").toBe(true);
    expect(said.rows.some((r) => r.some((b) => b.text === "Закрыть"))).toBe(true);
    const guest = seatCard(withPeople, "c2", true);
    expect(guest.rows.some((r) => "data" in r[0]! && r[0]!.data === `tba:1:${card.room}:tg:2`), "гостю можно выдать").toBe(true);
  });

  it("выданный распорядитель помечен звёздочкой, и кнопка становится «Забрать»", () => {
    const given = { ...withPeople, admins: ["tg:2"], seats: [{ id: "c2", who: { key: "tg:2", name: "Гость" }, cards: 0, admin: true as const }] };
    expect(seatMenu(given).rows[0]![0]!.text).toContain("★");
    const said = seatCard(given, "c2", true);
    expect(said.rows.some((r) => r[0]!.text === "Забрать распорядителя" && "data" in r[0]! && r[0]!.data === `tba:0:${card.room}:tg:2`)).toBe(true);
  });

  it("РАСПОРЯДИТЕЛЬ РОЛЕЙ НЕ ВИДИТ И КОМНАТУ НЕ ЗАКРЫВАЕТ", () => {
    const said = menuOf({ ...withPeople, admins: ["tg:2"] }, kinds, "tg:2");
    expect(seatCard(withPeople, "c2", false).rows.some((r) => r.some((b) => "data" in b && b.data.startsWith("tba:"))), "выдачи ролей нет").toBe(false);
    expect(said.rows.some((r) => r.some((b) => b.text === "Закрыть")), "и «Закрыть» нет").toBe(false);
    expect(said.rows.some((r) => r.some((b) => b.text === "Переименовать")), "а переименовать может").toBe(true);
  });

  it("за столом никого — рассадка всё равно даёт поставить стул", () => {
    const said = seatMenu({ ...withPeople, people: [], seats: [] });
    expect(said.rows.some((r) => r.some((b) => b.text === "Поставить стул"))).toBe(true);
  });
});

describe("меню крестового: по одному решению в секторе", () => {
  const room = card.room;
  const full = {
    ...card,
    kind: "krest",
    deck: { size: 52 as const, jokers: true },
    seats: [
      { id: "c1", who: { key: "tg:1", name: "Хозяин" }, cards: 6 },
      { id: "c2", who: { key: "tg:2", name: "Гость" }, cards: 0, dealer: true as const },
      { id: "c3", cards: 0 },
    ],
  };

  it("КОЛОДА И ДЖОКЕРЫ — РАЗНЫЕ СЕКТОРЫ, и нынешнее отмечено", () => {
    const said = menuOf(full, [{ id: "krest", name: "крестовый" }], "tg:1");
    const deck = said.rows.find((r) => r[0]!.text === "Колода:")!;
    expect(deck.map((b) => b.text)).toEqual(["Колода:", "36", "• 52"]);
    const jokers = said.rows.find((r) => r[0]!.text === "Джокеры:")!;
    expect(jokers.map((b) => b.text)).toEqual(["Джокеры:", "• Вкл", "Выкл"]);
    // Переключая джокеры, размер не теряется — и наоборот.
    expect(jokers[2]).toEqual({ text: "Выкл", data: `tbd:${room}:52:0` });
    expect(deck[1]).toEqual({ text: "36", data: `tbd:${room}:36:1` });
  });

  it("БЕЛКИ, ПРЕСЕТОВ И КРУПЬЕ В МЕНЮ НЕТ", () => {
    const texts = menuOf(full, [], "tg:1").rows.flat().map((b) => b.text.toLowerCase());
    for (const gone of ["белка", "пресет", "посадить", "увести"]) expect(texts.some((t) => t.includes(gone)), gone).toBe(false);
  });

  it("РОД МЕНЯЕТ ТОЛЬКО ХОЗЯИН", () => {
    const kinds = [{ id: "krest", name: "крестовый" }, { id: "sandbox", name: "песочница" }];
    expect(menuOf(full, kinds, "tg:1").rows.some((r) => r[0]!.text === "Род:"), "хозяину видно").toBe(true);
    expect(menuOf(full, kinds, "tg:9").rows.some((r) => r[0]!.text === "Род:"), "прочим — нет").toBe(false);
  });

  it("РАССАДКА ЖИВЁТ ОТДЕЛЬНЫМ ЭКРАНОМ, а в главном меню — одна кнопка", () => {
    const said = menuOf(full, [], "tg:1");
    expect(said.rows.at(-1)).toEqual([{ text: "Рассадка", data: `tbz:${room}` }]);
    // Ни стульев, ни действий над ними в главном меню нет: оно от них и разрослось.
    expect(said.rows.some((r) => r.some((b) => "data" in b && b.data.startsWith("tbs:"))), "действий рассадки нет").toBe(false);
    expect(said.rows.some((r) => r[0]!.text.includes("Хозяин")), "и стульев нет").toBe(false);
  });

  it("СПИСОК СТУЛЬЕВ: строка на стул, у каждого «Пересадить», и есть куда вернуться", () => {
    const said = seatMenu(full);
    expect(said.rows[0]).toEqual([{ text: "Хозяин · 6", data: `tbn:${room}:c1` }, { text: "Пересадить", data: `tbz:${room}:c1` }]);
    expect(said.rows[2]![0]!.text).toBe("пустой стул");
    expect(said.rows.at(-1)).toEqual([{ text: "Поставить стул", data: `tbs:add:${room}:-` }, { text: "‹ Назад", data: `tbm:${room}` }]);
  });

  it("ПЕРЕСАДКА В ДВА НАЖАТИЯ: взятый стул помечен, у остальных «сюда»", () => {
    const said = seatMenu(full, "c1");
    expect(said.rows[0]).toEqual([{ text: "⇅ Хозяин · 6", data: `tbz:${room}` }]);
    expect(said.rows[1]![1]).toEqual({ text: "сюда", data: `tbv:${room}:c1:c2` });
    expect(said.text).toContain("Хозяин");
  });

  it("СТУЛ: карты забирают только у того, у кого они есть; раздающему роль повторно не дают", () => {
    const mine = seatCard(full, "c1", true);
    expect(mine.rows.some((r) => "data" in r[0]! && r[0]!.data === `tbs:sweep:${room}:c1`), "есть куда забрать").toBe(true);
    expect(mine.rows.some((r) => "data" in r[0]! && r[0]!.data === `tbs:dealer:${room}:c1`), "раздающим можно").toBe(true);
    const guest = seatCard(full, "c2", true);
    expect(guest.rows.some((r) => "data" in r[0]! && r[0]!.data.startsWith("tbs:sweep")), "у пустой руки карт не забирают").toBe(false);
    expect(guest.rows.some((r) => "data" in r[0]! && r[0]!.data.startsWith("tbs:dealer")), "он и так раздающий").toBe(false);
    expect(guest.rows.some((r) => "data" in r[0]! && r[0]!.data === `tbs:kick:${room}:c2`), "выгнать можно").toBe(true);
    const empty = seatCard(full, "c3", true);
    expect(empty.rows.some((r) => r.some((b) => "data" in b && b.data.startsWith("tbs:kick"))), "пустой стул выгонять некого").toBe(false);
    // ВЫДАЧА РАСПОРЯДИТЕЛЯ — только хозяину, и не себе.
    expect(seatCard(full, "c2", false).rows.some((r) => "data" in r[0]! && r[0]!.data.startsWith("tba:")), "прочим не видно").toBe(false);
    expect(seatCard(full, "c1", true).rows.some((r) => "data" in r[0]! && r[0]!.data.startsWith("tba:")), "себе не выдают").toBe(false);
  });

  it("МЕНЮ РАЗДАЧИ: отмеченные стулья и один первый", () => {
    const said = dealMenu(full, "p1", { seats: ["c1", "c2"], from: "c2" });
    const mine = said.rows.find((r) => r[0]!.text.includes("Хозяин"))!;
    expect(mine[0]!.text).toBe("✓ Хозяин");
    expect(mine[1]).toEqual({ text: "начать с него", data: "tbw:p1:c1" });
    const guest = said.rows.find((r) => r[0]!.text.includes("Гость"))!;
    expect(guest[1]!.text, "первый — один").toBe("• первый");
    const empty = said.rows.find((r) => r[0]!.text === "пустой стул")!;
    expect(empty, "невыбранный стул можно включить").toEqual([{ text: "пустой стул", data: "tbq:p1:c3" }]);
    expect(said.rows.at(-1)).toEqual([{ text: "Раздать", data: "tbe:p1" }]);
  });
});
