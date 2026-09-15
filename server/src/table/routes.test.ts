import type { AddressInfo } from "net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { BEACON_TTL_MS, CARD_BACKS, CARD_FACES, SECRET_HEADER } from "./contract.js";
import { clientRoutes } from "./client.js";
import { forgetAll } from "./lobby.js";
import { mintRoom, roomIsSigned } from "./roomIds.js";
import { BOOT, forgetBeacon, readCommand, relayRoutes, relayStatus, startBeacon, tableRoutes } from "./routes.js";

process.env.TABLE_SECRET = "s3cret";

let base = "";
let close = () => {};

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(tableRoutes(), relayRoutes(), clientRoutes());
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => {
  forgetAll();
  forgetBeacon();
});

const call = (path: string, init: RequestInit & { json?: unknown; secret?: string | null } = {}) =>
  fetch(`${base}${path}`, {
    redirect: "manual",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.secret === null ? {} : { [SECRET_HEADER]: init.secret ?? "s3cret" }),
    },
    ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
  });

describe("вид колоды", () => {
  it("каждое лицо и рубашка из контракта есть готовым растром и отдаётся клиенту", async () => {
    const baked = join(__dirname, "..", "..", "..", "game-presets", "cards", "src", "decks", "baked");
    for (const set of CARD_FACES) for (const card of ["spade-A", "heart-10", "club-Q", "joker-red"]) expect(existsSync(join(baked, set, `${card}.webp`)), `${set}/${card}`).toBe(true);
    for (const back of CARD_BACKS) expect(existsSync(join(baked, "backs", `${back}.webp`)), back).toBe(true);
    const ok = await fetch(`${base}/table/cards/classic/spade-A.webp`);
    expect(ok.status).toBe(200);
    expect((await ok.arrayBuffer()).byteLength).toBeGreaterThan(100);
    expect((await fetch(`${base}/table/cards/backs/plaid.webp`)).status).toBe(200);
    for (const set of ["classic-4c", "classic-cyr", "minimal-4c-cyr"]) expect((await fetch(`${base}/table/cards/${set}/heart-K.webp`)).status, set).toBe(200);
    expect((await fetch(`${base}/table/cards/classic-cyr-4c/spade-A.webp`)).status).toBe(404);
    expect((await fetch(`${base}/table/cards/gothic/spade-A.webp`)).status).toBe(404);
    expect((await fetch(`${base}/table/cards/classic/..%2F..%2Fbacks%2Fplaid.webp`)).status).toBe(404);
  });

  it("команда вида из сети — только известные лица и рубашки", () => {
    expect(readCommand({ t: "look", faces: "minimal", back: "ink" })).toEqual({ t: "look", faces: "minimal", back: "ink" });
    expect(readCommand({ t: "look", back: "plaid", faces: "gothic" })).toEqual({ t: "look", back: "plaid" });
    expect(readCommand({ t: "look", back: "nope" })).toBeNull();
  });
});

describe("/table/rooms — бот управляет столами", () => {
  it("без секрета — 401", async () => {
    expect((await call("/table/rooms?chat=1", { secret: null })).status).toBe(401);
    expect((await call("/table/rooms?chat=1", { secret: "wrong" })).status).toBe(401);
  });

  it("много комнат на чат: открыть, перечислить, переименовать, закрыть", async () => {
    const one = await (await call("/table/rooms", { method: "POST", json: { home: { kind: "chat", chat: "-100" }, by: "tg:1", title: "Дурак" } })).json();
    await call("/table/rooms", { method: "POST", json: { home: { kind: "chat", chat: "-100" }, by: "tg:1" } });
    await call("/table/rooms", { method: "POST", json: { home: { kind: "chat", chat: "-200" }, by: "tg:1" } });
    expect(roomIsSigned(one.room, "s3cret")).toBe(true);

    const listed = await (await call("/table/rooms?chat=-100")).json();
    expect(listed.map((r: { title: string }) => r.title)).toEqual(["Дурак", "Стол"]);

    const renamed = await (await call(`/table/rooms/${one.room}`, { method: "PATCH", json: { title: "Покер" } })).json();
    expect(renamed.title).toBe("Покер");

    expect((await call(`/table/rooms/${one.room}`, { method: "DELETE" })).status).toBe(200);
    expect((await call(`/table/rooms/${one.room}`)).status).toBe(404);
    expect(await (await call("/table/rooms?chat=-100")).json()).toHaveLength(1);
  });

  it("имя комнаты от бота — только с подписью", async () => {
    const home = { kind: "inline", message: "m1" };
    expect((await call("/table/rooms", { method: "POST", json: { home, by: "tg:1", room: "down" } })).status).toBe(400);
    const room = mintRoom("s3cret");
    expect((await (await call("/table/rooms", { method: "POST", json: { home, by: "tg:1", room } })).json()).room).toBe(room);
  });

  it("health отдаёт boot без секрета", async () => {
    expect(await (await call("/table/health", { secret: null })).json()).toEqual({ boot: BOOT });
  });
});

describe("реле и маяк", () => {
  it("пока маяка нет, /t/ отвечает «недоступно», с маяком — переадресует туда, где мак", async () => {
    expect((await call("/t/?x=1", { secret: null })).status).toBe(503);
    await call("/relay/table", { method: "POST", json: { url: "https://mac.example/", boot: "b1" } });
    const hop = await call("/t/?tgWebAppStartParam=abc", { secret: null });
    expect(hop.status).toBe(302);
    expect(hop.headers.get("location")).toBe("https://mac.example/table/?tgWebAppStartParam=abc");
  });

  it("маяк без секрета не принимается; замолчавший маяк — стол «не жив»", async () => {
    expect((await call("/relay/table", { method: "POST", secret: null, json: { url: "https://x", boot: "b" } })).status).toBe(401);
    await call("/relay/table", { method: "POST", json: { url: "https://mac.example", boot: "b2" } });
    expect(relayStatus().up).toBe(true);
    expect(relayStatus(Date.now() + BEACON_TTL_MS + 1).up).toBe(false);
  });

  it("маяк мака шлёт свой адрес и boot", async () => {
    process.env.TABLE_PUBLIC_URL = "https://mac.example";
    process.env.TABLE_RELAY_URL = base;
    const stop = startBeacon();
    await new Promise((r) => setTimeout(r, 100));
    stop();
    expect(relayStatus()).toMatchObject({ up: true, url: "https://mac.example", boot: BOOT });
  });
});

describe("/table/rooms/:room/run — команда админа", () => {
  it("нет комнаты — 404; кривая команда — 400; стол ещё никто не открыл — empty", async () => {
    const run = (room: string, json: unknown) => call(`/table/rooms/${room}/run`, { method: "POST", json });
    expect((await run("nope", { by: "tg:1", command: { t: "collect" } })).status).toBe(404);
    const one = await (await call("/table/rooms", { method: "POST", json: { home: { kind: "chat", chat: "-1" }, by: "tg:1" } })).json();
    expect((await run(one.room, { by: "tg:1", command: { t: "deal", rule: "poker" } })).status).toBe(400);
    expect((await run(one.room, { command: { t: "collect" } })).status).toBe(400);
    expect(await (await run(one.room, { by: "tg:1", command: { t: "collect" } })).json()).toEqual({ error: "empty" });
    expect((await (await call("/table/rooms?by=tg:1")).json()).map((c: { room: string }) => c.room)).toEqual([one.room]);
    expect((await call(`/table/rooms/${one.room}/run`, { method: "POST", json: { by: "tg:1", command: { t: "collect" } }, secret: null })).status).toBe(401);
  });
});
