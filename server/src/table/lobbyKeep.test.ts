import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../db/open.js";
import { dropRoom, keepCard, keepState, keptRooms, keptState } from "../db/tableRoomsRepo.js";
import { closeEntry, findEntry, forgetAll, isBuried, keepLobbyIn, openEntry, recast, rename, roomsBy, setAdmin, type LobbyKeep } from "./lobby.js";

// КОМНАТА ПЕРЕЖИВАЕТ ПРОЦЕСС. «Перезапуск» здесь — `forgetAll()` (память пуста) и новый `keepLobbyIn`
// поверх той же базы: ровно то, что видит сервер, поднявшись заново.

let base: DatabaseSync;
const keepIn = (at: DatabaseSync): LobbyKeep => ({
  card: (room, json) => keepCard(room, json, 1, at),
  drop: (room) => dropRoom(room, at),
  all: () => keptRooms(at),
  state: (room, json) => keepState(room, json, 2, at),
  stateOf: (room) => keptState(room, at),
});
const restart = () => {
  forgetAll();
  return keepLobbyIn(keepIn(base));
};

beforeEach(() => {
  base = new DatabaseSync(":memory:");
  migrate(base);
  forgetAll();
  keepLobbyIn(keepIn(base));
});

describe("комната стола переживает перезапуск", () => {
  it("запись возвращается целиком: чья, как зовётся, какой игры, кому выдан распорядитель", () => {
    openEntry("r1", { kind: "inline", message: "круг" }, "tg:1", "Проверка круга", 5, "krest", "krest");
    setAdmin("r1", "tg:1", "tg:2", true);
    rename("r1", "Круг второй");
    const before = findEntry("r1");

    expect(restart()).toBe(1);
    expect(findEntry("r1")).toEqual(before);
    expect(roomsBy("tg:1").map((r) => r.title)).toEqual(["Круг второй"]);
    expect(findEntry("r1")!.admins).toEqual(["tg:2"]);
  });

  it("смена игры записывается вместе с именем", () => {
    openEntry("r1", { kind: "chat", chat: "9" }, "tg:1");
    const after = recast("r1", "krest")!;
    restart();
    expect(findEntry("r1")).toMatchObject({ kind: "krest", title: after.title });
  });

  it("закрытая комната не воскресает, и её слепок уходит вместе с ней", () => {
    openEntry("r1", { kind: "chat", chat: "9" }, "tg:1");
    keepState("r1", "{}", 2, base);
    expect(keptState("r1", base)).toBe("{}");
    closeEntry("r1");
    expect(restart()).toBe(0);
    expect(keptState("r1", base)).toBeNull();
  });

  it("слепок без записи не пишется: закрытую комнату он не заводит заново", () => {
    keepState("ghost", "{}", 2, base);
    expect(keptRooms(base)).toEqual([]);
  });

  it("битая строка не оставляет без столов остальных", () => {
    openEntry("r1", { kind: "chat", chat: "9" }, "tg:1");
    keepCard("r2", "{не json", 3, base);
    keepCard("r3", JSON.stringify({ room: "другая" }), 3, base);
    expect(restart()).toBe(1);
  });

  it("без хранилища список живёт в памяти, как жил", () => {
    forgetAll();
    keepLobbyIn(null);
    openEntry("r1", { kind: "chat", chat: "9" }, "tg:1");
    expect(findEntry("r1")).toBeDefined();
    expect(keptRooms(base)).toEqual([]);
  });
});

// ЗАКРЫТУЮ КОМНАТУ НЕ ВОСКРЕСИТЬ.
//
// Бот после перезапуска сервера открывает заново всё, что помнит, — иначе человек зайдёт по своей
// же ссылке в безымянную комнату, где он никто. Но той же дверью он воскрешал и только что
// закрытые: удалил комнату, перезапустил стол — она снова тут. Со стороны это читается как
// «удаление не работает», и так оно и было.
describe("lobby.a-closed-room-stays-closed", () => {
  it("закрытая помечена, и открыть её заново нечем", () => {
    const room = "З".repeat(23);
    openEntry(room, { kind: "chat", chat: "1" }, "tg:1", "Стол");
    expect(findEntry(room)).toBeDefined();
    expect(closeEntry(room)).toBe(true);
    expect(isBuried(room), "надгробие поставлено").toBe(true);
    expect(findEntry(room), "и комнаты нет").toBeUndefined();
  });

  it("живая комната надгробия не имеет — иначе не открылась бы ни одна", () => {
    const room = "Ж".repeat(23);
    openEntry(room, { kind: "chat", chat: "2" }, "tg:1", "Живой");
    expect(isBuried(room)).toBe(false);
  });

  it("НАДГРОБИЕ ПЕРЕЖИВАЕТ ПЕРЕЗАПУСК — иначе бот воскресит комнату тем же именем", () => {
    // Бот открывает свои комнаты ровно ПОСЛЕ перезапуска: памяти процесса тут мало, она умирает в
    // тот самый миг, когда надгробие и нужно.
    const room = "П".repeat(23);
    openEntry(room, { kind: "chat", chat: "3" }, "tg:1", "Был да сплыл");
    closeEntry(room);
    forgetAll();
    keepLobbyIn(keepIn(base));
    expect(isBuried(room), "после перезапуска комната всё ещё закрыта").toBe(true);
    expect(findEntry(room), "и в списке её нет").toBeUndefined();
  });
});
