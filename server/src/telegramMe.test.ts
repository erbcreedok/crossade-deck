// СТОРОЖ `telegram.the-link-names-our-own-bot`.
//
// Ссылка привязки собирается из имени бота. Имя, вписанное руками, расходится с настоящим ровно
// один раз — и человек уходит в ЧУЖОГО бота: ссылка выглядит рабочей, открывается, и там незнакомый
// бот, который про этот код ничего не знает. Поэтому имя спрашивается у телеги тем же токеном,
// которым проверяется подпись Mini App.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { botUsername, forgetBotUsername } from "./telegramMe.js";

const answers = (username: string | undefined, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => ({ ok, result: username ? { username } : undefined }) }) as never);

beforeEach(() => {
  forgetBotUsername();
  delete process.env.TELEGRAM_BOT_USERNAME;
  delete process.env.TELEGRAM_BOT_TOKEN;
});

afterEach(() => vi.unstubAllGlobals());

describe("telegram.the-link-names-our-own-bot", () => {
  it("имя берётся у телеги по нашему же токену", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    const fetch = answers("CrossaderBot");
    vi.stubGlobal("fetch", fetch);

    expect(await botUsername()).toBe("CrossaderBot");
    expect((fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0]![0]).toContain("/getMe");
  });

  it("спрашивается один раз на процесс", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    const fetch = answers("CrossaderBot");
    vi.stubGlobal("fetch", fetch);

    await botUsername();
    await botUsername();
    await botUsername();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("вписанное в окружение перебивает: на машине без сети иначе не поработать", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    process.env.TELEGRAM_BOT_USERNAME = "@LocalBot";
    const fetch = answers("CrossaderBot");
    vi.stubGlobal("fetch", fetch);

    // Собачка съедается: в ссылку идёт голое имя.
    expect(await botUsername()).toBe("LocalBot");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("нет токена — нет имени, и привязку предлагать нечем", async () => {
    expect(await botUsername()).toBeUndefined();
  });

  it("телега не ответила — имени нет, но в следующий раз спросим снова", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    const broken = vi.fn(async () => {
      throw new Error("offline");
    }) as never;
    vi.stubGlobal("fetch", broken);
    expect(await botUsername()).toBeUndefined();

    // Сервер, поднявшийся раньше сети, иначе остался бы без имени до перезапуска.
    const later = answers("CrossaderBot");
    vi.stubGlobal("fetch", later);
    expect(await botUsername()).toBe("CrossaderBot");
  });
});
