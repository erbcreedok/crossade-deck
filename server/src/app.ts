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
  findAccountByRecoveryHash,
  findAccountByTelegramId,
  renameAccount,
  regenerateRecoveryHash,
} from "./accounts.js";
import { listPublicRooms } from "./publicRooms.js";
import { getLastRoom } from "./lastRooms.js";
import { getRoomGame } from "./roomGames.js";
import { verifyTelegramInitData } from "./telegramAuth.js";
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

  app.patch("/accounts/:id", (req, res) => {
    const { name, recoveryHash } = req.body || {};
    if (typeof name !== "string" || typeof recoveryHash !== "string") {
      return res.status(400).json({ error: "bad_request" });
    }
    const account = renameAccount(req.params.id, recoveryHash, name);
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
    const account = findAccountByTelegramId(telegramId) ?? createAccount(user.first_name ?? user.username, telegramId);
    res.json(account);
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
