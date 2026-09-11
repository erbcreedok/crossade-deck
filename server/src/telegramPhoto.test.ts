// СТОРОЖ `telegram-photo.the-face-arrives-as-bytes-not-as-a-link`.
//
// Ссылка на файл телеги содержит токен бота. Отдать её на страницу — отдать самого бота; положить
// её в профиль — получить аватар, который умрёт вместе с токеном. Поэтому байты забирает сервер и
// кладёт их как обычную картинку.

import { describe, expect, it, vi } from "vitest";
import { MAX_PHOTO_BYTES, photoDataUrl } from "./telegramPhoto.js";

const bytes = (n: number) => Buffer.alloc(n, 7);

function telegram(o: { path?: string; size?: number; type?: string; body?: Buffer; fileOk?: boolean }) {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/getFile")) {
      return {
        ok: true,
        json: async () => ({ ok: true, result: { file_path: o.path ?? "photos/face.jpg", file_size: o.size ?? 1024 } }),
      };
    }
    return {
      ok: o.fileOk ?? true,
      headers: new Headers({ "content-type": o.type ?? "image/jpeg" }),
      arrayBuffer: async () => (o.body ?? bytes(1024)).buffer,
    };
  }) as never;
}

describe("telegram-photo.the-face-arrives-as-bytes-not-as-a-link", () => {
  it("лицо приходит строкой data:, и токена в ней нет", async () => {
    const call = telegram({});

    const face = await photoDataUrl("секретный-токен", "file-1", call);

    expect(face?.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(face).not.toContain("секретный-токен");
  });

  it("токен живёт только в запросах сервера — их два, и оба его", async () => {
    const call = telegram({});
    await photoDataUrl("секретный-токен", "file-1", call);

    const urls = (call as unknown as { mock: { calls: [string][] } }).mock.calls.map(([url]) => url);
    expect(urls[0]).toContain("/getFile");
    expect(urls[1]).toContain("/file/bot");
  });

  it("не картинка — не лицо", async () => {
    expect(await photoDataUrl("t", "file-1", telegram({ type: "text/html" }))).toBeUndefined();
  });

  it("слишком тяжёлое не берём — аватар это кружок, а не обои", async () => {
    expect(await photoDataUrl("t", "file-1", telegram({ size: MAX_PHOTO_BYTES + 1 }))).toBeUndefined();
    const fat = telegram({ size: 10, body: bytes(MAX_PHOTO_BYTES + 1) });
    expect(await photoDataUrl("t", "file-1", fat)).toBeUndefined();
  });

  it("телега не ответила — предлагать нечего, и сервер не падает", async () => {
    const broken = vi.fn(async () => {
      throw new Error("offline");
    }) as never;
    expect(await photoDataUrl("t", "file-1", broken)).toBeUndefined();
  });

  it("файла нет — тоже нечего", async () => {
    const none = vi.fn(async () => ({ ok: true, json: async () => ({ ok: false }) })) as never;
    expect(await photoDataUrl("t", "file-1", none)).toBeUndefined();
  });
});
