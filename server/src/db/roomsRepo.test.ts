// СТОРОЖ `rooms.the-room-is-a-record-not-a-process`.
//
// Пока комната была процессом, её код жил в памяти: последний вышедший уносил стол вместе с кодом,
// а ссылка на этот код молча открывала НОВЫЙ стол — человек думал, что пришёл к друзьям, и сидел
// один. Здесь проверяется обратное: код принадлежит комнате, освобождается только закрытием, а
// комната переживает пустоту, потому что принадлежит человеку.

import { describe, expect, it, beforeEach } from "vitest";
import { openDb } from "./open.js";
import {
  addMember,
  cleanCode,
  CODE_DIGITS,
  closeRoom,
  findRooms,
  freeCode,
  insertRoom,
  membersOf,
  removeMember,
  roleOf,
  roomByCode,
  roomById,
  roomsOfAccount,
  touchRoom,
} from "./roomsRepo.js";

let at: ReturnType<typeof openDb>;

beforeEach(() => {
  at = openDb(":memory:");
  at.prepare(
    `INSERT INTO accounts (id, name, name_chosen, color, avatar, created_at, recovery_hash)
     VALUES ('me', 'Ербол', 1, NULL, NULL, 1, 'h1'), ('you', 'Драный олень', 0, NULL, NULL, 1, 'h2')`,
  ).run();
});

const open = (o: Parameters<typeof insertRoom>[0]) => insertRoom(o, at)!;

describe("rooms.the-room-is-a-record-not-a-process", () => {
  it("у комнаты есть код, и по нему её находят", () => {
    const room = open({ id: "r1", game: "cards", ownerAccount: "me" });
    // ВЫДАННЫЙ КОД — ТОЛЬКО ЦИФРЫ: его диктуют вслух, а буквы называются по-разному.
    expect(room.code).toMatch(/^\d{4}$/);
    for (const sign of room.code!) expect(CODE_DIGITS).toContain(sign);
    expect(roomByCode(room.code!, at)?.id).toBe("r1");
  });

  it("два живых стола не делят один код", () => {
    const codes = new Set<string>();
    for (let n = 0; n < 30; n++) codes.add(open({ id: `r${n}`, game: "cards" }).code!);
    expect(codes.size).toBe(30);
  });

  it("код освобождается закрытием, а не пустотой", () => {
    const room = open({ id: "r1", game: "cards", ownerAccount: "me" });
    const code = room.code!;

    // Все вышли — запись жива, код всё ещё её.
    touchRoom("r1", 2, at);
    expect(roomByCode(code, at)?.id).toBe("r1");

    closeRoom("r1", 3, at);
    expect(roomByCode(code, at)).toBeUndefined();
    expect(roomById("r1", at)?.code).toBeNull();
  });

  it("закрытые комнаты не спорят за код между собой", () => {
    open({ id: "r1", game: "cards" });
    open({ id: "r2", game: "cards" });
    closeRoom("r1", 3, at);
    closeRoom("r2", 4, at);
    expect(roomById("r1", at)?.closedAt).toBe(3);
    expect(roomById("r2", at)?.closedAt).toBe(4);
  });

  it("свой код можно назвать буквами — их разрешено только выбранным", () => {
    const named = open({ id: "r1", game: "cards", code: "kamaz" });
    expect(named.code).toBe("KAMAZ");

    // Тот же код второй раз — комната получит выданный (и он будет из цифр), а не чужой.
    const other = open({ id: "r2", game: "cards", code: "KAMAZ" });
    expect(other.code).not.toBe("KAMAZ");
    expect(other.code).toMatch(/^\d{4}$/);
  });

  it("кривой код кодом не считается", () => {
    expect(cleanCode("A")).toBeUndefined();
    expect(cleanCode("ABCDEFGHI")).toBeUndefined();
    expect(cleanCode("ма фт")).toBeUndefined();
    expect(cleanCode("стол")).toBeUndefined();
    expect(cleanCode(" maft ")).toBe("MAFT");
    expect(cleanCode("0244")).toBe("0244");
  });
});

describe("три оси, а не один тумблер", () => {
  it("скрытая комната не показывается в поиске, но остаётся моей", () => {
    open({ id: "r1", game: "cards", ownerAccount: "me", visibility: "hidden" });
    expect(findRooms({}, at)).toEqual([]);
    expect(roomsOfAccount("me", at).map((one) => one.id)).toEqual(["r1"]);
  });

  it("видимость и допуск независимы: публичная по коду — обычное дело", () => {
    const room = open({ id: "r1", game: "cards", visibility: "public", admission: "code" });
    expect(findRooms({}, at).map((one) => one.id)).toEqual(["r1"]);
    expect(room.admission).toBe("code");
    expect(room.transport).toBe("server");
  });

  it("поиск знает про игру и не показывает закрытые", () => {
    open({ id: "r1", game: "cards" });
    open({ id: "r2", game: "chess" });
    open({ id: "r3", game: "cards" });
    closeRoom("r3", 5, at);
    expect(findRooms({ game: "cards" }, at).map((one) => one.id)).toEqual(["r1"]);
  });

  it("свежие сверху", () => {
    open({ id: "r1", game: "cards", now: 1 });
    open({ id: "r2", game: "cards", now: 2 });
    touchRoom("r1", 9, at);
    expect(findRooms({}, at).map((one) => one.id)).toEqual(["r1", "r2"]);
  });
});

describe("вечная комната принадлежит человеку", () => {
  it("хозяин записан в неё с ролью хозяина", () => {
    open({ id: "r1", game: "cards", ownerAccount: "me" });
    expect(roleOf("r1", "me", at)).toBe("owner");
    expect(membersOf("r1", at).map((one) => one.accountId)).toEqual(["me"]);
  });

  it("вошедший становится членом и видит комнату среди своих", () => {
    open({ id: "r1", game: "cards", ownerAccount: "me" });
    addMember("r1", "you", "player", true, 2, at);
    expect(roomsOfAccount("you", at).map((one) => one.id)).toEqual(["r1"]);
  });

  it("хозяина из своей комнаты выписать нельзя", () => {
    open({ id: "r1", game: "cards", ownerAccount: "me" });
    expect(removeMember("r1", "me", at)).toBe(false);
    expect(roleOf("r1", "me", at)).toBe("owner");
    expect(removeMember("r1", "you", at)).toBe(true);
  });

  it("вошёл дважды — член один раз", () => {
    open({ id: "r1", game: "cards", ownerAccount: "me" });
    addMember("r1", "you", "player", true, 2, at);
    addMember("r1", "you", "player", true, 3, at);
    expect(membersOf("r1", at)).toHaveLength(2);
  });
});

// СТОРОЖ `rooms.the-issued-code-is-digits-and-only-a-chosen-one-has-letters`.
//
// Выданный код диктуют вслух и набирают с чужого экрана: цифры называются однозначно, буквы — нет
// («си» — это C или S, «а» — латинская или кириллическая). Тот, кто код ВЫБРАЛ сам, произносит его
// своими словами, и буквы ему разрешены.
describe("rooms.the-issued-code-is-digits-and-only-a-chosen-one-has-letters", () => {
  it("сто выданных кодов — и ни одной буквы", () => {
    for (let n = 0; n < 100; n++) {
      const code = open({ id: `d${n}`, game: "cards" }).code!;
      expect(code).toMatch(/^\d{4}$/);
    }
  });

  it("выбранный человеком код может быть словом", () => {
    expect(cleanCode("kamaz")).toBe("KAMAZ");
    expect(cleanCode("K2")).toBe("K2");
  });
});
