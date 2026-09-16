import { describe, expect, it } from "vitest";
import type { RoomCard } from "../../../server/src/table/contract.js";
import { enter, listed, opened } from "./talk.js";

const links = { anywhere: (r: string) => `https://t.me/bot/table?startapp=${r}`, app: (r: string) => `https://fly/t/?room=${r}` };
const card = (room: string, title: string, by = "tg:1"): RoomCard => ({ room, title, by, home: { kind: "chat", chat: "-1" }, people: [], createdAt: 0 });

describe("слова бота про столы", () => {
  it("в личке — все мои столы: своими управляю, в чужие просто захожу", () => {
    const said = listed([card("r1", "Стол «Чат»", "tg:1"), card("r2", "Стол «Бандиты»", "tg:9")], links, true, "tg:1");
    expect(said.text).toContain("Твои столы (2)");
    expect(said.text).toContain("Стол «Чат» · твой");
    expect(said.rows[0]).toHaveLength(4);
    expect(said.rows[1]).toHaveLength(1);
    expect(said.rows[1]![0]).toEqual({ text: "Стол «Бандиты»", app: "https://fly/t/?room=r2" });
  });

  it("в личке без столов — не «в этом чате», а про меня", () => {
    expect(listed([], links, true, "tg:1").text).toContain("Ты пока ни за одним столом");
  });

  it("в личке — Mini App кнопкой, в группе — ссылкой (web_app в группах Telegram не показывает)", () => {
    expect(enter("r1", links, true)).toEqual({ text: "Играть", app: "https://fly/t/?room=r1" });
    expect(enter("r1", links, false)).toEqual({ text: "Играть", url: "https://t.me/bot/table?startapp=r1" });
  });

  it("второй стол в чате — бот говорит, сколько их теперь", () => {
    expect(opened(card("r1", "Дурак"), 1, links, false).text).toBe("Стол «Дурак» открыт.");
    expect(opened(card("r2", "Покер"), 2, links, false).text).toContain("столов: 2");
  });

  it("список: у каждого стола вход, меню управления, переименование и закрытие", () => {
    const said = listed([card("r1", "Дурак"), card("r2", "Покер")], links, false);
    expect(said.rows.map((row) => row.map((b) => b.text))).toEqual([
      ["Дурак", "Управлять", "Переименовать", "Закрыть"],
      ["Покер", "Управлять", "Переименовать", "Закрыть"],
    ]);
  });
});
