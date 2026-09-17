// HTTP СТОЛА — три части, и у каждой свой хозяин:
//
//   /table/rooms…   сервер стола (мак). Управляет бот, общим секретом. Комнаты — только в памяти.
//   /relay/table    реле (Fly). Мак стучится сюда маяком, бот спрашивает «жив ли стол».
//   /t/             реле (Fly). Постоянный адрес Mini App: переадресует туда, где мак сейчас.
//
// Один и тот же код сервера стоит и там, и там — включается то, что сконфигурировано. Дев-кит этих
// путей не касается.

import { randomBytes, timingSafeEqual } from "crypto";
import express, { type Router } from "express";
import { tableConfig } from "./config.js";
import { DEFAULT_DESK, isDesk } from "./desks.js";
import { BEACON_EVERY_MS, BEACON_TTL_MS, CARD_BACKS, CARD_FACES, GAMES, SECRET_HEADER, type Beacon, type Game, type Home, type OpenRoom, type RelayStatus, type RunCommand, type TableCommand } from "./contract.js";
import { closeEntry, findEntry, openEntry, recast, rehome, rename, roomsAt, roomsBy, runIn } from "./lobby.js";
import { mintRoom, roomIsSigned } from "./roomIds.js";

/** Этот запуск. Новый процесс — новый `boot`: по нему бот понимает, что прежних столов нет. */
export const BOOT = randomBytes(6).toString("hex");

