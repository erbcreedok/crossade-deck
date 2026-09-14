import { describe, expect, it } from "vitest";
import type { RoomCard } from "../../../server/src/table/contract.js";
import { enter, listed, opened } from "./talk.js";

const links = { anywhere: (r: string) => `https://t.me/bot/table?startapp=${r}`, app: (r: string) => `https://fly/t/?room=${r}` };
const card = (room: string, title: string): RoomCard => ({ room, title, home: { kind: "chat", chat: "-1" }, people: [], createdAt: 0 });

describe("слова бота про столы", () => {
  it("в личке — Mini App кнопкой, в группе — ссылкой (web_app в группах Telegram не показывает)", () => {
    expect(enter("r1", links, true)).toEqual({ text: "Играть", app: "https://fly/t/?room=r1" });
    expect(enter("r1", links, false)).toEqual({ text: "Играть", url: "https://t.me/bot/table?startapp=r1" });
  });

  it("второй стол в чате — бот говорит, сколько их теперь", () => {
    expect(opened(card("r1", "Дурак"), 1, links, false).text).toBe("Стол «Дурак» открыт.");
    expect(opened(card("r2", "Покер"), 2, links, false).text).toContain("столов: 2");
  });

  it("список: у каждого стола вход, переименование и закрытие", () => {
    const said = listed([card("r1", "Дурак"), card("r2", "Покер")], links, false);
    expect(said.rows.map((row) => row.map((b) => b.text))).toEqual([
      ["Дурак", "Переименовать", "Закрыть"],
      ["Покер", "Переименовать", "Закрыть"],
    ]);
  });
});
