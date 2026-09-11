// СТОРОЖ `telegram-photo.the-face-arrives-as-bytes-not-as-a-link`.
//
// Ссылка на файл телеги содержит токен бота. Отдать её на страницу — отдать самого бота; положить
// её в профиль — получить аватар, который умрёт вместе с токеном. Поэтому байты забирает сервер и
// кладёт их как обычную картинку.

import { describe, expect, it, vi } from "vitest";
import { MAX_PHOTO_BYTES, photoDataUrl } from "./telegramPhoto.js";

/** Настоящие первые байты JPEG: по ним лицо и узнаётся. */
const jpeg = (n = 1024) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(Math.max(0, n - 3), 7)]);
/** Что-то, что картинкой не является, как бы оно ни называлось. */
const notImage = (n = 1024) => Buffer.alloc(n, 7);

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
      // ИМЕННО ТАК ОТВЕЧАЕТ ТЕЛЕГА: `application/octet-stream` на любую картинку. Тест, подсовывавший
      // сюда `image/jpeg`, проверял мир, которого нет, — и пропустил проверку заголовка, из-за
      // которой настоящие лица отбрасывались.
      headers: new Headers({ "content-type": o.type ?? "application/octet-stream" }),
      arrayBuffer: async () => {
        const body = o.body ?? jpeg();
        return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
      },
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

  it("тип берётся из байтов: телега отвечает octet-stream на любую картинку", async () => {
    const face = await photoDataUrl("t", "file-1", telegram({ type: "application/octet-stream", body: jpeg() }));
    expect(face?.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("не картинка — не лицо, как бы её ни назвали в заголовке", async () => {
    const lying = telegram({ type: "image/jpeg", body: notImage() });
    expect(await photoDataUrl("t", "file-1", lying)).toBeUndefined();
  });

  it("слишком тяжёлое не берём — аватар это кружок, а не обои", async () => {
    expect(await photoDataUrl("t", "file-1", telegram({ size: MAX_PHOTO_BYTES + 1 }))).toBeUndefined();
    const fat = telegram({ size: 10, body: jpeg(MAX_PHOTO_BYTES + 1) });
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
