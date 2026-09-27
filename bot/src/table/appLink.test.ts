// ССЫЛКА ОТ БОТА САЖАЕТ ЗА СТОЛ ТОГО, КТО ЕЁ ПОПРОСИЛ, — и стол узнаёт его так же, как через Telegram.

import { describe, expect, it } from "vitest";
import { appLinks, bearerOf } from "./appLink.js";
import { whoIs } from "../../../server/src/table/identity.js";
import type { RoomCard } from "../../../server/src/table/contract.js";

const SECRET = "секрет";
const card = (room: string, title: string) => ({ room, title }) as RoomCard;

describe("bot.app-link-seats-who-asked", () => {
  it("кнопка на каждый стол; по ссылке стол пускает именно просившего", () => {
    const me = bearerOf({ id: 42, first_name: "Ербол", username: "erbol" });
    const said = appLinks([card("r1", "Крест"), card("r2", "Дурак")], me, "https://mac.example", SECRET);
    expect(said.rows.map((r) => r[0]!.text)).toEqual(["Крест", "Дурак"]);
    const url = new URL((said.rows[1]![0] as { url: string }).url);
    expect(url.origin + url.pathname).toBe("https://mac.example/table/app");
    expect(url.searchParams.get("host")).toBe("https://mac.example");
    const who = whoIs({ door: "app", room: url.searchParams.get("room")!, pass: url.searchParams.get("pass")! }, "s", { guests: false, secret: SECRET });
    expect(who).toEqual({ key: "tg:42", name: "Ербол", username: "erbol", door: "app" });
  });

  it("пропуск одного стола за другой не пускает", () => {
    const said = appLinks([card("r1", "Крест")], bearerOf({ id: 1, first_name: "A" }), "https://m", SECRET);
    const pass = new URL((said.rows[0]![0] as { url: string }).url).searchParams.get("pass")!;
    expect(whoIs({ door: "app", room: "r2", pass }, "s", { guests: false, secret: SECRET })).toBeNull();
  });

  it("имя — как у стола: имя и фамилия, иначе ник, иначе номер", () => {
    expect(bearerOf({ id: 1, first_name: "A", last_name: "B" }).name).toBe("A B");
    expect(bearerOf({ id: 1, username: "nick" }).name).toBe("nick");
    expect(bearerOf({ id: 7 }).name).toBe("#7");
  });

  it("столов нет — подсказка, а не пустое сообщение", () => {
    expect(appLinks([], bearerOf({ id: 1 }), "https://m", SECRET).rows).toEqual([]);
  });
});
