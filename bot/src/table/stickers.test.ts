import { describe, expect, it } from "vitest";
import { TableApi } from "./api.js";
import { pickStickerPhoto } from "./stickers.js";

describe("стикеры в боте", () => {
  it("из размеров фото берётся самое мелкое не меньше 320, а если все меньше — самое крупное", () => {
    expect(pickStickerPhoto([{ file_id: "a", width: 90 }, { file_id: "c", width: 1280 }, { file_id: "b", width: 320 }])).toBe("b");
    expect(pickStickerPhoto([{ file_id: "a", width: 90 }, { file_id: "b", width: 200 }])).toBe("b");
    expect(pickStickerPhoto(undefined)).toBeUndefined();
  });

  it("бот зовёт сервер: добавить file_id, перечислить, удалить — с секретом", async () => {
    const calls: { url: string; method: string; body?: string; secret?: string }[] = [];
    const http = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/table/health")) return new Response(JSON.stringify({ boot: "b" }));
      calls.push({ url: u, method: init?.method ?? "GET", body: init?.body as string | undefined, secret: (init?.headers as Record<string, string>)?.["x-table-secret"] });
      if (init?.method === "POST") return new Response(JSON.stringify({ id: "s1" }));
      if (init?.method === "DELETE") return new Response(JSON.stringify({ ok: true }));
      return new Response(JSON.stringify(["s1"]));
    }) as typeof fetch;
    const api = new TableApi({ secret: "sek", serverUrl: "http://mac" }, http);
    expect(await api.addSticker("tg:5", "FILE")).toEqual({ id: "s1" });
    expect(await api.stickers("tg:5")).toEqual(["s1"]);
    expect(await api.removeSticker("tg:5", "s1")).toEqual({ ok: true });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST http://mac/table/stickers", "GET http://mac/table/stickers?by=tg%3A5", "DELETE http://mac/table/stickers/tg%3A5/s1"]);
    expect(JSON.parse(calls[0]!.body!)).toEqual({ by: "tg:5", fileId: "FILE" });
  });
});
