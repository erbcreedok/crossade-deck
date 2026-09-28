import type { AddressInfo } from "net";
import { createHmac } from "crypto";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { BEACON_EVERY_MS, BEACON_TTL_MS, CARD_BACKS, CARD_FACES, SECRET_HEADER } from "./contract.js";
import { clientRoutes } from "./client.js";
import { forgetAll, setAdmin } from "./lobby.js";
import { tellAll } from "../db/eventsRepo.js";
import { mintRoom, roomIsSigned } from "./roomIds.js";
import { mintAppKey } from "./appPass.js";
import { BOOT, DOOR_DEAD_AFTER, forgetBeacon, readCommand, relayRoutes, relayStatus, startBeacon, tableRoutes } from "./routes.js";
import { hostPage } from "./hostPage.js";
import { grantParts } from "../db/tableOwnedRepo.js";
import { partsFor } from "./skins.js";

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

  it("реле несколько через запятую — маяк бьёт в каждое", async () => {
    process.env.TABLE_PUBLIC_URL = "https://mac.example";
    process.env.TABLE_RELAY_URL = "https://fly.example/, https://w.example";
    const posted: string[] = [];
    const send: typeof fetch = async (url) => {
      if (!String(url).startsWith("https://mac.example")) posted.push(String(url));
      return new Response("{}");
    };
    const stop = startBeacon(send);
    await new Promise((r) => setTimeout(r, 50));
    stop();
    expect(posted.filter((u) => u.endsWith("/relay/table"))).toEqual(["https://fly.example/relay/table", "https://w.example/relay/table"]);
  });

  it("реле узнало стол — стол один раз прогревает его кэш своим скриптом", async () => {
    process.env.TABLE_PUBLIC_URL = "https://mac.example";
    process.env.TABLE_RELAY_URL = "https://w.example";
    vi.useFakeTimers();
    try {
      const got: string[] = [];
      const send: typeof fetch = async (url) => {
        const u = String(url);
        if (!u.startsWith("https://mac.example")) got.push(u);
        if (u.endsWith("/t/")) return new Response('<script type="module" src="app.js?v=abc123"></script>');
        return new Response("{}");
      };
      const stop = startBeacon(send);
      for (let i = 0; i < 3; i++) await vi.advanceTimersByTimeAsync(BEACON_EVERY_MS);
      stop();
      expect(got.filter((u) => u === "https://w.example/table/app.js?v=abc123")).toHaveLength(1);
      expect(got.filter((u) => u.endsWith("/relay/table")).length).toBeGreaterThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
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

describe("/table/rooms/:room/records — записи комнаты для бота и страницы", () => {
  it("под секретом — люди, посиделки, партии и пропуск; без секрета — отказ", async () => {
    const room = "rec-room";
    tellAll([
      { at: 1, room, side: "table", kind: "room.open" },
      { at: 2, room, who: "tg:7", side: "table", kind: "join", what: { name: "Ye" } },
      { at: 3, room, who: "tg:7", side: "table", kind: "match.start", what: { игроки: [{ key: "tg:7", name: "Ye" }], snapshot: { big: 1 } } },
      { at: 4, room, who: "tg:8", side: "table", kind: "match.end", what: { вышли: ["tg:7"] } },
      { at: 5, room, side: "table", kind: "patch", what: { v: 1, ops: [] } },
    ]);
    expect((await call(`/table/rooms/${room}/records`, { secret: null })).status).toBe(401);
    const got = (await (await call(`/table/rooms/${room}/records`)).json()) as { people: { name: string }[]; sessions: { matches: { loser: string }[] }[]; pass: string; until: number };
    expect(got.people.map((one) => one.name)).toEqual(["Ye"]);
    expect(got.sessions[0]!.matches).toEqual([expect.objectContaining({ loser: "tg:8", out: ["tg:7"] })]);
    expect(typeof got.pass).toBe("string");
    // Пропуск открывает ленту ровно этой партии — по номерам её границ.
    const m = got.sessions[0]!.matches[0] as unknown as { from: number; to: number };
    const lane = (await (await call(`/table/journal?room=${room}&pass=${encodeURIComponent(got.pass)}&from=${m.from}&to=${m.to}`, { secret: null })).json()) as { deeds: { kind: string }[] };
    expect(lane.deeds.map((d) => d.kind)).toEqual(["match.start", "match.end"]);
  });
});

describe("/table/records — записи человека или чата, живые и закрытые", () => {
  type Got = { rooms: { room: string; title: string; live: boolean; pass: string; records: { sessions: { matches: { to: number | null; guessed?: boolean }[] }[] } }[] };
  const ask = async (q: string) => ((await (await call(`/table/records?${q}`)).json()) as Got).rooms;

  it("закрытый стол не прячет записи; доступ — тем, кто открыл или сидел, и чату, где стол жил; чужому — ничего", async () => {
    const now = Date.now();
    // ЖИВОЙ СТОЛ tg:1 в чате c1: партия начата и не доиграна.
    const live = (await (await call("/table/rooms", { method: "POST", json: { home: { kind: "chat", chat: "c1" }, by: "tg:1" } })).json()) as { room: string };
    tellAll([
      { at: now, room: live.room, side: "table", kind: "room.open", what: { by: "tg:1", home: { kind: "chat", chat: "c1" } } },
      { at: now + 1, room: live.room, who: "tg:1", side: "table", kind: "match.start", what: { игроки: [{ key: "tg:1", name: "Ye" }] } },
    ]);
    // ЗАКРЫТЫЙ СТОЛ tg:1 в чате c1: в лобби его нет, в журнале — старая партия без `match.start`, доиграна.
    tellAll([
      { at: now, room: "closed-room", side: "table", kind: "room.open", what: { title: "Крестовый. Брод", by: "tg:1", home: { kind: "chat", chat: "c1" } } },
      { at: now + 1, room: "closed-room", who: "tg:2", side: "table", kind: "join", what: { name: "Бо" } },
      { at: now + 2, room: "closed-room", side: "table", kind: "match", what: { идёт: true, ход: "c1", вышли: [] } },
      { at: now + 3, room: "closed-room", who: "tg:2", side: "table", kind: "act", what: { intent: { t: "grab", id: "x" } } },
      { at: now + 4, room: "closed-room", side: "table", kind: "match", what: { идёт: true, ход: null, вышли: ["c1"] } },
      { at: now + 5, room: "closed-room", side: "table", kind: "room.close", what: { home: { kind: "chat", chat: "c1" } } },
      { at: now, room: "other-room", side: "table", kind: "room.open", what: { by: "tg:9", home: { kind: "chat", chat: "c9" } } },
    ]);

    const mine = await ask("by=tg:1");
    expect(mine.map((r) => [r.room, r.live]).sort()).toEqual([["closed-room", false], [live.room, true]].sort());
    const closed = mine.find((r) => r.room === "closed-room")!;
    expect(closed.title).toBe("Крестовый. Брод");
    expect(closed.records.sessions[0]!.matches, "старая партия — по ходу партии, доиграна").toEqual([expect.objectContaining({ guessed: true, to: expect.any(Number) })]);
    expect(mine.find((r) => r.room === live.room)!.records.sessions[0]!.matches, "не доиграна").toEqual([expect.objectContaining({ to: null })]);
    expect(typeof closed.pass).toBe("string");

    expect((await ask("by=tg:2")).map((r) => r.room), "сидел — видит").toEqual(["closed-room"]);
    expect(await ask("by=tg:3"), "чужой — ничего").toEqual([]);
    expect((await ask("chat=c1")).map((r) => r.room).sort()).toEqual(["closed-room", live.room].sort());
    expect((await ask("chat=c9")).map((r) => r.room)).toEqual(["other-room"]);
    expect(await ask("chat=nothing"), "нет записей — пусто, а не ошибка").toEqual([]);
    expect((await call("/table/records?by=tg:1", { secret: null })).status, "без секрета").toBe(401);
    expect((await call("/table/records")).status, "без кого").toBe(400);
    expect((await ask("by=tg:1")).some((r) => r.room === "closed-room" && r.live), "закрытый не ожил").toBe(false);
  });
});

describe("/table/my — «Мои комнаты» по подписи Telegram", () => {
  const signed = (id: number) => {
    const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "X" }) };
    const line = Object.keys(fields).sort().map((k) => `${k}=${fields[k as keyof typeof fields]}`).join("\n");
    const key = createHmac("sha256", "WebAppData").update("bot-token").digest();
    return new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(line).digest("hex") }).toString();
  };
  type Mine = { rooms: { room: string; why: string[]; chat: string | null }[]; closed: { room: string; title: string; replay?: { pass: string; from: number; to: number | null } }[] };
  const my = async (id: number) => (await (await fetch(`${base}/table/my`, { headers: { "x-telegram-init-data": signed(id) } })).json()) as Mine;
  const open = async (by: string, chat: string, title?: string) =>
    ((await (await call("/table/rooms", { method: "POST", json: { home: { kind: "chat", chat, chatTitle: `Чат ${chat}` }, by, ...(title ? { title } : {}) } })).json()) as { room: string }).room;

  it("основания: создал, админ, сидел, комната чата, где он бывал; чужой чат не показан; дублей нет; закрытая — отдельно, с записью", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    const now = Date.now();
    const owned = await open("tg:101", "my-a");
    const adminOf = await open("tg:900", "my-b");
    setAdmin(adminOf, "tg:900", "tg:101", true);
    const visited = await open("tg:900", "my-c");
    const sameChat = await open("tg:901", "my-c");
    const stranger = await open("tg:902", "my-z");
    tellAll([
      { at: now, room: visited, who: "tg:101", side: "table", kind: "join", what: { name: "Ye" } },
      { at: now, room: owned, who: "tg:101", side: "table", kind: "join", what: { name: "Ye" } },
      // Закрытая: в лобби её нет, в журнале — открытие с чатом, его вход и доигранная партия.
      { at: now - 5000, room: "my-closed", side: "table", kind: "room.open", what: { title: "Крестовый. Брод", by: "tg:900", home: { kind: "chat", chat: "my-y" } } },
      { at: now - 4000, room: "my-closed", who: "tg:101", side: "table", kind: "join", what: { name: "Ye" } },
      { at: now - 3000, room: "my-closed", who: "tg:101", side: "table", kind: "match.start", what: { игроки: [{ key: "tg:101", name: "Ye" }] } },
      { at: now - 2000, room: "my-closed", who: "tg:101", side: "table", kind: "match.end", what: { вышли: [] } },
      { at: now - 1000, room: "my-closed", side: "table", kind: "room.close", what: { home: { kind: "chat", chat: "my-y" } } },
    ]);
    const got = await my(101);
    const why = Object.fromEntries(got.rooms.map((r) => [r.room, r.why]));
    expect(why[owned]).toEqual(["owner", "visited"]);
    expect(why[adminOf]).toEqual(["admin"]);
    expect(why[visited]).toEqual(["visited"]);
    expect(why[sameChat], "живёт в чате, где он сидел за столом").toEqual(["chat"]);
    expect(why[stranger], "чужой чат — не его").toBeUndefined();
    expect(got.rooms.filter((r) => r.room === owned), "одна строка на комнату").toHaveLength(1);
    expect(got.rooms.find((r) => r.room === sameChat)?.chat).toBe("Чат my-c");
    expect(got.rooms.some((r) => r.room === "my-closed"), "закрытая — не действующая").toBe(false);
    expect(got.closed).toEqual([expect.objectContaining({ room: "my-closed", title: "Крестовый. Брод", replay: expect.objectContaining({ from: expect.any(Number), to: expect.any(Number) }) })]);
    expect((await call("/table/rooms?by=tg:900")).status, "список не оживил закрытую").toBe(200);
    expect(((await (await call("/table/rooms?by=tg:900")).json()) as { room: string }[]).some((r) => r.room === "my-closed")).toBe(false);
  });

  it("никого не знает — пустой список; без подписи — отказ", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    expect(await my(555)).toEqual({ rooms: [], closed: [] });
    expect((await fetch(`${base}/table/my`)).status).toBe(401);
    expect((await fetch(`${base}/table/my`, { headers: { "x-telegram-init-data": "hash=forged&user=%7B%22id%22%3A1%7D" } })).status).toBe(401);
  });
});

