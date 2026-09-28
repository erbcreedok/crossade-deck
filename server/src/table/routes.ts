// HTTP СТОЛА — три части, и у каждой свой хозяин:
//
//   /table/rooms…   сервер стола (мак). Управляет бот, общим секретом. Комнаты — только в памяти.
//   /relay/table    реле. Мак стучится сюда маяком, бот спрашивает «жив ли стол».
//   /t/             реле. Постоянный адрес Mini App: страница мака под этим адресом.
//
// Реле сейчас — Cloudflare Worker (`relayWorker.ts`, `deploy/relay-worker`); эти маршруты — то же реле на
// самом сервере, для того дня, когда он переедет на постоянный адрес целиком.
//
// Один и тот же код сервера стоит и там, и там — включается то, что сконфигурировано. Дев-кит этих
// путей не касается.

import { appKeyBearer, KEY_DAYS, mintAppKey } from "./appPass.js";
import { randomBytes, timingSafeEqual } from "crypto";
import express, { type Router } from "express";
import { tableConfig } from "./config.js";
import { DOWN_PAGE, hostPage } from "./hostPage.js";
import { DEFAULT_DESK, isDesk } from "./desks.js";
import { isCrew } from "./crews.js";
import { BEACON_EVERY_MS, BEACON_TTL_MS, CARD_BACKS, CARD_FACES, GAMES, SECRET_HEADER, type Beacon, type Game, type Home, type OpenRoom, type RelayStatus, type RunCommand, type TableCommand } from "./contract.js";
import { allEntries, closeEntry, findEntry, isBuried, openEntry, ownerOf, recast, recrew, rehome, rename, roomsAt, roomsBy, botsIn, lookIn, playIn, runIn, setAdmin } from "./lobby.js";
import { mintRoom, roomIsSigned } from "./roomIds.js";
import { deeds, deedsBetween, deedsOfKinds, KEEP_DAYS, roomInJournal, roomsOfJournal, roomsSeen } from "../db/eventsRepo.js";
import { RECORD_KINDS, recordsOf } from "./records.js";
import { roomsReport } from "./admin.js";
import { myRooms } from "./mine.js";
import { carryTableProfile, saveTableProfile, tableProfile } from "../db/tableProfilesRepo.js";
import { carryOwned, ownedParts } from "../db/tableOwnedRepo.js";
import { ownedOf, setsOwned, wearable } from "./rewards.js";
import { grantDue } from "./gifts.js";
import { cleanDoll, dollFor, ownParts } from "./dolls.js";
import { cleanParts, partsFor } from "./skins.js";
import { INKS, inkFor } from "../profileInks.js";
import { verifyTelegramInitData, verifyTelegramLogin } from "../telegramAuth.js";

/** Подпись Mini App — заголовком: в адресе ей не место, адрес пересылают. */
export const TELEGRAM_HEADER = "x-telegram-init-data";
/** Ключ приложения Crossade — вместо подписи Telegram, там, где её нет. */
export const APP_KEY_HEADER = "x-crossade-app-key";
import { mintPass, passRoom, PASS_HOURS } from "./pass.js";

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
  if (home?.kind === "app") return { kind: "app" };
  return null;
}

