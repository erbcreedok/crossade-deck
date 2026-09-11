// ЧТО БОТ ГОВОРИТ СЕРВЕРУ И ЧТО ЧИТАЕТ ЧЕЛОВЕК. Разбор самой ссылки — в `sources.test.ts`.

import { describe, expect, it, vi } from "vitest";
import { claimLink, claimReply } from "./link.js";

describe("подтверждение", () => {
  it("несёт серверу код, chat_id и общий секрет — и ничего больше", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ kind: "linked" }) })) as never;

    const result = await claimLink({ serverUrl: "http://server", secret: "s3cret", fetch }, "CODE", "tg-1");

    expect(result).toEqual({ kind: "linked" });
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe("http://server/auth/telegram/claim");
    expect(JSON.parse(String(init.body))).toEqual({ code: "CODE", telegramId: "tg-1", secret: "s3cret" });
  });

  // ПОЧЕМУ НЕ ВЫШЛО — РАЗНЫЕ ВЕЩИ, И ОДНОЙ ФРАЗОЙ ИХ ГОВОРИТЬ НЕЛЬЗЯ: «устарела» на чужой секрет
  // отправляет человека жать кнопку заново до бесконечности, а дело в настройке.
  it.each([
    [404, "stale"],
    [409, "already"],
    [401, "misconfigured"],
    [503, "misconfigured"],
  ])("сервер ответил %i — это «%s»", async (status, failure) => {
    const fetch = vi.fn(async () => ({ ok: false, status, json: async () => ({}) })) as never;
    expect(await claimLink({ serverUrl: "http://server", secret: "s", fetch }, "CODE", "tg-1")).toBe(failure);
  });

  it("сервера нет — бот не падает и говорит именно это", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as never;
    expect(await claimLink({ serverUrl: "http://server", secret: "s", fetch }, "CODE", "tg-1")).toBe("offline");
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
    expect(claimReply("stale")).toContain("ещё раз");
  });

  it("нажал ту же ссылку второй раз — «уже привязан», а не «начни заново»", () => {
    const said = claimReply("already");
    expect(said).toContain("уже привязан");
    expect(said).not.toContain("ещё раз");
  });

  it("сервер не признал бота — говорят про настройку, а не про ссылку", () => {
    const said = claimReply("misconfigured");
    expect(said).toContain("секрет");
    expect(said).not.toContain("устарела");
  });

  it("сервер молчит — так и сказано", () => {
    expect(claimReply("offline")).toContain("не отвечает");
  });

  it("ссылка из незнакомого приложения — про настройку бота, а не про ссылку", () => {
    const said = claimReply("unknown-source");
    expect(said).toContain("не знаю");
    expect(said).not.toContain("устарела");
  });
});