describe("/table/admin/rooms — «Все столы» только хозяевам", () => {
  const signed = (id: number) => {
    const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "X" }) };
    const line = Object.keys(fields).sort().map((k) => `${k}=${fields[k as keyof typeof fields]}`).join("\n");
    const key = createHmac("sha256", "WebAppData").update("bot-token").digest();
    return new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(line).digest("hex") }).toString();
  };

  it("хозяин по подписи Telegram видит комнаты с записями; чужой и без подписи — нет", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    process.env.TABLE_OWNERS = "tg:254410503";
    tellAll([
      { at: Date.now(), room: "admin-room", side: "table", kind: "room.open", what: { title: "Крестовый. Брод", kind: "krest" } },
      { at: Date.now(), room: "admin-room", who: "tg:7", side: "table", kind: "join", what: { name: "Ye" } },
    ]);
    expect((await call("/table/admin/rooms", { secret: null })).status, "без подписи").toBe(403);
    expect((await fetch(`${base}/table/admin/rooms`, { headers: { "x-telegram-init-data": signed(1) } })).status, "чужой").toBe(403);
    const res = await fetch(`${base}/table/admin/rooms`, { headers: { "x-telegram-init-data": signed(254410503) } });
    expect(res.status, "хозяин").toBe(200);
    const { rooms } = (await res.json()) as { rooms: { room: string; title: string; live: boolean; pass: string; records: { people: { name: string }[] } }[] };
    const one = rooms.find((r) => r.room === "admin-room");
    expect(one, "закрытая комната из журнала — с именем, каким её открыли").toMatchObject({ title: "Крестовый. Брод", live: false });
    expect(one!.records.people.map((p) => p.name)).toEqual(["Ye"]);
    expect(typeof one!.pass).toBe("string");
  });
});

