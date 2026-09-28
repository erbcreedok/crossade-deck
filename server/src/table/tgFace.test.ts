import { describe, expect, it } from "vitest";
import { tgFace } from "./tgFace.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

/** Поддельный Bot API: у `withPhoto` есть фото трёх размеров, у остальных — нет. */
const api = (withPhoto: string) => {
  const asked: string[] = [];
  const http = (async (url: string) => {
    asked.push(url);
    if (url.includes("getUserProfilePhotos")) {
      const has = url.includes(`user_id=${withPhoto}&`);
      return new Response(JSON.stringify({ ok: true, result: { photos: has ? [[{ file_id: "s", width: 64 }, { file_id: "m", width: 160 }, { file_id: "l", width: 640 }]] : [] } }));
    }
    if (url.includes("getFile")) return new Response(JSON.stringify({ ok: true, result: { file_path: "p/1.jpg", file_size: JPEG.length } }));
    return new Response(JPEG);
  }) as typeof fetch;
  return { http, asked };
};

describe("лицо из Telegram, когда подпись его не принесла", () => {
  it("спрашивает у Bot API и отдаёт картинкой data:, не ссылкой с токеном; берёт размер не меньше 96", async () => {
    const { http, asked } = api("501");
    const face = await tgFace("tg:501", "TOKEN", http, 1);
    expect(face).toBe(`data:image/jpeg;base64,${JPEG.toString("base64")}`);
    expect(face).not.toContain("TOKEN");
    expect(asked.some((u) => u.includes("file_id=m"))).toBe(true);
  });

  it("гостю и без токена — не спрашивает; нет фото — ничего; второй раз не спрашивает", async () => {
    const { http, asked } = api("501");
    expect(await tgFace("dev:x", "TOKEN", http)).toBeUndefined();
    expect(await tgFace("tg:502", undefined, http)).toBeUndefined();
    expect(asked).toEqual([]);
    expect(await tgFace("tg:503", "TOKEN", http, 1)).toBeUndefined();
    const n = asked.length;
    await tgFace("tg:503", "TOKEN", http, 2);
    expect(asked.length, "«нет фото» запомнено на час").toBe(n);
  });
});
