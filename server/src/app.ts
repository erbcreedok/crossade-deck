import express from "express";
import { createServer } from "http";
// Именованный импорт из "colyseus" не отдаёт Server под нативным Node ESM
// (пакет ре-экспортирует @colyseus/core динамически, cjs-module-lexer это не видит).
import colyseusPkg from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { CardRoom } from "./CardRoom.js";
import { TestRoom } from "./TestRoom.js";
import { SandboxRoom } from "./SandboxRoom.js";
import { KitRoom } from "./KitRoom.js";
import { resolveInviteCode } from "./inviteCodes.js";
import {
  createAccount,
  findAccountById,
  findAccountByRecoveryHash,
  findAccountByTelegramId,
  linkTelegram,
  profileOf,
  regenerateRecoveryHash,
  updateProfile,
} from "./accounts.js";
import { listPublicRooms } from "./publicRooms.js";
import { getLastRoom } from "./lastRooms.js";
import { getRoomGame } from "./roomGames.js";
import { verifyTelegramInitData } from "./telegramAuth.js";
import { botUsername } from "./telegramMe.js";
import {
  issueLinkCode,
  linkByCode,
  LINK_CODE_TTL_MS,
  missedLink,
  settleLink,
  takeSettled,
  tooSoon,
} from "./telegramLink.js";
import { BUILD_INFO, formatVersion } from "./version.js";

const { Server, matchMaker } = colyseusPkg;

// Столы по коду создаются для одной из этих игр; закрытый список — маршрут отвечает
// 400 на всё остальное, а не заводит комнату для опечатки.
const KIT_GAMES = ["cards", "chess", "nardy"] as const;
type KitGame = (typeof KIT_GAMES)[number];

