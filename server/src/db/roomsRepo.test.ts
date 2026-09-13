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
  foreverNow,
  forkRoom,
  setRoomCode,
  setRoomConfig,
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

// СТОРОЖ `rooms.a-forever-room-is-taken-down-with-a-days-notice`.
//
// Вечная комната — чужое имущество: в ней лежат люди, права и код, который человек уже разослал
// друзьям. Снять вечность значит назначить столу смерть, и молчаливое отложенное снятие — это
// сюрприз через день. Поэтому срок ЗАПИСАН: пока он не вышел, стол живёт вечным, и его видно.
describe("rooms.a-forever-room-is-taken-down-with-a-days-notice", () => {
  it("вечная со сроком впереди остаётся вечной, а со сроком позади — уже нет", () => {
    const room = open({ id: "f1", game: "cards", forever: true });
    expect(foreverNow(room, 1000)).toBe(true);
    setRoomConfig("f1", { foreverDropAt: 5000 }, at);
    expect(foreverNow(roomById("f1", at)!, 1000)).toBe(true);
    expect(foreverNow(roomById("f1", at)!, 9000)).toBe(false);
  });

  it("отменённый срок возвращает вечность, и колонка снова пуста", () => {
    open({ id: "f2", game: "cards", forever: true });
    setRoomConfig("f2", { foreverDropAt: 5000 }, at);
    setRoomConfig("f2", { foreverDropAt: null }, at);
    expect(roomById("f2", at)!.foreverDropAt).toBeNull();
    expect(foreverNow(roomById("f2", at)!, 9000)).toBe(true);
  });
});

// СТОРОЖ `rooms.a-new-code-is-still-one-code-per-table`.
//
// Код меняют дважды по-разному: «дай другой» и «хочу вот такой». Оба обязаны кончиться ОДНИМ живым
// кодом у этого стола: занятый чужим не отдаётся, а свой собственный — не повод менять его на
// выданный, иначе кнопка «свой код» отбирает у человека тот код, который он и просил.
describe("rooms.a-new-code-is-still-one-code-per-table", () => {
  it("выдаётся другой код, и старый освобождается", () => {
    const room = open({ id: "c1", game: "cards" });
    const after = setRoomCode("c1", undefined, at)!;
    expect(after.code).not.toBe(room.code);
    expect(roomByCode(room.code!, at)).toBeUndefined();
    expect(roomByCode(after.code!, at)?.id).toBe("c1");
  });

  it("названный код берётся, если он свободен", () => {
    open({ id: "c2", game: "cards" });
    expect(setRoomCode("c2", "kamaz", at)!.code).toBe("KAMAZ");
  });

  it("занятый чужим — не берётся, и стол получает выданный, а не чужой", () => {
    const theirs = open({ id: "c3", game: "cards", code: "KAMAZ" });
    open({ id: "c4", game: "cards" });
    const after = setRoomCode("c4", "kamaz", at)!;
    expect(after.code).not.toBe("KAMAZ");
    expect(roomByCode("KAMAZ", at)?.id).toBe(theirs.id);
  });

  it("свой собственный код остаётся своим — просьба уже выполнена", () => {
    const room = open({ id: "c5", game: "cards", code: "KAMAZ" });
    expect(setRoomCode("c5", "KAMAZ", at)!.code).toBe(room.code);
  });
});

// СТОРОЖ `rooms.a-fork-is-a-second-table-not-a-stolen-crown`.
//
// «Хочу быть хозяином этой комнаты» разрешается не отбором короны, а второй комнатой: те же люди и
// те же настройки, хозяин — попросивший, прежний хозяин приходит админом. Код у копии свой: два
// стола под одним кодом — это стол, который нельзя позвать.
describe("rooms.a-fork-is-a-second-table-not-a-stolen-crown", () => {
  it("копия своя, а оригинал остаётся при своём хозяине и своём коде", () => {
    at.prepare(
      `INSERT INTO accounts (id, name, name_chosen, color, avatar, created_at, recovery_hash)
       VALUES ('helper', 'Админ', 1, NULL, NULL, 1, 'h3'), ('watcher', 'Зритель', 1, NULL, NULL, 1, 'h4')`,
    ).run();
    const room = open({ id: "k1", game: "cards", ownerAccount: "me", chairs: 5, forever: true });
    addMember("k1", "helper", "admin", true, 2, at);
    addMember("k1", "watcher", "player", false, 3, at);

    const copy = forkRoom("k1", "helper", "k2", 10, at)!;
    expect(copy.ownerAccount).toBe("helper");
    expect(copy.code).not.toBe(room.code);
    expect(copy.chairs).toBe(5);
    expect(copy.forever).toBe(true);

    expect(roomById("k1", at)!.ownerAccount).toBe("me");

    const who = new Map(membersOf("k2", at).map((one) => [one.accountId, one]));
    expect(who.get("helper")!.role).toBe("owner");
    // ПРЕЖНИЙ ХОЗЯИН — АДМИН В КОПИИ: он тут не чужой, но и не хозяин, на то она и копия.
    expect(who.get("me")!.role).toBe("admin");
    // ...а стул и уровень остальных переезжают как были.
    expect(who.get("watcher")!.chair).toBe(false);
  });
});
