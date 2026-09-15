import type { AddressInfo } from "net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STICKERS_MAX, hasSticker } from "../db/stickersRepo.js";
import { SECRET_HEADER } from "./contract.js";
import { stickerRoutes } from "./stickers.js";

process.env.TABLE_SECRET = "s3cret";

const WEBP = Buffer.concat([Buffer.from("RIFF0000WEBP", "ascii"), Buffer.alloc(40, 7)]);
let base = "";
let close = () => {};

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  // Телега в тестах — заглушка: `good-*` — картинка, остальное — не картинка.
  app.use(stickerRoutes(async (fileId) => (fileId.startsWith("good") ? { bytes: WEBP, type: "image/webp" } : undefined)));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());

const call = (path: string, init: { method?: string; json?: unknown; secret?: string | null } = {}) =>
  fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(init.secret === null ? {} : { [SECRET_HEADER]: init.secret ?? "s3cret" }) },
    ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
  });

describe("стикеры игрока", () => {
  it("бот добавляет по file_id, набор перечисляется, картинку берёт кто угодно, удаляет только бот", async () => {
    const added = (await (await call("/table/stickers", { method: "POST", json: { by: "tg:1", fileId: "good-1" } })).json()) as { id: string };
    expect(added.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await (await call("/table/stickers?by=tg:1")).json()).toEqual([added.id]);
    expect(await (await call("/table/stickers?by=tg:2")).json()).toEqual([]);
    const img = await call(`/table/stickers/tg:1/${added.id}`, { secret: null });
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/webp");
    expect(Buffer.from(await img.arrayBuffer()).equals(WEBP)).toBe(true);
    expect((await call(`/table/stickers/tg:2/${added.id}`, { secret: null })).status).toBe(404);
    expect(hasSticker("tg:1", added.id)).toBe(true);
    expect((await call(`/table/stickers/tg:1/${added.id}`, { method: "DELETE", secret: null })).status).toBe(401);
    expect(await (await call(`/table/stickers/tg:1/${added.id}`, { method: "DELETE" })).json()).toEqual({ ok: true });
    expect(await (await call("/table/stickers?by=tg:1")).json()).toEqual([]);
  });

  it("без секрета — нельзя; не картинка — отказ; набор полон — отказ", async () => {
    expect((await call("/table/stickers", { method: "POST", json: { by: "tg:3", fileId: "good" }, secret: "nope" })).status).toBe(401);
    expect((await call("/table/stickers?by=tg:3", { secret: null })).status).toBe(401);
    expect(await (await call("/table/stickers", { method: "POST", json: { by: "tg:3", fileId: "video" } })).json()).toEqual({ error: "not-image" });
    expect((await call("/table/stickers", { method: "POST", json: { by: "<x>", fileId: "good" } })).status).toBe(400);
    for (let i = 0; i < STICKERS_MAX; i += 1) await call("/table/stickers", { method: "POST", json: { by: "tg:4", fileId: `good-${i}` } });
    expect(await (await call("/table/stickers", { method: "POST", json: { by: "tg:4", fileId: "good-x" } })).json()).toEqual({ error: "full" });
    expect(((await (await call("/table/stickers?by=tg:4")).json()) as string[]).length).toBe(STICKERS_MAX);
  });
});
