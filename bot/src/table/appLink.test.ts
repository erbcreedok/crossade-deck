// ССЫЛКА ОТ БОТА САЖАЕТ ЗА СТОЛ ТОГО, КТО ЕЁ ПОПРОСИЛ, — и стол узнаёт его так же, как через Telegram.

import { describe, expect, it } from "vitest";
import { appLinks, bearerOf } from "./appLink.js";
import { whoIs } from "../../../server/src/table/identity.js";
import type { RoomCard } from "../../../server/src/table/contract.js";

const SECRET = "секрет";
const card = (room: string, title: string) => ({ room, title }) as RoomCard;

describe("bot.app-link-seats-who-asked", () => {
  it("первая кнопка — «Мои комнаты», дальше по столу; ключ в ссылке пускает именно просившего и за любой его стол", () => {
    const me = bearerOf({ id: 42, first_name: "Ербол", username: "erbol" });
    const said = appLinks([card("r1", "Крест"), card("r2", "Дурак")], me, "https://mac.example", SECRET);
    expect(said.rows.map((r) => r[0]!.text)).toEqual(["Мои комнаты", "Крест", "Дурак"]);
    const list = new URL((said.rows[0]![0] as { url: string }).url);
    expect(list.searchParams.has("room")).toBe(false);
    const url = new URL((said.rows[2]![0] as { url: string }).url);
    expect(url.origin + url.pathname).toBe("https://mac.example/table/app");
    expect(url.searchParams.get("room")).toBe("r2");
    expect(url.searchParams.get("host")).toBe("https://mac.example");
    const key = url.searchParams.get("key")!;
    for (const room of ["r1", "r2", "чужой"]) {
      expect(whoIs({ door: "app", room, key }, "s", { guests: false, secret: SECRET })).toEqual({ key: "tg:42", name: "Ербол", username: "erbol", door: "app" });
    }
  });

  it("ключ чужой подписью не пускает", () => {
    const said = appLinks([], bearerOf({ id: 1, first_name: "A" }), "https://m", "другой-секрет");
    const key = new URL((said.rows[0]![0] as { url: string }).url).searchParams.get("key")!;
    expect(whoIs({ door: "app", room: "r1", key }, "s", { guests: false, secret: SECRET })).toBeNull();
  });

  it("имя — как у стола: имя и фамилия, иначе ник, иначе номер", () => {
    expect(bearerOf({ id: 1, first_name: "A", last_name: "B" }).name).toBe("A B");
    expect(bearerOf({ id: 1, username: "nick" }).name).toBe("nick");
    expect(bearerOf({ id: 7 }).name).toBe("#7");
  });

  it("столов нет — остаётся «Мои комнаты»", () => {
    expect(appLinks([], bearerOf({ id: 1 }), "https://m", SECRET).rows.map((r) => r[0]!.text)).toEqual(["Мои комнаты"]);
  });
});
