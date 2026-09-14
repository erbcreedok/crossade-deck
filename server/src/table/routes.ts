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
import { BEACON_EVERY_MS, BEACON_TTL_MS, SECRET_HEADER, type Beacon, type Home, type OpenRoom, type RelayStatus } from "./contract.js";
import { closeEntry, findEntry, openEntry, rehome, rename, roomsAt } from "./lobby.js";
import { mintRoom } from "./roomIds.js";

/** Этот запуск. Новый процесс — новый `boot`: по нему бот понимает, что прежних столов нет. */
export const BOOT = randomBytes(6).toString("hex");

function sameSecret(given: unknown, secret: string | undefined): boolean {
  if (!secret || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const guarded: express.RequestHandler = (req, res, next) => {
  if (!sameSecret(req.header(SECRET_HEADER), tableConfig().secret)) return void res.status(401).json({ error: "unauthorized" });
  next();
};

function readHome(raw: unknown): Home | null {
  const home = raw as Partial<Home> | undefined;
  if (home?.kind === "chat" && typeof home.chat === "string" && home.chat) return { kind: "chat", chat: home.chat };
  if (home?.kind === "inline" && typeof home.message === "string") return { kind: "inline", message: home.message };
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
    const room = typeof body.room === "string" ? body.room : mintRoom(secret);
    res.json(openEntry(room, home, body.by, typeof body.title === "string" ? body.title : undefined));
  });

  r.get("/table/rooms", guarded, (req, res) => {
    const chat = typeof req.query.chat === "string" ? req.query.chat : null;
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

export function relayRoutes(): Router {
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

  // ПОСТОЯННЫЙ АДРЕС MINI APP. Telegram кладёт `initData` во фрагмент (`#tgWebAppData=…`), а
  // фрагмент браузер при переадресации сохраняет сам — нести его руками не надо и нельзя: до
  // сервера он не доходит.
  r.get(/^\/t(\/.*)?$/, (req, res) => {
    const status = relayStatus();
    if (!status.up || !status.url) {
      return void res.status(503).type("html").send(DOWN_PAGE);
    }
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    res.redirect(302, `${status.url}/table/${query}`);
  });

  return r;
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