/** Команда из сети — только известные поля известных видов. */
export function readCommand(raw: unknown): TableCommand | null {
  const c = raw as Record<string, unknown> | undefined;
  if (!c || typeof c.t !== "string") return null;
  if (c.t === "collect" || c.t === "shuffle") return { t: c.t };
  // ДЕЛО СТОЛА ИЗВНЕ — то же, что кнопка в окне крупье: исполнение одно, входов много. Имя дела
  // проверит сам стол по каталогу набора; здесь только форма.
  if (c.t === "crew" && typeof c.act === "string" && c.act.length <= 32) {
    return { t: "crew", act: c.act, ...(typeof c.chair === "string" && c.chair.length <= 32 ? { chair: c.chair } : {}) };
  }
  if (c.t === "croupier" && typeof c.on === "boolean") return { t: "croupier", on: c.on };
  // Игроки без человека: сколько посадить; ноль уводит всех.
  if (c.t === "bots" && Number.isInteger(c.n)) {
    // Мозг и характер — только именами из каталога: чужая строка тут стала бы именем файла.
    const brain = typeof c.brain === "string" && c.brain.length <= 32 ? c.brain : undefined;
    const profile = typeof c.profile === "string" && c.profile.length <= 32 ? c.profile : undefined;
    return { t: "bots", n: Math.max(0, Math.min(8, c.n as number)), ...(brain === undefined ? {} : { brain }), ...(profile === undefined ? {} : { profile }) };
  }
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
  if (c.t === "redeal") return { t: "redeal" };
  if (c.t === "seat" && c.do === "place") {
    if (!Array.isArray(c.chairs)) return null;
    const chairs = c.chairs
      .filter((one): one is { chair: string; angle: number } => typeof one === "object" && one !== null && typeof (one as { chair?: unknown }).chair === "string" && Number.isFinite((one as { angle?: unknown }).angle))
      .slice(0, 32)
      .map((one) => ({ chair: one.chair.slice(0, 64), angle: one.angle }));
    return chairs.length > 0 ? { t: "seat", do: "place", chairs } : null;
  }
  if (c.t === "seat") {
    const acts = ["kick", "add", "sweep", "dealer", "swap"] as const;
    const act = acts.find((a) => a === c.do);
    if (!act) return null;
    return {
      t: "seat",
      do: act,
      ...(typeof c.chair === "string" && c.chair ? { chair: c.chair.slice(0, 64) } : {}),
      ...(typeof c.with === "string" && c.with ? { with: c.with.slice(0, 64) } : {}),
    };
  }
  if (c.t === "deal") {
    const rule = c.rule === "each" ? "each" : game(c.rule);
    if (!rule) return null;
    return {
      t: "deal",
      rule,
      ...(Number.isInteger(c.n) && (c.n as number) > 0 && (c.n as number) <= 54 ? { n: c.n as number } : {}),
      ...(typeof c.dealer === "string" && c.dealer ? { dealer: c.dealer.slice(0, 64) } : {}),
      ...(typeof c.from === "string" && c.from ? { from: c.from.slice(0, 64) } : {}),
      ...(Array.isArray(c.seats) ? { seats: c.seats.filter((s): s is string => typeof s === "string").slice(0, 32) } : {}),
      ...(c.dir === "cw" || c.dir === "ccw" ? { dir: c.dir } : {}),
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

  // ПЕРЕХОД В ПРИЛОЖЕНИЕ. Telegram открывает наружу только http(s), а приложение зовётся своей схемой
  // `crossade://` — поэтому Mini App открывает эту страницу в Safari, а она уже передаёт комнату и пропуск
  // приложению. Кнопка — на случай, если Safari не перешёл сам.
  r.get("/table/app", (_req, res) => {
    res.header("Cache-Control", "no-store");
    res.type("html").send(APP_PAGE);
  });

  /**
   * ЖУРНАЛ НАРУЖУ — под тем же секретом, что и управление столом. Читать его будет разбор жалобы, а
   * не игрок: в записях лежат ключи людей, их нажатия и ошибки их браузеров.
   *
   * Без комнаты отдаётся список комнат, о которых журнал вообще что-то помнит: с него начинается
   * любой разбор, потому что комнату по жалобе обычно и надо сперва найти.
   */
  /**
   * ПРОПУСК НА ОДНУ ЗАПИСЬ. Выписывается по секрету стола, а живёт сам по себе: его можно открыть с
   * телефона и переслать, не нося при этом ключ от комнат.
   */
  r.post("/table/journal/pass", guarded, (req, res) => {
    const { room, hours } = (req.body ?? {}) as { room?: unknown; hours?: unknown };
    if (typeof room !== "string" || !room) return void res.status(400).json({ error: "bad_request" });
    const live = Math.min(typeof hours === "number" && hours > 0 ? hours : PASS_HOURS, 24 * 30);
    const until = Date.now() + live * 60 * 60 * 1000;
    res.json({ pass: mintPass(room, tableConfig().secret!, until), until });
  });

  /** Секрет стола ИЛИ пропуск на эту самую комнату. Пропуск не открывает ни список комнат, ни чужую. */
  const journalGuard: express.RequestHandler = (req, res, next) => {
    const room = (req.query as { room?: string }).room;
    const pass = passRoom((req.query as { pass?: string }).pass, tableConfig().secret ?? "");
    if (pass !== null && room !== undefined && pass === room) return void next();
    return void guarded(req, res, next);
  };

  r.get("/table/journal", journalGuard, (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    if (q.room === undefined) return void res.json({ rooms: roomsSeen(Number(q.limit) || 50) });
    // ЗАПИСЬ ОДНОЙ ПАРТИИ — лента от её начала до конца, целиком, без обрезки «последних пяти тысяч».
    if (q.from !== undefined) {
      const from = Number(q.from);
      const to = q.to === undefined || q.to === "" ? null : Number(q.to);
      if (!Number.isInteger(from) || (to !== null && !Number.isInteger(to))) return void res.status(400).json({ error: "bad_request" });
      return void res.json({ room: q.room, deeds: deedsBetween(q.room, from, to) });
    }
    const limit = Math.min(Number(q.limit) || 500, 5000);
    res.json({
      room: q.room,
      deeds: deeds({ room: q.room, ...(q.who ? { who: q.who } : {}), ...(q.kind ? { kind: q.kind } : {}), ...(q.since ? { since: Number(q.since) } : {}), limit }),
    });
  });

  r.post("/table/rooms", guarded, (req, res) => {
    const body = (req.body ?? {}) as Partial<OpenRoom> & { room?: string };
    const home = readHome(body.home);
    const secret = tableConfig().secret!;
    if (!home || typeof body.by !== "string") return void res.status(400).json({ error: "bad_request" });
    // ИМЯ, ВЫПИСАННОЕ БОТОМ ЗАРАНЕЕ (inline-карточка), принимается только с его подписью.
    if (body.room !== undefined && !roomIsSigned(body.room, secret)) return void res.status(400).json({ error: "bad_request" });
    const room = body.room ?? mintRoom(secret);
    // ЗАКРЫТУЮ КОМНАТУ НЕ ОТКРЫТЬ ЗАНОВО. Бот после перезапуска сервера открывает всё, что помнит, —
    // и этой дверью воскрешал только что закрытые. `404` он читает как «её больше нет» и забывает.
    if (isBuried(room)) return void res.status(404).json({ error: "not_found" });
    // РОД СТОЛА — необязателен и разбирается по каталогу (`desks.ts`): незнакомый род не ломает
    // открытие, а даёт песочницу. Бот и сервер обновляются порознь.
    res.json(openEntry(room, home, body.by, typeof body.title === "string" ? body.title : undefined, Date.now(), isDesk(body.kind) ? body.kind : DEFAULT_DESK, isCrew(body.crew) ? body.crew : undefined));
  });

  r.get("/table/rooms", guarded, (req, res) => {
    const chat = typeof req.query.chat === "string" ? req.query.chat : null;
    if (!chat && typeof req.query.by === "string" && req.query.by) return void res.json(roomsBy(req.query.by));
    if (!chat) return void res.status(400).json({ error: "bad_request" });
    res.json(roomsAt({ kind: "chat", chat }));
  });

  /**
   * ЗАПИСИ КОМНАТЫ — кто бывал, какие были посиделки и партии (`records.ts`), и пропуск на все её
   * записи на весь срок журнала: ссылки из них собирает тот, кто показывает, — бот или страница.
   */
  r.get("/table/rooms/:room/records", guarded, (req, res) => {
    const room = req.params.room;
    const log = deedsOfKinds(room, RECORD_KINDS);
    const until = Date.now() + KEEP_DAYS * 24 * 60 * 60 * 1000;
    const records = recordsOf(log);
    res.json({ room, ...records, title: findEntry(room)?.title ?? records.title, pass: mintPass(room, tableConfig().secret!, until), until });
  });

  /**
   * ЗАПИСИ ДЛЯ ЧЕЛОВЕКА ИЛИ ЧАТА — живые комнаты и закрытые. Кому что показывать, решает здесь журнал,
   * а не список открытых столов: закрытие стола не прячет его партии.
   *
   *   `?by=<ключ>`   — столы, которые он открыл или за которыми сидел (личка);
   *   `?chat=<чат>`  — столы этого чата.
   *
   * Закрытая комната отсюда не оживает: она лишь читается из журнала.
   */
  r.get("/table/records", guarded, (req, res) => {
    const by = typeof req.query.by === "string" && req.query.by ? req.query.by : undefined;
    const chat = typeof req.query.chat === "string" && req.query.chat ? req.query.chat : undefined;
    if (!by && !chat) return void res.status(400).json({ error: "bad_request" });
    const live = [...(chat ? roomsAt({ kind: "chat", chat }) : []), ...(by ? roomsBy(by) : [])];
    const seen = roomsOfJournal({ ...(by ? { by } : {}), ...(chat ? { chat } : {}) });
    const until = Date.now() + KEEP_DAYS * 24 * 60 * 60 * 1000;
    const rooms = roomsReport(seen, live, (room) => deedsOfKinds(room, RECORD_KINDS)).map(({ room, title, live: alive, lastAt, records }) => ({ room, title, live: alive, lastAt, records, pass: mintPass(room, tableConfig().secret!, until) }));
    res.json({ rooms, until });
  });

  /**
   * МОИ КОМНАТЫ — стартовая страница мини-аппа без ссылки на стол (`mine.ts`). Кто спрашивает, говорит
   * подпись Telegram в заголовке — другого способа узнать человека у страницы нет, и без неё отказ.
   * Закрытые приходят отдельно, с пропуском на запись последней партии, если она есть.
   */
  r.get("/table/my", (req, res) => {
    const config = tableConfig();
    const signed = req.header(TELEGRAM_HEADER);
    const user = signed && config.botToken ? verifyTelegramInitData(signed, config.botToken) : null;
    // Из приложения Crossade — ключом приложения (`appPass.ts`) вместо подписи Telegram.
    const bearer = !user && config.secret ? appKeyBearer(req.header(APP_KEY_HEADER), config.secret) : null;
    if (!user && !bearer) return void res.status(401).json({ error: "who_are_you" });
    const key = user ? `tg:${user.id}` : bearer!.key;
    const found = new Map<string, ReturnType<typeof roomInJournal>>();
    const journal = (room: string) => (found.has(room) ? found.get(room)! : (found.set(room, roomInJournal(room)), found.get(room)!));
    const mine = myRooms(key, allEntries(), roomsOfJournal({ by: key }), (room) => (journal(room)?.home as Home | null) ?? null, (room) => journal(room)?.title ?? null);
    const until = Date.now() + KEEP_DAYS * 24 * 60 * 60 * 1000;
    const closed = mine.closed.slice(0, 8).map((one) => {
      const last = recordsOf(deedsOfKinds(one.room, RECORD_KINDS)).sessions.flatMap((s) => s.matches).at(-1);
      return { ...one, ...(last ? { replay: { pass: mintPass(one.room, config.secret!, until), from: last.from, to: last.to } } : {}) };
    });
    res.json({ rooms: mine.rooms, closed });
  });

  // ─── ПРОФИЛЬ СТОЛА: кем сижу (кукла, расцветка) и мой цвет ────────────────────────────────────────
  // Кто спрашивает — так же, как у «Моих комнат»: подпись Telegram или ключ приложения.
  const whoAsks = (req: express.Request): { key: string; name: string; photo?: string } | null => {
    const config = tableConfig();
    const signed = req.header(TELEGRAM_HEADER);
    const user = signed && config.botToken ? verifyTelegramInitData(signed, config.botToken) : null;
    if (user) return { key: `tg:${user.id}`, name: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `#${user.id}`, ...(user.photo_url ? { photo: user.photo_url } : {}) };
    const bearer = config.secret ? appKeyBearer(req.header(APP_KEY_HEADER), config.secret) : null;
    return bearer && { key: bearer.key, name: bearer.name, ...(bearer.photo ? { photo: bearer.photo } : {}) };
  };
  const profileOut = (who: { key: string; name: string; photo?: string }) => {
    const row = tableProfile(who.key);
    const look = { ...dollFor(who.key), ...cleanDoll(row) };
    // ЧТО ЕСТЬ У ЧЕЛОВЕКА — стартовое и полученное наградой; сидит он только тем, что есть.
    const owned = ownedOf(ownedParts(who.key));
    return { name: who.name, ...(who.photo ? { photo: who.photo } : {}), telegram: who.key.startsWith("tg:"), doll: look.doll, palette: look.palette, parts: wearable(partsFor(look.doll, ownParts(row?.parts)), owned), owned: [...owned], color: row?.color ?? inkFor(who.key), chosen: row !== null };
  };
  r.get("/table/profile", (req, res) => {
    const who = whoAsks(req);
    if (!who) return void res.status(401).json({ error: "who_are_you" });
    // ВОШЁЛ ЧЕРЕЗ TELEGRAM — подарок за это (аватар) приходит уже здесь, до первой комнаты (`gifts.ts`).
    grantDue(who.key, false);
    res.json(profileOut(who));
  });
  r.patch("/table/profile", (req, res) => {
    const who = whoAsks(req);
    if (!who) return void res.status(401).json({ error: "who_are_you" });
    const body = (req.body ?? {}) as { color?: unknown; parts?: unknown };
    const color = typeof body.color === "string" && (INKS as readonly string[]).includes(body.color) ? body.color : undefined;
    // ТОЛЬКО ТО, ЧТО ЕСТЬ: набор — если он есть целиком, часть — если она есть (`rewards.ts`).
    const owned = ownedOf(ownedParts(who.key));
    const asked = cleanDoll(body);
    const doll = asked.doll && !setsOwned(owned).some((s) => s.id === asked.doll) ? { ...asked, doll: undefined } : asked;
    if (doll.doll === undefined) delete doll.doll;
    const wanted = Object.fromEntries(Object.entries(cleanParts(body.parts)).filter(([, id]) => owned.has(id)));
    // НАБОР — ЗАНОВО: выбрал набор — свои части сброшены; поменял часть — она ложится поверх того, что было.
    const had = doll.doll ? {} : ownParts(tableProfile(who.key)?.parts);
    const parts = body.parts !== undefined || doll.doll ? { parts: JSON.stringify({ ...had, ...wanted }) } : {};
    saveTableProfile(who.key, { ...doll, ...(color ? { color } : {}), ...parts });
    res.json(profileOut(who));
  });

  // ─── ПРИЛОЖЕНИЕ CROSSADE: свой вход, без Telegram Mini App ────────────────────────────────────────
  // Приложение входит КЛЮЧОМ (`appPass.ts`). Ключ даёт одна из дверей ниже: гость — сразу, на это устройство;
  // Telegram — кнопкой входа Telegram (Login Widget), тем же человеком, что в Mini App.
  const DAY = 24 * 60 * 60 * 1000;
  /** Гость живёт на своём телефоне долго: протухни ключ через месяц — он потерял бы свои столы. */
  const GUEST_DAYS = 365;

  r.post("/table/app/guest", (_req, res) => {
    const secret = tableConfig().secret;
    if (!secret) return void res.status(503).json({ error: "no_secret" });
    const name = `Гость ${1000 + Math.floor(Math.random() * 9000)}`;
    const who = { key: `dev:${randomBytes(9).toString("base64url")}`, name };
    res.json({ key: mintAppKey(who, secret, Date.now() + GUEST_DAYS * DAY), name });
  });

  r.post("/table/app/telegram", (req, res) => {
    const { secret, botToken } = tableConfig();
    if (!secret || !botToken) return void res.status(503).json({ error: "no_secret" });
    const user = verifyTelegramLogin((req.body ?? {}) as Record<string, unknown>, botToken);
    if (!user) return void res.status(401).json({ error: "who_are_you" });
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `#${user.id}`;
    const who = { key: `tg:${user.id}`, name, ...(user.username ? { username: user.username } : {}), ...(user.photo_url ? { photo: user.photo_url } : {}) };
    // ПРИВЯЗАЛ TELEGRAM ИЗ ГОСТЯ: его выбор в профиле стола переезжает на Telegram (если там своего нет).
    const guest = appKeyBearer(req.header(APP_KEY_HEADER), secret);
    if (guest && guest.key !== who.key) { carryTableProfile(guest.key, who.key); carryOwned(guest.key, who.key); }
    res.json({ key: mintAppKey(who, secret, Date.now() + KEY_DAYS * DAY), name });
  });

  // НОВЫЙ СТОЛ ИЗ ПРИЛОЖЕНИЯ — хозяин тот, кто назван ключом; своего чата у стола нет (`home: app`).
  r.post("/table/app/rooms", (req, res) => {
    const secret = tableConfig().secret;
    const who = secret ? appKeyBearer(req.header(APP_KEY_HEADER), secret) : null;
    if (!secret || !who) return void res.status(401).json({ error: "who_are_you" });
    const body = (req.body ?? {}) as { kind?: unknown; title?: unknown };
    const card = openEntry(mintRoom(secret), { kind: "app" }, who.key, typeof body.title === "string" ? body.title.slice(0, 40) : undefined, Date.now(), isDesk(body.kind) ? body.kind : DEFAULT_DESK);
    res.json({ room: card.room, title: card.title });
  });

  /**
   * «ВСЕ СТОЛЫ» — только хозяевам (`TABLE_OWNERS`). Человек приходит из Mini App с подписью Telegram
   * в заголовке — секрета в ссылке нет, пересылать нечего. Секрет стола тоже пускает: так ходят прогоны.
   */
  r.get("/table/admin/rooms", (req, res) => {
    const config = tableConfig();
    const signed = req.header(TELEGRAM_HEADER);
    const user = signed && config.botToken ? verifyTelegramInitData(signed, config.botToken) : null;
    const owner = sameSecret(req.header(SECRET_HEADER), config.secret) || (user !== null && config.owners.includes(`tg:${user.id}`));
    if (!owner) return void res.status(403).json({ error: "not_owner" });
    const until = Date.now() + KEEP_DAYS * 24 * 60 * 60 * 1000;
    const rooms = roomsReport(roomsSeen(200), allEntries(), (room) => deedsOfKinds(room, RECORD_KINDS)).map((one) => ({ ...one, pass: mintPass(one.room, config.secret!, until) }));
    res.json({ rooms, until });
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
    // НАБОР КРУПЬЕ — отдельно от рода: игра его только предлагает, комната выбирает.
    if (body.crew !== undefined) {
      if (!isCrew(body.crew)) return void res.status(400).json({ error: "bad_request" });
      out = recrew(req.params.room, body.crew);
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

  /**
   * ВНЕШНИЙ ИГРОК СМОТРИТ НА СТОЛ. Чужих карт в ответе нет — взгляд тот же, что у бота
   * (`bots/view.ts`), и это не вежливость: агент, видящий сквозь рубашку, портит партию всем.
   */
  r.get("/table/rooms/:room/look", guarded, (req, res) => {
    const by = typeof req.query.by === "string" ? req.query.by : null;
    if (by === null) return void res.status(400).json({ error: "bad_request" });
    const out = lookIn(req.params.room, by);
    if (out === undefined) return void res.status(404).json({ error: "not_found" });
    res.json(out);
  });

  /**
   * ЧТО С БОТАМИ ПРЯМО СЕЙЧАС: кто на каком мозге, кто думает и сколько уже, чем кончилась
   * прошлая мысль. Журнал отвечает на это задним числом, а спрашивают — пока бот молчит.
   *
   * Под пропуском на эту комнату ИЛИ под секретом стола: смотреть за своими ботами не должно
   * требовать ключа от всех комнат сразу.
   */
  r.get("/table/rooms/:room/bots", (req, res, next) => {
    const pass = passRoom(typeof req.query.pass === "string" ? req.query.pass : undefined, tableConfig().secret ?? "");
    if (pass !== null && pass === req.params.room) return void next();
    return void guarded(req, res, next);
  }, (req, res) => {
    const out = botsIn(req.params.room);
    if (out === undefined) return void res.status(404).json({ error: "not_found" });
    res.json(out);
  });

  /** ВНЕШНИЙ ИГРОК ХОДИТ. Ход называется НОМЕРОМ из списка, который дал `look`. */
  r.post("/table/rooms/:room/play", guarded, (req, res) => {
    const body = (req.body ?? {}) as { by?: unknown; n?: unknown };
    if (typeof body.by !== "string") return void res.status(400).json({ error: "bad_request" });
    const out = playIn(req.params.room, body.by, body.n);
    if (out === undefined) return void res.status(404).json({ error: "not_found" });
    res.json(out);
  });

  /**
   * РАСПОРЯДИТЕЛЯ ВЫДАЁТ ХОЗЯИН КОМНАТЫ. Кто просит — говорит `by`; чужому — отказ, а не тихое «ок».
   */
  r.post("/table/rooms/:room/admins", guarded, (req, res) => {
    const body = (req.body ?? {}) as { by?: unknown; key?: unknown; on?: unknown };
    if (typeof body.by !== "string" || typeof body.key !== "string" || typeof body.on !== "boolean") return void res.status(400).json({ error: "bad_request" });
    const out = setAdmin(req.params.room, body.by, body.key, body.on);
    if (out === undefined) return void res.status(404).json({ error: "not_found" });
    if (out === "forbidden") return void res.status(403).json({ error: "not_owner" });
    res.json(out);
  });

  r.delete("/table/rooms/:room", guarded, (req, res) => {
    // ЗАКРЫТЬ КОМНАТУ МОЖЕТ ТОЛЬКО ХОЗЯИН: распорядителю этого не отдают.
    const by = typeof req.query.by === "string" ? req.query.by : null;
    const owner = ownerOf(req.params.room);
    if (owner !== null && by !== null && by !== owner) return void res.status(403).json({ error: "not_owner" });
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
  r.get(/^\/t(\/.*)?$/, async (req, res) => {
    const status = relayStatus();
    const down = () => void res.status(503).type("html").send(DOWN_PAGE);
    if (!status.up || !status.url) return down();
    // ЗАПИСЬ ПАРТИИ — ТОЖЕ ЧЕРЕЗ ПОСТОЯННЫЙ АДРЕС. Ссылку на запись пересылают и открывают позже, а
    // адрес мака живёт до следующего перезапуска туннеля: постоянным он бывает только здесь.
    // «ВСЕ СТОЛЫ» — туда же: Mini App открывается с постоянного адреса, иначе Telegram не отдаст подпись.
    const страница = /^\/t\/replay\/?$/.test(req.path) ? "replay" : /^\/t\/admin\/?$/.test(req.path) ? "admin" : "";
    try {
      const page = await fetchPage(`${status.url}/table/${страница}`);
      if (!page.ok) return down();
      res.header("Cache-Control", "no-store, must-revalidate");
      res.type("html").send(hostPage(await page.text(), status.url));
    } catch {
      down();
    }
  });

  return r;
}

const APP_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crossade</title>
<body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#1c120b;color:#f5ead0;font:16px -apple-system,system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box">
<a id="go" style="display:block;padding:14px 22px;border-radius:12px;background:#f0c86a;color:#0b0704;text-decoration:none;font-weight:600">Открыть в приложении</a>
<div style="color:#cdb98f;font-size:13px;max-width:280px">Не открывается — приложение Crossade не установлено на этом телефоне.</div>
<script>var u="crossade://table"+location.search;document.getElementById("go").href=u;location.href=u;</script>
</body>`;



// ── МАЯК ──────────────────────────────────────────────────────────────────────────────────────

/** Столько раз подряд дверь, которая уже открывалась, не открылась — туннель мёртв, и `doorDead` зовётся один раз. */
export const DOOR_DEAD_AFTER = 6;
const DOOR_WAIT_MS = 8_000;

/**
 * МАЯК СТУЧИТСЯ И В СВОЮ ДВЕРЬ. Туннель умирает молча: процесс жив, реле держит «свежий» адрес, снаружи —
 * ничего, и так весь день. Поэтому перед каждым ударом маяк пробует свой адрес снаружи. Дверь, которая
 * уже открывалась, не открылась `DOOR_DEAD_AFTER` раз подряд — `doorDead`: тому, кто держит процесс,
 * проще поднять его с новым туннелем, чем ждать.
 *
 * Дверь, которая ещё НИ РАЗУ не открылась, смертью не считается: свежее имя туннеля домашний резолвер
 * узнаёт с опозданием в минуты, а снаружи оно открыто с первой секунды. Маяк бьёт всегда — жив ли адрес,
 * реле проверяет само, когда отдаёт страницу.
 */
export function startBeacon(send: typeof fetch = fetch, doorDead: () => void = () => {}): () => void {
  const { publicUrl, relayUrl, secret } = tableConfig();
  if (!publicUrl || !relayUrl || !secret) return () => {};
  const door = publicUrl.replace(/\/+$/, "");
  let opened = false;
  let misses = 0;
  /**
   * ПРОГРЕВ КЭША РЕЛЕ: после запуска у скрипта новый отпечаток, и первый вошедший ждал бы, пока реле
   * сходит за ним сюда через туннель (10 с с телефона). Поэтому, как только реле узнало стол, стол сам
   * просит у него свою страницу и скрипт — и тот ложится в кэш Cloudflare раньше людей.
   */
  const warmed = new Set<string>();
  const warm = async (relay: string): Promise<void> => {
    try {
      const page = await (await send(`${relay}/t/`, { signal: AbortSignal.timeout(20_000) })).text();
      for (const script of page.match(/app\.js\?v=[a-f0-9]+/g) ?? []) await send(`${relay}/table/${script}`, { signal: AbortSignal.timeout(60_000) }).then((r) => r.arrayBuffer());
    } catch (err) {
      console.warn(`прогрев реле ${relay} не удался:`, String(err));
    }
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  const knock = async (): Promise<string | null> => {
    try {
      const answer = await send(`${door}/health`, { signal: AbortSignal.timeout(DOOR_WAIT_MS) });
      return answer.ok ? null : `HTTP ${answer.status}`;
    } catch (err) {
      return String(err);
    }
  };
  const beat = async () => {
    const closed = await knock();
    if (closed === null) {
      opened = true;
      misses = 0;
    } else if (opened) {
      misses += 1;
      console.warn(`своя дверь ${door} не отвечает (${misses}/${DOOR_DEAD_AFTER}):`, closed);
      if (misses >= DOOR_DEAD_AFTER) {
        clearInterval(timer);
        doorDead();
        return;
      }
    }
    // РЕЛЕ МОЖЕТ БЫТЬ НЕСКОЛЬКО (через запятую) — на время переезда с одного постоянного адреса на другой.
    for (const relay of relayUrl.split(",").map((u) => u.trim().replace(/\/+$/, "")).filter(Boolean)) {
      const told = await send(`${relay}/relay/table`, {
        method: "POST",
        headers: { "content-type": "application/json", [SECRET_HEADER]: secret },
        body: JSON.stringify({ url: publicUrl, boot: BOOT } satisfies Beacon),
      }).catch((err) => void console.warn(`маяк стола не дошёл до реле ${relay}:`, String(err)));
      if (told?.ok && !warmed.has(relay)) {
        warmed.add(relay);
        void warm(relay);
      }
    }
  };
  void beat();
  timer = setInterval(beat, BEACON_EVERY_MS);
  return () => clearInterval(timer);
}