describe("/table/profile — кем сижу и мой цвет", () => {
  const key = (who: string) => mintAppKey({ key: who, name: "Гость 1" }, "s3cret", Date.now() + 60_000);
  const ask = (who: string | null, init: RequestInit & { json?: unknown } = {}) =>
    fetch(`${base}/table/profile`, {
      ...init,
      headers: { "content-type": "application/json", ...(who ? { "x-crossade-app-key": key(who) } : {}) },
      ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
    });

  it("без ключа — 401; с ключом — кукла по ключу, пока не выбирал", async () => {
    expect((await ask(null)).status).toBe(401);
    const got = (await (await ask("dev:p1")).json()) as { doll: string; palette: number; chosen: boolean; telegram: boolean; owned: string[] };
    expect(got.doll, "вначале у всех палка с кружком-аватаром").toBe("stick");
    expect(got.owned).toContain("stick:body");
    expect(got.owned).not.toContain("king:body");
    expect(got.palette).toBeGreaterThanOrEqual(0);
    expect(got.chosen).toBe(false);
    expect(got.telegram).toBe(false);
  });

  it("набора, которого нет, не выбрать; выдали — выбирается", async () => {
    const no = (await (await ask("dev:p8", { method: "PATCH", json: { doll: "dog", parts: { head: "cube:head" } } })).json()) as { doll: string; parts: Record<string, string> };
    expect(no.doll).toBe("stick");
    expect(no.parts.head).toBe("ball:head");
    grantParts("dev:p8", Object.values(partsFor("dog")), "test");
    const yes = (await (await ask("dev:p8", { method: "PATCH", json: { doll: "dog" } })).json()) as { doll: string; parts: Record<string, string> };
    expect(yes.doll).toBe("dog");
    expect(yes.parts.body).toBe("dog:body");
  });

  it("скин — набор частей: своя часть ложится поверх набора, новый набор сбрасывает свои, чужой слот не принимается", async () => {
    grantParts("dev:p9", [...Object.values(partsFor("dog")), ...Object.values(partsFor("spade-K")), "cube:head", "crown:hair"], "test");
    const dog = (await (await ask("dev:p9", { method: "PATCH", json: { doll: "dog" } })).json()) as { parts: Record<string, string> };
    expect(dog.parts).toMatchObject({ head: "dog:head", body: "dog:body", legs: "legs-beast:legs" });
    const mine = (await (await ask("dev:p9", { method: "PATCH", json: { parts: { head: "cube:head", body: "cube:head" } } })).json()) as { parts: Record<string, string> };
    expect(mine.parts).toMatchObject({ head: "cube:head", body: "dog:body" });
    const again = (await (await ask("dev:p9", { method: "PATCH", json: { parts: { hair: "crown:hair" } } })).json()) as { parts: Record<string, string> };
    expect(again.parts).toMatchObject({ head: "cube:head", hair: "crown:hair" });
    const king = (await (await ask("dev:p9", { method: "PATCH", json: { doll: "spade-K" } })).json()) as { parts: Record<string, string> };
    expect(king.parts).toMatchObject({ head: "spade-K:head", hair: "none:hair", body: "spade-K:body" });
  });

  it("выбрал — запомнилось; негодное (чужая кукла, расцветка вне списка, цвет не из восьми) не принимается", async () => {
    grantParts("dev:p2", Object.values(partsFor("queen")), "test");
    const saved = (await (await ask("dev:p2", { method: "PATCH", json: { doll: "queen", palette: 12, color: "#e0483f" } })).json()) as { doll: string; palette: number; color: string; chosen: boolean };
    expect(saved).toMatchObject({ doll: "queen", palette: 12, color: "#e0483f", chosen: true });
    const bad = (await (await ask("dev:p2", { method: "PATCH", json: { doll: "jester", palette: 99, color: "#123456" } })).json()) as { doll: string; palette: number; color: string };
    expect(bad).toMatchObject({ doll: "queen", palette: 12, color: "#e0483f" });
  });
});
