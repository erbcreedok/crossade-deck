// СТОРОЖ `bot.the-file-link-carries-the-token-and-never-leaves`.
//
// Ссылка на файл телеги — это `api.telegram.org/file/bot<ТОКЕН>/…`. Бот узнаёт только КЛЮЧ файла и
// никогда не отдаёт наружу ни ссылку, ни токен: байты забирает сервер своим токеном.

import { describe, expect, it, vi } from "vitest";
import { pickPhoto, profilePhoto } from "./photo.js";

const sizes = [
  { file_id: "small", width: 60, height: 60 },
  { file_id: "middle", width: 160, height: 160 },
  { file_id: "huge", width: 800, height: 800 },
];

describe("какой размер лица берём", () => {
  it("самый мелкий, который уже не хуже нужного", () => {
    expect(pickPhoto(sizes)).toBe("middle");
  });

  it("все мельче нужного — берём самый крупный из них", () => {
    expect(pickPhoto([sizes[0]!])).toBe("small");
  });

  it("лица нет — брать нечего", () => {
    expect(pickPhoto([])).toBeUndefined();
    expect(pickPhoto(undefined)).toBeUndefined();
  });
});

describe("bot.the-file-link-carries-the-token-and-never-leaves", () => {
  it("бот спрашивает только ключ файла и ничего не скачивает", async () => {
    const call = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { photos: [sizes] } }),
    })) as never;

    expect(await profilePhoto("bot-token", "70001", call)).toBe("middle");

    const urls = (call as unknown as { mock: { calls: [string][] } }).mock.calls.map(([url]) => url);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/getUserProfilePhotos");
    // Ни одного обращения к файловому пути — именно он несёт токен наружу.
    expect(urls.some((url) => url.includes("/file/bot"))).toBe(false);
  });

  it("у человека нет лица — предлагать нечего", async () => {
    const call = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, result: { photos: [] } }) })) as never;
    expect(await profilePhoto("bot-token", "70001", call)).toBeUndefined();
  });

  it("телега не ответила — бот не падает", async () => {
    const call = vi.fn(async () => {
      throw new Error("offline");
    }) as never;
    expect(await profilePhoto("bot-token", "70001", call)).toBeUndefined();
  });
});
