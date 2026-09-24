// ЧТО С БОТАМИ ПРЯМО СЕЙЧАС. Вопрос задают, ПОКА бот молчит, — значит ответ должен быть про
// настоящее время, а не про прошедшее.

import { describe, expect, it } from "vitest";
import { botSeen, type BotTrack } from "./watch.js";

const кто = { key: "bot:игрок2", name: "Батыр", chair: "c3", brain: "claude", profile: "агрессор", waitMs: 1200, turn: true };

describe("bots.watching-tells-what-is-happening-now", () => {
  it("думает — видно, сколько уже думает", () => {
    const track: BotTrack = { moves: 3, failed: 0, since: 1000 };
    expect(botSeen(кто, track, 4500).thinkingMs, "думает три с половиной секунды").toBe(3500);
  });

  it("не думает — счёт времени пуст, а не ноль: ноль значил бы «только начал»", () => {
    expect(botSeen(кто, { moves: 3, failed: 0 }, 4500).thinkingMs).toBe(null);
  });

  it("часы ушли назад — не показываем отрицательное время", () => {
    expect(botSeen(кто, { moves: 0, failed: 0, since: 5000 }, 4000).thinkingMs).toBe(0);
  });

  it("про бота ещё ничего не известно — это не ошибка, а нули", () => {
    const seen = botSeen(кто, undefined, 1000);
    expect(seen.moves).toBe(0);
    expect(seen.failed).toBe(0);
    expect(seen.thinkingMs).toBe(null);
    expect(seen.lastSays).toBeUndefined();
  });

  it("ЧЕМ ОН ДУМАЕТ И КАКОЙ ОН — доезжает как есть: за этим страницу и открывают", () => {
    const seen = botSeen(кто, { moves: 1, failed: 2, lastSays: "положить 7 крест", lastMs: 5400, lastWhy: "не уложился" }, 0);
    expect(seen.brain).toBe("claude");
    expect(seen.profile).toBe("агрессор");
    expect(seen.waitMs).toBe(1200);
    expect(seen.turn).toBe(true);
    expect(seen.lastSays).toBe("положить 7 крест");
    expect(seen.lastMs).toBe(5400);
    expect(seen.failed, "срывы видно числом, а не только последней причиной").toBe(2);
    expect(seen.lastWhy).toBe("не уложился");
  });
});
