// СТОРОЖ `bot.an-invite-names-a-table-and-opens-it-by-link`.

import { describe, it, expect } from "vitest";
import { gamesFor, startappUrl, inviteCard } from "./invite.js";

describe("bot.an-invite-names-a-table-and-opens-it-by-link", () => {
  it("пустой запрос предлагает все игры", () => {
    expect(gamesFor("")).toEqual(["cards", "chess", "nardy"]);
  });

  it("набранное сужает список — и латиницей, и по-русски", () => {
    expect(gamesFor("che")).toEqual(["chess"]);
    expect(gamesFor("Шах")).toEqual(["chess"]);
    expect(gamesFor("нар")).toEqual(["nardy"]);
  });

  it("непонятное показывает всё, а не пустоту", () => {
    expect(gamesFor("zzz")).toEqual(["cards", "chess", "nardy"]);
  });

  it("ссылка кладёт код в startapp — телега другой строки боту не даёт", () => {
    expect(startappUrl("CrossaderBot", "0244")).toBe("https://t.me/CrossaderBot?startapp=0244");
  });

  it("карточка называет игру и код", () => {
    const card = inviteCard("chess", "0244");
    expect(card.title).toBe("Шахматы");
    expect(card.text).toContain("0244");
    expect(card.text).toContain("Шахматы");
  });
});