function sameSecret(given: unknown, secret: string | undefined): boolean {
  if (!secret || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const guarded: express.RequestHandler = (req, res, next) => {
  if (!sameSecret(req.header(SECRET_HEADER), tableConfig().secret)) return void res.status(401).json({ error: "unauthorized" });
  next();
};

function readHome(raw: unknown): Home | null {
  const home = raw as Partial<Home> | undefined;
  if (home?.kind === "chat" && typeof home.chat === "string" && home.chat) {
    return { kind: "chat", chat: home.chat, ...(typeof home.chatTitle === "string" && home.chatTitle.trim() ? { chatTitle: home.chatTitle.trim().slice(0, 48) } : {}) };
  }
  if (home?.kind === "inline" && typeof home.message === "string") return { kind: "inline", message: home.message };
  return null;
}

/** Команда из сети — только известные поля известных видов. */
export function readCommand(raw: unknown): TableCommand | null {
  const c = raw as Record<string, unknown> | undefined;
  if (!c || typeof c.t !== "string") return null;
  if (c.t === "collect" || c.t === "shuffle") return { t: c.t };
  if (c.t === "croupier" && typeof c.on === "boolean") return { t: "croupier", on: c.on };
  // Разбор пришедшего значения идёт по СПИСКУ родов (`GAMES`), а не по перечню имён в коде.
  const game = (g: unknown) => ((GAMES as readonly unknown[]).includes(g) ? (g as Game) : null);
  if (c.t === "preset") {
    const g = game(c.game);
    if (!g) return null;
    return { t: "preset", game: g, ...(c.size === 52 || c.size === 36 ? { size: c.size } : {}), ...(c.jokers === true ? { jokers: true } : {}) };
  }
  if (c.t === "look") {
    const faces = CARD_FACES.find((f) => f === c.faces);
    const back = CARD_BACKS.find((b) => b === c.back);
    if (!faces && !back) return null;
    return { t: "look", ...(faces ? { faces } : {}), ...(back ? { back } : {}) };
  }
  if (c.t === "deal") {
    const rule = c.rule === "each" ? "each" : game(c.rule);
    if (!rule) return null;
    return {
      t: "deal",
      rule,
      ...(Number.isInteger(c.n) && (c.n as number) > 0 && (c.n as number) <= 54 ? { n: c.n as number } : {}),
      ...(typeof c.dealer === "string" && c.dealer ? { dealer: c.dealer.slice(0, 64) } : {}),
      ...(c.skipEmpty === true ? { skipEmpty: true } : {}),
      ...(c.asDealer === true ? { asDealer: true } : {}),
      ...(c.force === true ? { force: true } : {}),
    };
  }
  return null;
}

export function tableRoutes(): Router {
  const r = express.Router();

  r.get("/table/health", (_req, res) => res.json({ boot: BOOT }));

  r.post("/table/rooms", guarded, (req, res) => {
    const body = (req.body ?? {}) as Partial<OpenRoom> & { room?: string };
    const home = readHome(body.home);
    const secret = tableConfig().secret!;
    if (!home || typeof body.by !== "string") return void res.status(400).json({ error: "bad_request" });
    // ИМЯ, ВЫПИСАННОЕ БОТОМ ЗАРАНЕЕ (inline-карточка), принимается только с его подписью.
    if (body.room !== undefined && !roomIsSigned(body.room, secret)) return void res.status(400).json({ error: "bad_request" });
    const room = body.room ?? mintRoom(secret);
    // РОД СТОЛА — необязателен и разбирается по каталогу (`desks.ts`): незнакомый род не ломает
    // открытие, а даёт песочницу. Бот и сервер обновляются порознь.
    res.json(openEntry(room, home, body.by, typeof body.title === "string" ? body.title : undefined, Date.now(), isDesk(body.kind) ? body.kind : DEFAULT_DESK));
  });

  r.get("/table/rooms", guarded, (req, res) => {
    const chat = typeof req.query.chat === "string" ? req.query.chat : null;
    if (!chat && typeof req.query.by === "string" && req.query.by) return void res.json(roomsBy(req.query.by));
    if (!chat) return void res.status(400).json({ error: "bad_request" });
    res.json(roomsAt({ kind: "chat", chat }));
  });

  r.get("/table/rooms/:room", guarded, (req, res) => {
    const found = findEntry(req.params.room);
    if (!found) return void res.status(404).json({ error: "not_found" });
    res.json(found);
  });

  r.patch("/table/rooms/:room", guarded, (req, res) => {
    const body = req.body ?? {};
    const home = body.home === undefined ? null : readHome(body.home);
    let out = findEntry(req.params.room);
    if (home) out = rehome(req.params.room, home);
    if (typeof body.title === "string") out = rename(req.params.room, body.title);
    // РОД МЕНЯЕТСЯ НА ХОДУ, а незнакомый — отказ: это выбор человека кнопкой, и молчать нельзя.
    if (body.kind !== undefined) {
      if (!isDesk(body.kind)) return void res.status(400).json({ error: "bad_request" });
      out = recast(req.params.room, body.kind);
    }
    if (!out) return void res.status(404).json({ error: "not_found" });
    res.json(out);
  });

  // КОМАНДА АДМИНА. Ответ — сразу после проверки; ходы идут в комнате дальше, с паузами.
  r.post("/table/rooms/:room/run", guarded, async (req, res) => {
    const body = (req.body ?? {}) as Partial<RunCommand>;
    const command = readCommand(body.command);
    if (typeof body.by !== "string" || !command) return void res.status(400).json({ error: "bad_request" });
    const out = await runIn(req.params.room, body.by, command);
    if (!out) return void res.status(404).json({ error: "not_found" });
    res.json(out);
  });

  r.delete("/table/rooms/:room", guarded, (req, res) => {
    if (!closeEntry(req.params.room)) return void res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  });

  return r;
}

// ── РЕЛЕ ──────────────────────────────────────────────────────────────────────────────────────

let heard: (Beacon & { at: number }) | null = null;

export function relayStatus(now = Date.now()): RelayStatus {
  const up = heard !== null && now - heard.at < BEACON_TTL_MS;
  return { up, url: heard?.url ?? null, boot: heard?.boot ?? null, seenAt: heard?.at ?? null };
}

export function forgetBeacon(): void {
  heard = null;
}

export function relayRoutes(fetchPage: (url: string) => Promise<Response> = (url) => fetch(url, { signal: AbortSignal.timeout(5000) })): Router {
  const r = express.Router();

  r.post("/relay/table", guarded, (req, res) => {
    const { url, boot } = (req.body ?? {}) as Partial<Beacon>;
    if (typeof url !== "string" || !/^https?:\/\//.test(url) || typeof boot !== "string") {
      return void res.status(400).json({ error: "bad_request" });
    }
    heard = { url: url.replace(/\/+$/, ""), boot, at: Date.now() };
    res.json({ ok: true });
  });

  r.get("/relay/table", (_req, res) => res.json(relayStatus()));

  // ПОСТОЯННЫЙ АДРЕС MINI APP — страница стола отдаётся ОТСЮДА, а не переадресацией на мак. Telegram на iOS
  // запоминает адрес, по которому открыл приложение, и молча выбрасывает события со страницы другого адреса:
  // вибрацию, `expand`, запрет свайпа. Поэтому страница берётся с мака в момент запроса (правка на маке видна
  // сразу) и получает адрес мака — оттуда она грузит скрипт, картинки, звуки и туда же открывает комнату.
  r.get(/^\/t(\/.*)?$/, async (_req, res) => {
    const status = relayStatus();
    const down = () => void res.status(503).type("html").send(DOWN_PAGE);
    if (!status.up || !status.url) return down();
    try {
      const page = await fetchPage(`${status.url}/table/`);
      if (!page.ok) return down();
      res.header("Cache-Control", "no-store, must-revalidate");
      res.type("html").send(hostPage(await page.text(), status.url));
    } catch {
      down();
    }
  });

  return r;
}

/** Страница мака под чужим адресом: относительные пути — к маку, адрес мака — столу. */
export function hostPage(html: string, host: string): string {
  const safe = JSON.stringify(host).replace(/</g, "\\u003c");
  return html.replace(/<head>/i, `<head>\n<base href="${host.replace(/"/g, "&quot;")}/table/">\n<script>window.__TABLE_HOST__ = ${safe};</script>`);
}

const DOWN_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Стол недоступен</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0704;color:#f5ead0;font:16px system-ui;text-align:center;padding:24px">
<div><p style="font-size:20px">Столы сейчас недоступны</p><p style="color:#cdb98f">Сервер стола выключен. Попробуй позже.</p></div>`;

// ── МАЯК ──────────────────────────────────────────────────────────────────────────────────────

export function startBeacon(send: typeof fetch = fetch): () => void {
  const { publicUrl, relayUrl, secret } = tableConfig();
  if (!publicUrl || !relayUrl || !secret) return () => {};
  const beat = () =>
    send(`${relayUrl.replace(/\/+$/, "")}/relay/table`, {
      method: "POST",
      headers: { "content-type": "application/json", [SECRET_HEADER]: secret },
      body: JSON.stringify({ url: publicUrl, boot: BOOT } satisfies Beacon),
    }).catch((err) => console.warn("маяк стола не дошёл до реле:", String(err)));
  void beat();
  const timer = setInterval(beat, BEACON_EVERY_MS);
  return () => clearInterval(timer);
}
