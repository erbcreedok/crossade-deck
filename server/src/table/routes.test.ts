import type { AddressInfo } from "net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { BEACON_EVERY_MS, BEACON_TTL_MS, CARD_BACKS, CARD_FACES, SECRET_HEADER } from "./contract.js";
import { clientRoutes } from "./client.js";
import { forgetAll } from "./lobby.js";
import { mintRoom, roomIsSigned } from "./roomIds.js";
import { BOOT, DOOR_DEAD_AFTER, forgetBeacon, hostPage, readCommand, relayRoutes, relayStatus, startBeacon, tableRoutes } from "./routes.js";

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

  it("звуки отдаются по известным именам, остальное — 404", async () => {
    const ok = await fetch(`${base}/table/sounds/drop-1.m4a`);
    expect(ok.status).toBe(200);
    expect((await ok.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    for (const name of ["hand-1", "turn-1", "gather-3", "merge-1", "shuffle-1", "sort-1"]) expect((await fetch(`${base}/table/sounds/${name}.m4a`)).status, name).toBe(200);
    expect((await fetch(`${base}/table/sounds/boom-1.m4a`)).status).toBe(404);
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

  it("хозяин забирает обратно комнату, которую завёл вошедший", async () => {
    // Так бывает после перезапуска сервера: человек вошёл по своей же ссылке раньше, чем пришёл бот.
    const room = (await (await call("/table/rooms", { method: "POST", json: { home: { kind: "inline", message: "" }, by: "" } })).json()) as { room: string; by: string; title: string };
    expect(room.by).toBe("");
    const back = await (await call("/table/rooms", { method: "POST", json: { home: { kind: "inline", message: "m1" }, by: "tg:7", title: "Стол «Обетованный щит»", room: room.room } })).json();
    expect(back.by).toBe("tg:7");
    expect(back.title).toBe("Стол «Обетованный щит»");
    expect(back.room).toBe(room.room);
    // Чужую комнату так не забрать: у неё хозяин уже есть.
    const steal = await (await call("/table/rooms", { method: "POST", json: { home: { kind: "inline", message: "m2" }, by: "tg:8", title: "Моё", room: room.room } })).json();
    expect(steal.by).toBe("tg:7");
    expect(steal.title).toBe("Стол «Обетованный щит»");
  });

  it("РАСПОРЯДИТЕЛЯ ВЫДАЁТ ТОЛЬКО ХОЗЯИН КОМНАТЫ", async () => {
    const room = await (await call("/table/rooms", { method: "POST", json: { home: { kind: "inline", message: "m" }, by: "tg:1" } })).json();
    const gave = await call(`/table/rooms/${room.room}/admins`, { method: "POST", json: { by: "tg:1", key: "tg:2", on: true } });
    expect(gave.status).toBe(200);
    expect((await gave.json()).admins).toEqual(["tg:2"]);

    const stolen = await call(`/table/rooms/${room.room}/admins`, { method: "POST", json: { by: "tg:2", key: "tg:3", on: true } });
    expect(stolen.status, "распорядитель ролей не раздаёт").toBe(403);

    const back = await call(`/table/rooms/${room.room}/admins`, { method: "POST", json: { by: "tg:1", key: "tg:2", on: false } });
    expect((await back.json()).admins, "и забирает тоже хозяин").toEqual([]);
  });

  it("ЗАКРЫТЬ КОМНАТУ МОЖЕТ ТОЛЬКО ХОЗЯИН — распорядителю этого не отдают", async () => {
    const room = await (await call("/table/rooms", { method: "POST", json: { home: { kind: "inline", message: "m" }, by: "tg:1" } })).json();
    await call(`/table/rooms/${room.room}/admins`, { method: "POST", json: { by: "tg:1", key: "tg:2", on: true } });
    expect((await call(`/table/rooms/${room.room}?by=tg:2`, { method: "DELETE" })).status).toBe(403);
    expect((await call(`/table/rooms/${room.room}?by=tg:1`, { method: "DELETE" })).status).toBe(200);
  });

  it("много комнат на чат: открыть, перечислить, переименовать, закрыть", async () => {
    const one = await (await call("/table/rooms", { method: "POST", json: { home: { kind: "chat", chat: "-100" }, by: "tg:1", title: "Дурак" } })).json();
    await call("/table/rooms", { method: "POST", json: { home: { kind: "chat", chat: "-100" }, by: "tg:1" } });
    await call("/table/rooms", { method: "POST", json: { home: { kind: "chat", chat: "-200" }, by: "tg:1" } });
    expect(roomIsSigned(one.room, "s3cret")).toBe(true);

    const listed = await (await call("/table/rooms?chat=-100")).json();
    // Второй стол открыт без имени и без названия чата — имя ему дано случайное, на тему похода.
    const titles = listed.map((r: { title: string }) => r.title);
    expect(titles[0]).toBe("Дурак");
    expect(titles[1]).toMatch(/^Песочница\. .+ .+$/);

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
  it("пока маяка нет, /t/ — «недоступно»; с маяком — страница мака под этим адресом, без переадресации", async () => {
    expect((await call("/t/?x=1", { secret: null })).status).toBe(503);
    await call("/relay/table", { method: "POST", json: { url: `${base}/`, boot: "b1" } });
    const page = await call("/t/?tgWebAppStartParam=abc", { secret: null });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(`<base href="${base}/table/">`);
    expect(html).toContain(`window.__TABLE_HOST__ = "${base}"`);
    expect(html.indexOf("__TABLE_HOST__")).toBeLessThan(html.indexOf("app.js"));
    await call("/relay/table", { method: "POST", json: { url: "http://127.0.0.1:1", boot: "b1" } });
    expect((await call("/t/", { secret: null })).status).toBe(503);
  });

  /**
   * ЗАПИСЬ ПАРТИИ ОТКРЫВАЕТСЯ ЧЕРЕЗ ТОТ ЖЕ ПОСТОЯННЫЙ АДРЕС.
   *
   * Ссылку на запись пересылают и открывают позже, а имя мака живёт до следующего перезапуска
   * туннеля. Ссылка на мак протухала молча: человек получал «сюда так не войти» вместо партии.
   */
  it("/t/replay отдаёт страницу записи, а не стол", async () => {
    await call("/relay/table", { method: "POST", json: { url: `${base}/`, boot: "b1" } });
    const стол = await (await call("/t/?room=x", { secret: null })).text();
    const запись = await (await call("/t/replay?room=x&pass=y", { secret: null })).text();
    expect(запись).toContain(`<base href="${base}/table/">`);
    // Страницы разные: у записи свой скрипт, у стола свой.
    expect(запись).toContain("replay.js");
    expect(стол).toContain("app.js");
    expect(запись).not.toBe(стол);
  });

  it("адрес мака в страницу — без разрыва разметки", () => {
    const out = hostPage("<html><head><title>x</title>", 'https://a"b</script>');
    expect(out).not.toContain('a"b</script>');
    expect(out).toContain("<title>x</title>");
  });

  it("маяк без секрета не принимается; замолчавший маяк — стол «не жив»", async () => {
    expect((await call("/relay/table", { method: "POST", secret: null, json: { url: "https://x", boot: "b" } })).status).toBe(401);
    await call("/relay/table", { method: "POST", json: { url: "https://mac.example", boot: "b2" } });
    expect(relayStatus().up).toBe(true);
    expect(relayStatus(Date.now() + BEACON_TTL_MS + 1).up).toBe(false);
  });

  /** Своя дверь мака отвечает, всё остальное — в сеть как есть. */
  const doorOpen: typeof fetch = (url, init) => (String(url).startsWith("https://mac.example") ? Promise.resolve(new Response("ok")) : fetch(url, init));

  it("маяк мака шлёт свой адрес и boot", async () => {
    process.env.TABLE_PUBLIC_URL = "https://mac.example";
    process.env.TABLE_RELAY_URL = base;
    const stop = startBeacon(doorOpen);
    await new Promise((r) => setTimeout(r, 100));
    stop();
    expect(relayStatus()).toMatchObject({ up: true, url: "https://mac.example", boot: BOOT });
  });

  it("дверь, что ещё не открывалась, — не смерть, маяк бьёт; открылась и пропала подряд — зовёт на перезапуск и замолкает", async () => {
    process.env.TABLE_PUBLIC_URL = "https://mac.example";
    process.env.TABLE_RELAY_URL = base;
    vi.useFakeTimers();
    try {
      let door = false;
      const posted: string[] = [];
      const send: typeof fetch = async (url) => {
        if (String(url).startsWith("https://mac.example")) {
          if (!door) throw new Error("dns");
          return new Response("ok");
        }
        posted.push(String(url));
        return new Response("{}");
      };
      const dead = vi.fn();
      const stop = startBeacon(send, dead);
      for (let i = 0; i <= DOOR_DEAD_AFTER; i++) await vi.advanceTimersByTimeAsync(BEACON_EVERY_MS);
      expect(posted.length).toBeGreaterThan(DOOR_DEAD_AFTER);
      expect(dead).not.toHaveBeenCalled();

      door = true;
      await vi.advanceTimersByTimeAsync(BEACON_EVERY_MS);
      door = false;
      const was = posted.length;
      for (let i = 1; i < DOOR_DEAD_AFTER; i++) {
        await vi.advanceTimersByTimeAsync(BEACON_EVERY_MS);
        expect(dead).not.toHaveBeenCalled();
      }
      expect(posted.length).toBe(was + DOOR_DEAD_AFTER - 1);
      await vi.advanceTimersByTimeAsync(BEACON_EVERY_MS);
      expect(dead).toHaveBeenCalledTimes(1);

      door = true;
      const after = posted.length;
      await vi.advanceTimersByTimeAsync(BEACON_EVERY_MS * 2);
      expect(posted.length).toBe(after);
      expect(dead).toHaveBeenCalledTimes(1);
      stop();
    } finally {
      vi.useRealTimers();
    }
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
