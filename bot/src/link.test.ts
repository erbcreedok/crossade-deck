// СТОРОЖ `bot.start-with-a-code-is-not-a-menu`.
//
// `/start` без кода — это меню игр, и им он должен остаться: ссылка с кодом приходит той же
// командой, и спутать их значит либо сломать привязку, либо показывать меню там, где человек ждёт
// «готово».

import { describe, expect, it, vi } from "vitest";
import { claimLink, claimReply, codeOfStart } from "./link.js";

describe("bot.start-with-a-code-is-not-a-menu", () => {
  it("код из payload узнаётся", () => {
    expect(codeOfStart("nS9_aQ-2bC4dE6fG")).toBe("nS9_aQ-2bC4dE6fG");
  });

  it("обычный /start кодом не считается", () => {
    expect(codeOfStart(undefined)).toBeUndefined();
    expect(codeOfStart("")).toBeUndefined();
    expect(codeOfStart("   ")).toBeUndefined();
  });

  it("чужой формат — не наш код", () => {
    // Короткое, с пробелом, с точкой: всё это что угодно, только не то, что мы выдавали.
    expect(codeOfStart("abc")).toBeUndefined();
    expect(codeOfStart("nS9_aQ 2bC4dE6fG")).toBeUndefined();
    expect(codeOfStart("nS9.aQ-2bC4dE6fG")).toBeUndefined();
  });
});

describe("подтверждение", () => {
  it("несёт серверу код, chat_id и общий секрет — и ничего больше", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ kind: "linked" }) })) as never;

    const result = await claimLink({ serverUrl: "http://server", secret: "s3cret", fetch }, "CODE", "tg-1");

    expect(result?.kind).toBe("linked");
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe("http://server/auth/telegram/claim");
    expect(JSON.parse(String(init.body))).toEqual({ code: "CODE", telegramId: "tg-1", secret: "s3cret" });
  });

  it("сервер не принял — это не ошибка бота, а устаревшая ссылка", async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })) as never;
    expect(await claimLink({ serverUrl: "http://server", secret: "s", fetch }, "CODE", "tg-1")).toBeUndefined();
  });

  it("сервера нет — бот не падает", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as never;
    expect(await claimLink({ serverUrl: "http://server", secret: "s", fetch }, "CODE", "tg-1")).toBeUndefined();
  });
});

describe("что человек читает", () => {
  it("привязали — «готово»", () => {
    expect(claimReply({ kind: "linked" })).toContain("привязан");
  });

  it("переключили — зовут по имени", () => {
    expect(claimReply({ kind: "switch", name: "Ербол" })).toContain("Ербол");
  });

  it("чужая телега — говорят прямо и ничего не предлагают слить", () => {
    const said = claimReply({ kind: "conflict" });
    expect(said).toContain("другому аккаунту");
    expect(said.toLowerCase()).not.toContain("слить");
  });

  it("устаревшая ссылка — говорят, что делать", () => {
    expect(claimReply(undefined)).toContain("ещё раз");
  });
});