function isKitGame(value: unknown): value is KitGame {
  return typeof value === "string" && (KIT_GAMES as readonly string[]).includes(value);
}

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  const httpServer = createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer, maxPayload: 1024 * 1024 }) });

  gameServer.define("card_room", CardRoom);
  // Тестовая комната с ботами за столом — площадка для посадки/вёрстки/дроп-зон.
  gameServer.define("test_room", TestRoom);
  // Песочница-live: отдельная комната-ретранслятор (снимки борды + присутствие), вход без токена.
  gameServer.define("sandbox_room", SandboxRoom);
  gameServer.define("kit_room", KitRoom);

  // Стол по коду: хаб просит комнату под конкретную игру ещё до того, как в неё кто-то
  // подключится по WebSocket — код и roomId раздаются сразу, join делает клиент отдельно.
  app.post("/rooms", async (req, res) => {
    const { game, seats, by } = req.body || {};
    if (!isKitGame(game)) return res.status(400).json({ error: "bad_request" });

    const options: Record<string, unknown> = { game };
    if (typeof seats === "number") options.seats = seats;
    if (typeof by === "string") options.accountId = by;

    const listing = await matchMaker.createRoom("kit_room", options);
    res.json({ code: (listing.metadata as { code?: string } | undefined)?.code, roomId: listing.roomId, game });
  });

  // Найти roomId по 4-значному коду — используется клиентом для join по коду
  app.get("/rooms/by-code/:code", (req, res) => {
    const roomId = resolveInviteCode(req.params.code);
    if (!roomId) return res.status(404).json({ error: "not_found" });
    const game = getRoomGame(roomId);
    res.json({ roomId, ...(game ? { game } : {}) });
  });

  // /health отдаёт и версию: по ней видно, что на проде крутится, и совпадает ли она с той,
  // что показывает клиент (у них общий формат — см. version.ts обоих пакетов).
  app.get("/health", (_req, res) => res.json({ status: "ok", ...BUILD_INFO }));

  // Свои аккаунты (без Firebase): сервер выдаёт accountId + recoveryHash,
  // клиент хранит их локально. recoveryHash позволяет восстановить того же
  // пользователя с другого устройства/браузера.
  app.post("/accounts", (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name : undefined;
    res.json(createAccount(name));
  });

  app.post("/accounts/restore", (req, res) => {
    const hash = req.body?.recoveryHash;
    if (typeof hash !== "string") return res.status(400).json({ error: "bad_request" });
    const account = findAccountByRecoveryHash(hash);
    if (!account) return res.status(404).json({ error: "not_found" });
    res.json(account);
  });

  // ПРОФИЛЬ — ЭТО ПОЛЯ АККАУНТА: имя, любимый цвет, аватар, дата, список дверей. Ключей от дверей
  // (subject) наружу не отдаём: провайдер говорит, ЧЕМ человек входит, а не чем это отпирается.
  app.get("/accounts/:id/profile", (req, res) => {
    const profile = profileOf(req.params.id);
    if (!profile) return res.status(404).json({ error: "not_found" });
    res.json(profile);
  });

  // Правки — только своим аккаунтом, и доверие прежнее: recoveryHash. Новой схемы здесь не
  // заводится, есть работающая.
  app.patch("/accounts/:id", (req, res) => {
    const { name, color, avatar, recoveryHash } = req.body || {};
    if (typeof recoveryHash !== "string") return res.status(400).json({ error: "bad_request" });
    const patch: { name?: string; color?: string; avatar?: string } = {};
    if (typeof name === "string") patch.name = name;
    if (typeof color === "string") patch.color = color;
    if (typeof avatar === "string") patch.avatar = avatar;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "bad_request" });
    const account = updateProfile(req.params.id, recoveryHash, patch);
    if (!account) return res.status(403).json({ error: "forbidden" });
    res.json(account);
  });

  app.post("/accounts/:id/regenerate-code", (req, res) => {
    const { recoveryHash } = req.body || {};
    if (typeof recoveryHash !== "string") return res.status(400).json({ error: "bad_request" });
    const account = regenerateRecoveryHash(req.params.id, recoveryHash);
    if (!account) return res.status(403).json({ error: "forbidden" });
    res.json(account);
  });

  // Вход через Telegram Mini App: initData подписан ботом, secret и проверка — по документации
  // Telegram (HMAC_SHA256("WebAppData", BOT_TOKEN), затем HMAC_SHA256(secret, data_check_string)).
  // Без TELEGRAM_BOT_TOKEN в окружении маршрут отвечает 503, не роняя сервер.
  app.post("/auth/telegram", (req, res) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return res.status(503).json({ error: "telegram_not_configured" });

    const initData = req.body?.initData;
    if (typeof initData !== "string") return res.status(400).json({ error: "bad_request" });

    const user = verifyTelegramInitData(initData, botToken);
    if (!user) return res.status(401).json({ error: "unauthorized" });

    const telegramId = String(user.id);
    // ПОЛНОЕ ИМЯ, А НЕ ТОЛЬКО ПЕРВОЕ — инициалы на аватаре в хабе берут первые буквы ДВУХ слов
    // (`initials` в game-kit), и без фамилии игрок с распространённым именем ничем не отличим от
    // другого на том же столе.
    const fullName = [user.first_name, user.last_name].filter((part): part is string => Boolean(part?.trim())).join(" ");
    const account = findAccountByTelegramId(telegramId) ?? createAccount(fullName || user.username, telegramId);
    res.json(account);
  });

  // ПРИВЯЗАТЬ ТЕЛЕГРАМ К УЖЕ СУЩЕСТВУЮЩЕМУ АККАУНТУ — та же проверка подписи, что и у входа.
  //
  // Дверь, уже ведущая к другому человеку, не сливает аккаунты: чистого гостя ПЕРЕКЛЮЧАЮТ на его
  // настоящий аккаунт (200, `switch` — гостевой остаётся в этом браузере), а две полноценные
  // стороны получают 409 и ноль изменений. Слияние необратимо; жалоба «куда делись предметы»
  // после него неразрешима.
  app.post("/accounts/:id/identities/telegram", (req, res) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return res.status(503).json({ error: "telegram_not_configured" });

    const { initData, recoveryHash } = req.body || {};
    if (typeof initData !== "string" || typeof recoveryHash !== "string") {
      return res.status(400).json({ error: "bad_request" });
    }
    const user = verifyTelegramInitData(initData, botToken);
    if (!user) return res.status(401).json({ error: "unauthorized" });

    const result = linkTelegram(req.params.id, recoveryHash, String(user.id));
    if (!result) return res.status(403).json({ error: "forbidden" });
    if (result.kind === "conflict") {
      return res.status(409).json({ error: "already_linked", account: { id: result.account.id, name: result.account.name } });
    }
    res.json({ kind: result.kind, account: result.account });
  });

  // ---- ПРИВЯЗКА ТЕЛЕГРАМА ИЗ ОБЫЧНОГО БРАУЗЕРА (`telegramLink.ts`) ----
  //
  // Три шага и три маршрута: страница просит код, человек открывает ссылку в боте, бот говорит
  // серверу «это он», страница забирает исход. Ни номера, ни @username, ни предыдущего `/start`
  // знать не нужно — бот узнаёт `chat_id` ровно в тот момент, когда его запускают.

  /** Общий секрет сервера и бота: подтвердить привязку может только наш бот и никто больше. */
  const linkSecret = (): string | undefined => process.env.TELEGRAM_LINK_SECRET || undefined;

  app.post("/auth/telegram/link-code", async (req, res) => {
    if (!linkSecret()) return res.status(503).json({ error: "telegram_not_configured" });
    // ИМЯ БОТА СПРАШИВАЕТСЯ У ТЕЛЕГИ (`telegramMe.ts`): ссылка, собранная из имени, вписанного
    // руками, однажды уведёт человека в чужого бота.
    const name = await botUsername();
    if (!name) return res.status(503).json({ error: "telegram_not_configured" });

    const { accountId, recoveryHash } = req.body || {};
    if (typeof accountId !== "string" || typeof recoveryHash !== "string") {
      return res.status(400).json({ error: "bad_request" });
    }
    const account = findAccountById(accountId);
    if (!account || account.recoveryHash !== recoveryHash.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()) {
      return res.status(403).json({ error: "forbidden" });
    }
    // ПЕРЕБОР — НЕ ОШИБКА ВВОДА. Код открывает дверь в аккаунт, и раздавать их пачками нельзя.
    if (tooSoon(accountId)) return res.status(429).json({ error: "too_soon" });

    const pending = issueLinkCode(accountId);
    res.json({
      code: pending.code,
      // Ссылку собирает сервер: он один знает, как зовут бота.
      link: `https://t.me/${name}?start=${encodeURIComponent(pending.code)}`,
      expiresInMs: LINK_CODE_TTL_MS,
    });
  });

  /**
   * БОТ ПОДТВЕРЖДАЕТ. Секретом, а не подписью телеги: это наш собственный сервис, и единственное,
   * что он утверждает, — «этот код принёс мне вот этот chat_id».
   */
  app.post("/auth/telegram/claim", (req, res) => {
    const secret = linkSecret();
    if (!secret) return res.status(503).json({ error: "telegram_not_configured" });

    const { code, telegramId, secret: given } = req.body || {};
    if (typeof code !== "string" || typeof telegramId !== "string" || typeof given !== "string") {
      return res.status(400).json({ error: "bad_request" });
    }
    if (given !== secret) return res.status(401).json({ error: "unauthorized" });

    const pending = linkByCode(code);
    if (!pending) return res.status(404).json({ error: "unknown_code" });

    const account = findAccountById(pending.accountId);
    if (!account) {
      missedLink(code);
      return res.status(404).json({ error: "unknown_code" });
    }
    // ПРАВИЛО СЛИЯНИЯ ЖИВЁТ В ОДНОМ МЕСТЕ И ТУТ НЕ ПОВТОРЯЕТСЯ: чистого гостя переключают, две
    // полноценные стороны не сливают никогда.
    const result = linkTelegram(account.id, account.recoveryHash, telegramId);
    if (!result) return res.status(403).json({ error: "forbidden" });
    settleLink(code, telegramId, result.kind);
    res.json({ kind: result.kind, name: result.account.name });
  });

  /** Страница ждёт. Пока бот молчит — `waiting`; исход уносится вместе с ответом. */
  app.get("/auth/telegram/link-code/:code", (req, res) => {
    const pending = takeSettled(req.params.code);
    if (!pending) return res.json({ state: "expired" });
    if (pending.state === "waiting") return res.json({ state: "waiting" });

    const account = findAccountById(pending.accountId);
    const linked = pending.telegramId ? findAccountByTelegramId(pending.telegramId) : undefined;
    // ПЕРЕКЛЮЧЕНИЕ ОТДАЁТ ТОТ АККАУНТ, В КОТОРЫЙ ЧЕЛОВЕК ВОЗВРАЩАЕТСЯ, — это и есть вход; привязка
    // отдаёт его собственный, чтобы страница обновила себя одним ответом.
    const account_ = pending.state === "switch" ? linked : account;
    res.json({ state: pending.state, ...(account_ ? { account: account_ } : {}) });
  });

  app.get("/rooms/public", (_req, res) => {
    res.json(listPublicRooms());
  });

  // Последняя посещённая аккаунтом комната (для кнопки «вернуться в игру» в лобби).
  // Запись существует, только пока комната ещё жива (чистится на её диспоузе).
  app.get("/accounts/:id/last-room", (req, res) => {
    const last = getLastRoom(req.params.id);
    if (!last) return res.status(404).json({ error: "not_found" });
    res.json(last);
  });

  return { app, httpServer, gameServer };
}
