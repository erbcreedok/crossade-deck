import { stickerRoutes } from "./table/stickers.js";
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
import { TableRoom } from "./table/TableRoom.js";
import { TABLE_ROOM } from "./table/contract.js";
import { relayRoutes, tableRoutes } from "./table/routes.js";
import { clientRoutes } from "./table/client.js";
import { keepLobbyIn } from "./table/lobby.js";
import { dropRoom, forgetStaleRooms, keepCard, keepState, keptRooms, keptState } from "./db/tableRoomsRepo.js";
import {
  accountByTelegram,
  createAccount,
  declineByTelegram,
  declineTelegramOffer,
  findAccountById,
  findAccountByRecoveryHash,
  findAccountByTelegramId,
  linkTelegram,
  profileOf,
  regenerateRecoveryHash,
  telegramDoor,
  unlinkTelegram,
  updateByTelegram,
  updateProfile,
  accountName,
} from "./accounts.js";
import { getLastRoom } from "./lastRooms.js";
import { verifyTelegramInitData } from "./telegramAuth.js";
import { botUsername } from "./telegramMe.js";
import { offerFor } from "./telegramOffer.js";
import { photoDataUrl } from "./telegramPhoto.js";
import {
  issueLinkCode,
  usedLink,
  linkByCode,
  LINK_CODE_TTL_MS,
  missedLink,
  settleLink,
  takeSettled,
  tooSoon,
} from "./telegramLink.js";
import { BUILD_INFO, formatVersion } from "./version.js";
import { atCode, byCode, byId, chairsAreFixed, close, reconfigure, codeFree, isKitGame, mine, openRoom, reserveCode, search, sessionOf, type RoomRow } from "./rooms.js";
import { rosterOf } from "./roomRoster.js";
import { deedsOn, mayAddChair, roomDeeds } from "./roomRights.js";
import { NEWCOMERS, ROOM_LIMIT } from "./db/roomsRepo.js";
import { promiseOf, type Promised } from "./codeHold.js";
import { ADMISSIONS, cleanCode, MODES, roleOf, VISIBILITIES, type Mode } from "./db/roomsRepo.js";
import { peopleAt, turnAt } from "./roomPeople.js";

const { Server, matchMaker } = colyseusPkg;

/**
 * СКОЛЬКО ЧЕЛОВЕК СЕЙЧАС ЗА СТОЛАМИ — один вопрос про все сессии сразу, а не по вопросу на строку
 * списка. Ключ — идущая сессия комнаты; у комнаты без сессии людей ноль, и это правда.
 */
async function playerCounts(): Promise<Map<string, number>> {
  const live = (await matchMaker.query({ name: "kit_room" })) as { roomId: string; clients: number }[];
  return new Map(live.map((one) => [one.roomId, one.clients]));
}

/**
 * ЧТО О КОМНАТЕ ЗНАЕТ ПОСТОРОННИЙ — ровно то, из чего рисуется строка списка: код, игра, сколько
 * мест и кто за ними сейчас. Номера аккаунтов не отдаются: имя и цвет — это лицо, а номер — ключ.
 */
function seenFromOutside(room: RoomRow, forAccount?: string) {
  const people = peopleAt(room.id);
  const here = people.filter((one) => !one.away).length;
  const mine = forAccount ? roleOf(room.id, forAccount) : undefined;
  return {
    room: room.id,
    code: room.code,
    game: room.game,
    title: room.title,
    chairs: room.chairs,
    capacity: room.capacity,
    newcomer: room.newcomer,
    newcomerChair: room.newcomerChair,
    visibility: room.visibility,
    admission: room.admission,
    mode: room.mode,
    forever: room.forever,
    createdAt: room.createdAt,
    ...(room.ownerAccount ? { owner: accountName(room.ownerAccount) ?? null } : { owner: null }),
    people: people.map((one) => ({ name: one.name, color: one.color, ...(one.away ? { away: true } : {}) })),
    taken: people.length,
    online: here,
    ...(mine ? { mySeat: true, role: mine } : {}),
    // «ТВОЙ ХОД» — ТОЛЬКО ТОМУ, ЧЕЙ ОН. Посторонний видит, что за столом идёт игра, но не кого
    // именно ждут: чужая очередь — не его дело.
    ...(forAccount && turnAt(room.id) === forAccount ? { myTurn: true } : {}),
    ...(room.sessionId ? { roomId: room.sessionId } : {}),
  };
}

/**
 * СТОЛ, КОТОРЫЙ ТОЛЬКО ОБЕЩАН: код уже в чужой переписке, комнаты ещё нет. Отвечается тем же
 * набором полей, что и настоящий, — звонящему важно знать игру и правила, а не то, заведена ли уже
 * строка в базе. `waiting` и есть вся разница: за этот стол ещё никто не садился.
 */
function seenPromised(code: string, promised: Promised) {
  return {
    room: null,
    code,
    game: promised.game,
    title: null,
    chairs: promised.chairs ?? null,
    capacity: promised.capacity ?? ROOM_LIMIT,
    newcomer: promised.newcomer ?? "player",
    newcomerChair: promised.newcomerChair !== false,
    visibility: promised.visibility ?? "hidden",
    admission: promised.admission ?? "code",
    mode: promised.mode ?? "free",
    forever: promised.forever === true,
    createdAt: Date.now(),
    owner: promised.ownerAccount ? accountName(promised.ownerAccount) ?? null : null,
    people: [],
    taken: 0,
    online: 0,
    waiting: true,
  };
}

/**
 * В КАКУЮ ГРУППУ СПИСКА ПОПАДАЕТ КОМНАТА. Свои — первыми: человек чаще возвращается в свой стол,
 * чем ищет чужой, и список, который начинается с чужих, заставляет искать себя глазами.
 */
function groupOf(room: RoomRow, forAccount?: string): "mine" | "forever" | "friends" | "public" {
  const mine = forAccount ? roleOf(room.id, forAccount) : undefined;
  if (mine) return room.forever ? "forever" : "mine";
  if (room.visibility === "friends") return "friends";
  return "public";
}


/**
 * КАК ЭТО ПРИЛОЖЕНИЕ НАЗЫВАЕТСЯ В ССЫЛКЕ БОТА. Пусто — ссылка без имени, и бот отнесёт её тому
 * серверу, который у него записан по умолчанию: так же, как было до появления второго приложения.
 */
const APP_SOURCE = (process.env.APP_SOURCE || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/** Глаголы, которыми отвечает это приложение. Сверяется со списком маршрутов сторожем. */
export const ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] as const;

/**
 * ЧТО ТЕЛЕГА ПРЕДЛАГАЕТ ЧЕЛОВЕКУ, как это видно из подписанной `initData`: подпись двери, тамошнее
 * имя и тамошнее лицо. Ссылка на лицо здесь приходит готовой — у Mini App она есть без токена.
 */
function telegramFaceOf(user: { username?: string; first_name?: string; last_name?: string; photo_url?: string }) {
  const fullName = [user.first_name, user.last_name].filter((part): part is string => Boolean(part?.trim())).join(" ");
  return {
    ...(user.username ? { label: `@${user.username}` } : {}),
    ...(fullName ? { name: fullName } : {}),
    ...(user.photo_url ? { photo: user.photo_url } : {}),
  };
}

export function createApp() {
  // КОМНАТЫ СТОЛА ПОДНИМАЮТСЯ ИЗ БАЗЫ: перезапуск и выкатка не отнимают у людей их столы.
  forgetStaleRooms();
  keepLobbyIn({ card: keepCard, drop: dropRoom, all: keptRooms, state: keepState, stateOf: keptState });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    // КАЖДЫЙ ГЛАГОЛ, КОТОРЫМ ЭТО ПРИЛОЖЕНИЕ ОТВЕЧАЕТ, ОБЯЗАН БЫТЬ ЗДЕСЬ. Браузер режет запрос ДО
    // отправки, если метода нет в этом списке: маршрут при этом жив, тесты зелены, а со страницы
    // он недостижим — и выглядит это как «сервер не отвечает». Сторож сверяет список с тем, что
    // приложение и правда зарегистрировало (`cors.test.ts`).
    res.header("Access-Control-Allow-Methods", ALLOWED_METHODS.join(", "));
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
  // СТОЛ ДЛЯ TELEGRAM — отдельный клиент со своим контрактом (`table/contract.ts`). Одна подписанная
  // комната — одна сессия: `filterBy` сводит всех, кто пришёл с тем же id, в неё.
  gameServer.define(TABLE_ROOM, TableRoom).filterBy(["room"]);
  app.use(tableRoutes(), relayRoutes(), clientRoutes(), stickerRoutes());

  // СТОЛ ОТКРЫВАЕТСЯ ЗАПИСЬЮ, А НЕ ПРОЦЕССОМ. Сначала заводится комната (её код, её правила, её
  // хозяин), и только потом под неё поднимается сессия Colyseus, в которую клиент входит сам.
  app.post("/rooms", async (req, res) => {
    const { game, chairs, capacity, newcomer, newcomerChair, by, title, visibility, admission, mode, forever, code } =
      req.body || {};
    if (!isKitGame(game)) return res.status(400).json({ error: "bad_request" });
    if (visibility && !(VISIBILITIES as readonly string[]).includes(visibility)) {
      return res.status(400).json({ error: "bad_request" });
    }
    if (admission && !(ADMISSIONS as readonly string[]).includes(admission)) {
      return res.status(400).json({ error: "bad_request" });
    }
    if (mode && !(MODES as readonly string[]).includes(mode)) {
      return res.status(400).json({ error: "bad_request" });
    }

    const room = openRoom({
      game,
      ...(typeof chairs === "number" ? { chairs } : {}),
      ...(typeof capacity === "number" ? { capacity } : {}),
      ...((NEWCOMERS as readonly string[]).includes(newcomer) ? { newcomer } : {}),
      ...(typeof newcomerChair === "boolean" ? { newcomerChair } : {}),
      ...(typeof by === "string" ? { ownerAccount: by } : {}),
      ...(typeof title === "string" && title.trim() ? { title: title.trim() } : {}),
      ...(visibility ? { visibility } : {}),
      ...(admission ? { admission } : {}),
      ...(mode ? { mode: mode as Mode } : {}),
      forever: forever === true,
      // КОД МОЖНО НАЗВАТЬ СВОЙ — он должен быть в руках ДО того, как сели за стол: его отправляют
      // другу прямо с экрана создания. Занятый или кривой не отдаётся, комната получит выданный.
      ...(cleanCode(code) ? { code: cleanCode(code) } : {}),
    });
    // Свободных кодов не осталось — честный отказ. Выдать занятый значит отправить человека
    // за чужой стол.
    if (!room) return res.status(503).json({ error: "no_free_code" });

    const roomId = await sessionOf(room);
    res.json({ code: room.code, roomId, room: room.id, game: room.game });
  });

  // КОД ДО КОМНАТЫ. Комнату зовут кодом, и по стенду он лежит в руках ДО нажатия «Создать» —
  // чтобы его отправили другу, ещё не сев за стол. Выданный тут же придерживается за спросившим,
  // иначе второй человек в эту же секунду получит тот же код.
  app.post("/rooms/code", (req, res) => {
    const { game, chairs, capacity, by, visibility, admission, mode, forever } = req.body || {};
    // ВМЕСТЕ С КОДОМ МОЖНО ПРИДЕРЖАТЬ И ОБЕЩАНИЕ СТОЛА. Так зовут друга из чужой переписки: бот
    // отвечает карточкой с кодом, а комната поднимается, когда по ней придут. Игру не назвали —
    // это прежняя бронь пустого кода, и она ничего не обещает.
    const promised: Promised | undefined = isKitGame(game)
      ? {
          game,
          ...(typeof chairs === "number" ? { chairs } : {}),
          ...(typeof capacity === "number" ? { capacity } : {}),
          ...(typeof by === "string" ? { ownerAccount: by } : {}),
          ...((VISIBILITIES as readonly string[]).includes(visibility) ? { visibility } : {}),
          ...((ADMISSIONS as readonly string[]).includes(admission) ? { admission } : {}),
          ...((MODES as readonly string[]).includes(mode) ? { mode: mode as Mode } : {}),
          forever: forever === true,
        }
      : undefined;
    const code = reserveCode(promised);
    if (!code) return res.status(503).json({ error: "no_free_code" });
    res.json({ code });
  });

  // Свободен ли код, который человек назвал сам. Ответ нужен ДО создания: «Свой» показывают рядом
  // с кодом, и отказ после нажатия «Создать» — это отказ, который уже некуда деть.
  app.get("/rooms/code/:code", (req, res) => {
    res.json({ free: codeFree(req.params.code) });
  });

  // ЧТО ЗА СТОЛ ПРЯЧЕТСЯ ЗА КОДОМ — без того, чтобы за него садиться. 404 здесь значит «стол
  // закрылся», и это именно то, что должен увидеть пришедший по старой ссылке: прежде ему молча
  // открывали новый стол, и он сидел один, думая, что пришёл к друзьям.
  app.get("/rooms/by-code/:code", (req, res) => {
    const room = byCode(req.params.code);
    if (room) return res.json(seenFromOutside(room));
    // ОБЕЩАННЫЙ СТОЛ — ЕЩЁ НЕ СТОЛ. Заглянуть по коду можно, а заводить комнату на взгляд нельзя:
    // её поднимает тот, кто садится. Поэтому здесь сказано, что за стол БУДЕТ, и что за него ещё
    // никто не сел.
    const promised = promiseOf(req.params.code.trim().toUpperCase());
    if (promised) return res.json(seenPromised(req.params.code.trim().toUpperCase(), promised));
    res.status(404).json({ error: "room_closed" });
  });

  // КТО ЧИСЛИТСЯ ЗА ЭТИМ СТОЛОМ. Не «кто сейчас на связи»: зритель без стула и ушедший на час
  // игрок — такие же участники комнаты, и экран «ЗА СТОЛОМ» показывает всех.
  app.get("/rooms/:id/roster", (req, res) => {
    const room = byId(req.params.id) ?? byCode(req.params.id);
    if (!room) return res.status(404).json({ error: "room_closed" });
    const people = rosterOf(room);
    const me = typeof req.query.me === "string" ? req.query.me : undefined;
    // ЧТО МНЕ МОЖНО С КАЖДЫМ — СЧИТАЕТ СЕРВЕР, А НЕ ПАНЕЛЬ. Правило, посчитанное на экране, — это
    // вторая копия правила, и она разойдётся с первой в тот же день: в списке кнопка есть, а стол
    // её не пускает. Панель рисует то, что ей разрешили, и ровно теми же словами.
    const mine = me ? people.find((one) => one.account === me) : undefined;
    if (!mine) return res.json(people);
    const table = {
      ...(room.chairs !== null ? { chairs: room.chairs } : {}),
      capacity: room.capacity,
      ...(chairsAreFixed(room.game) !== undefined ? { chairsFixed: chairsAreFixed(room.game)! } : {}),
    };
    const whoAmI = { account: mine.account!, role: mine.role, seated: mine.seated, here: mine.here };
    // СТОЛ ОТВЕЧАЕТ ПРО СЕБЯ ОТДЕЛЬНО: мебель — не свойство человека, и спрашивается она раз.
    const chair = mayAddChair(whoAmI, room.mode, table);
    // САМА КОМНАТА — ОДНИМ ОТВЕТОМ: её настройки и то, что Я вправе в них поменять. Вопрос про
    // комнату задаётся раз на стол, а не раз на человека: «сменить код» в строке каждого имени
    // читалось бы как действие над этим человеком.
    const roomView = {
      code: room.code,
      // ИМЯ У СТОЛА СВОЁ ИЛИ НИКАКОЕ. Подставлять сюда `game` нельзя: это опознаватель игры, а не
      // её название, и в экране комнаты он читался бы как «cards» вместо «Карты». Как зовётся сама
      // игра, знает она сама, и ответить за неё сервер не может.
      title: room.title,
      visibility: room.visibility,
      admission: room.admission,
      mode: room.mode,
      forever: room.forever,
      // ВЕЧНОСТЬ СНЯТА АДМИНОМ И ЖДЁТ СРОКА. Молчаливый отложенный снос — это сюрприз через день.
      ...(room.foreverDropAt !== null ? { foreverDropAt: room.foreverDropAt } : {}),
      ...roomDeeds(whoAmI, room.mode, table),
    };
    res.setHeader("X-Room-Chairs", String(room.chairs ?? ""));
    res.json(
      people.map((one) => {
        const { can, cant } = deedsOn(
          whoAmI,
          { account: one.account ?? one.name, role: one.role, seated: one.seated, here: one.here },
          room.mode,
          table,
        );
        return {
          ...one,
          can,
          cant,
          // Про стол — одинаково в каждой строке: спрашивающий один, и ответ про него, а не про них.
          table: {
            ...(room.chairs !== null ? { chairs: room.chairs } : {}),
            mayAddChair: chair === true,
            ...(chair === true ? {} : { whyNoChair: chair }),
          },
          room: roomView,
        };
      }),
    );
  });

  // СЕСТЬ ЗА СТОЛ ПО КОДУ: если за ним уже играют — в ту же сессию, если нет — сессия поднимается
  // для ТОЙ ЖЕ комнаты, с её кодом и её людьми.
  app.post("/rooms/join", async (req, res) => {
    const { code } = req.body || {};
    if (typeof code !== "string") return res.status(400).json({ error: "bad_request" });
    // ПЕРВЫЙ ВОШЕДШИЙ ПО ПРИГЛАШЕНИЮ И ЗАВОДИТ СТОЛ: до него была только карточка в чате.
    const room = atCode(code);
    if (!room) return res.status(404).json({ error: "room_closed" });
    const roomId = await sessionOf(room);
    res.json({ roomId, room: room.id, code: room.code, game: room.game });
  });

  // ПОИСК СТОЛОВ. Видно только публичные и только живые — скрытая комната скрыта от всех, кроме
  // своих, и находится в `/accounts/:id/rooms`.
  app.get("/rooms", async (req, res) => {
    const game = typeof req.query.game === "string" ? req.query.game : undefined;
    const me = typeof req.query.me === "string" ? req.query.me : undefined;
    const busy = await playerCounts();
    const dress = (room: RoomRow) => ({
      ...seenFromOutside(room, me),
      group: groupOf(room, me),
      players: busy.get(room.sessionId ?? "") ?? 0,
    });
    // СВОИ СТОЛЫ ПРИХОДЯТ В ТОМ ЖЕ СПИСКЕ, А НЕ ВТОРЫМ ЗАПРОСОМ: второй список — это второй набор
    // пустых состояний и второе место, где порядок разойдётся с первым.
    const seen = search(game);
    const ours = me ? mine(me).filter((room) => !game || room.game === game) : [];
    const all = [...ours, ...seen.filter((room) => !ours.some((one) => one.id === room.id))];
    res.json(all.map(dress));
  });

  // МОИ КОМНАТЫ — те, что я открыл или в которых состою, включая скрытые.
  app.get("/accounts/:id/rooms", async (req, res) => {
    const busy = await playerCounts();
    res.json(
      mine(req.params.id).map((room) => ({
        ...seenFromOutside(room, req.params.id),
        group: groupOf(room, req.params.id),
        players: busy.get(room.sessionId ?? "") ?? 0,
        own: room.ownerAccount === req.params.id,
      })),
    );
  });

  /**
   * ПЕРЕНАСТРОИТЬ СТОЛ: стулья, вместимость и то, кем комната встречает нового.
   *
   * Ставится при создании и переставляется потом — стол живёт дольше, чем разговор, ради которого
   * его завели: за столом на тридцать человек новых встречают зрителями, а к вечеру решают, что
   * всем можно сесть. Распоряжается тот, кто распоряжается столом: хозяин и админы.
   */
  app.patch("/rooms/:id", (req, res) => {
    const { by, chairs, capacity, newcomer, newcomerChair } = req.body || {};
    if (typeof by !== "string") return res.status(400).json({ error: "bad_request" });
    const room = byId(req.params.id);
    if (!room) return res.status(404).json({ error: "room_closed" });
    const role = roleOf(room.id, by);
    if (role !== "owner" && role !== "admin") return res.status(403).json({ error: "not_yours" });
    if (chairs !== undefined && (typeof chairs !== "number" || chairs < 1)) {
      return res.status(400).json({ error: "bad_request" });
    }
    if (capacity !== undefined && typeof capacity !== "number") return res.status(400).json({ error: "bad_request" });
    if (newcomer !== undefined && !(NEWCOMERS as readonly string[]).includes(newcomer)) {
      return res.status(400).json({ error: "bad_request" });
    }
    if (newcomerChair !== undefined && typeof newcomerChair !== "boolean") {
      return res.status(400).json({ error: "bad_request" });
    }
    const after = reconfigure(room.id, {
      ...(chairs !== undefined ? { chairs: Math.floor(chairs) } : {}),
      ...(capacity !== undefined ? { capacity } : {}),
      ...(newcomer !== undefined ? { newcomer } : {}),
      ...(newcomerChair !== undefined ? { newcomerChair } : {}),
    });
    if (!after) return res.status(404).json({ error: "room_closed" });
    res.json(seenFromOutside(after, by));
  });

  // ЗАКРЫТЬ СТОЛ — только хозяину. Код возвращается в оборот ровно здесь.
  app.delete("/rooms/:id", (req, res) => {
    const by = typeof req.query.by === "string" ? req.query.by : (req.body || {}).by;
    if (typeof by !== "string") return res.status(400).json({ error: "bad_request" });
    if (!close(req.params.id, by)) return res.status(403).json({ error: "not_yours" });
    res.json({ ok: true });
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
    const account =
      findAccountByTelegramId(telegramId) ??
      createAccount(fullName || user.username, telegramId, telegramFaceOf(user));
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

    const result = linkTelegram(req.params.id, recoveryHash, String(user.id), telegramFaceOf(user));
    if (!result) return res.status(403).json({ error: "forbidden" });
    if (result.kind === "conflict") {
      return res.status(409).json({ error: "already_linked", account: { id: result.account.id, name: result.account.name } });
    }
    res.json({ kind: result.kind, account: result.account });
  });

  /**
   * ЧТО ТЕЛЕГА ПРЕДЛАГАЕТ ВЗЯТЬ СЮДА — имя и лицо, по одному вопросу за раз (`telegramOffer.ts`).
   *
   * Решает человек, поэтому сервер только ОТВЕЧАЕТ, что есть; берёт — обычный `PATCH` профиля, тем
   * же кодом, что и любую другую правку.
   */
  app.get("/accounts/:id/telegram-offer", (req, res) => {
    const account = findAccountById(req.params.id);
    if (!account) return res.status(404).json({ error: "not_found" });
    const profile = profileOf(account.id);
    res.json(offerFor(account, telegramDoor(account.id), profile?.nameChosen ?? true));
  });

  /** «ОСТАВИТЬ СВОЁ» — решение человека, и оно переживает перезагрузку. */
  app.post("/accounts/:id/telegram-offer/skip", (req, res) => {
    const { recoveryHash, what } = req.body || {};
    if (typeof recoveryHash !== "string" || (what !== "name" && what !== "photo")) {
      return res.status(400).json({ error: "bad_request" });
    }
    if (!declineTelegramOffer(req.params.id, recoveryHash, what)) return res.status(403).json({ error: "forbidden" });
    const account = findAccountById(req.params.id)!;
    res.json(offerFor(account, telegramDoor(account.id), profileOf(account.id)?.nameChosen ?? true));
  });

  /** ОТВЯЗАТЬ — та же проверка доверия, что и у любой другой правки профиля: код восстановления. */
  app.delete("/accounts/:id/identities/telegram", (req, res) => {
    const { recoveryHash } = req.body || {};
    if (typeof recoveryHash !== "string") return res.status(400).json({ error: "bad_request" });
    const account = unlinkTelegram(req.params.id, recoveryHash);
    if (!account) return res.status(403).json({ error: "forbidden" });
    res.json(account);
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
    // ОДИН БОТ НА НЕСКОЛЬКО ПРИЛОЖЕНИЙ, И `/start` — ЕДИНСТВЕННЫЙ КАНАЛ, ПО КОТОРОМУ ОН УЗНАЁТ, КОМУ
    // адресовано сообщение: токен говорит только, кто бот. Поэтому приложение подписывает свою
    // ссылку собственным именем, а бот по нему выбирает, какому серверу нести подтверждение.
    const payload = APP_SOURCE ? `${APP_SOURCE}_${pending.code}` : pending.code;
    res.json({
      code: pending.code,
      // Ссылку собирает сервер: он один знает, как зовут бота и как зовут себя.
      link: `https://t.me/${name}?start=${encodeURIComponent(payload)}`,
      expiresInMs: LINK_CODE_TTL_MS,
    });
  });

  /**
   * БОТ ПОДТВЕРЖДАЕТ. Секретом, а не подписью телеги: это наш собственный сервис, и единственное,
   * что он утверждает, — «этот код принёс мне вот этот chat_id».
   */
  app.post("/auth/telegram/claim", async (req, res) => {
    const secret = linkSecret();
    if (!secret) return res.status(503).json({ error: "telegram_not_configured" });

    const { code, telegramId, telegramName, offeredName, offeredPhoto, offeredPhotoFileId, secret: given } = req.body || {};
    if (typeof code !== "string" || typeof telegramId !== "string" || typeof given !== "string") {
      return res.status(400).json({ error: "bad_request" });
    }
    if (given !== secret) {
      // СЕРВЕР И БОТ НЕ ДОГОВОРИЛИСЬ О СЕКРЕТЕ — это настройка, а не устаревшая ссылка, и в логе
      // это должно быть видно: снаружи оно выглядит как «ничего не работает».
      console.warn("telegram link: бот пришёл с чужим секретом — TELEGRAM_LINK_SECRET расходится");
      return res.status(401).json({ error: "unauthorized" });
    }

    const pending = linkByCode(code);
    if (!pending) {
      // УЖЕ СРАБОТАВШИЙ КОД — НЕ ТО ЖЕ, ЧТО НЕИЗВЕСТНЫЙ: человек нажал ту же кнопку второй раз, и
      // сказать ему надо «уже привязано», а не «начни заново».
      const before = usedLink(code);
      if (before) return res.status(409).json({ error: "already_used", kind: before });
      console.warn("telegram link: код не найден — выдан другим процессом или уже истёк");
      return res.status(404).json({ error: "unknown_code" });
    }

    // ...И ЕЩЁ НЕ ЗАБРАННЫЙ СТРАНИЦЕЙ КОД ТОЖЕ МОГ УЖЕ СРАБОТАТЬ: человек нажал кнопку в телеге
    // дважды подряд, быстрее, чем страница успела спросить исход.
    if (pending.state !== "waiting") {
      return res.status(409).json({ error: "already_used", kind: pending.state });
    }

    const account = findAccountById(pending.accountId);
    if (!account) {
      missedLink(code);
      return res.status(404).json({ error: "unknown_code" });
    }
    // ПРАВИЛО СЛИЯНИЯ ЖИВЁТ В ОДНОМ МЕСТЕ И ТУТ НЕ ПОВТОРЯЕТСЯ: чистого гостя переключают, две
    // полноценные стороны не сливают никогда.
    // ЛИЦО ЗАБИРАЕТ СЕРВЕР: у бота есть только ключ, а ссылка на файл содержит токен и наружу не
    // уходит. Не вышло — предлагать будет нечего, и об этом просто не спросят.
    const photo =
      typeof offeredPhotoFileId === "string" && offeredPhotoFileId && process.env.TELEGRAM_BOT_TOKEN
        ? await photoDataUrl(process.env.TELEGRAM_BOT_TOKEN, offeredPhotoFileId)
        : undefined;
    const result = linkTelegram(account.id, account.recoveryHash, telegramId, {
      ...(typeof telegramName === "string" && telegramName ? { label: telegramName } : {}),
      ...(typeof offeredName === "string" && offeredName ? { name: offeredName } : {}),
      ...(photo ? { photo } : typeof offeredPhoto === "string" && offeredPhoto ? { photo: offeredPhoto } : {}),
    });
    if (!result) return res.status(403).json({ error: "forbidden" });
    settleLink(code, telegramId, result.kind);
    // ...И СРАЗУ — О ЧЁМ СПРАШИВАТЬ ЧЕЛОВЕКА ТАМ ЖЕ, В ТЕЛЕГЕ: он стоит перед ботом, а не перед
    // страницей, и второй раунд разговора идёт здесь.
    const profile = profileOf(result.account.id);
    res.json({
      kind: result.kind,
      name: result.account.name,
      offer: offerFor(result.account, telegramDoor(result.account.id), profile?.nameChosen ?? true),
    });
  });

  /**
   * РАЗГОВОР ИДЁТ В ТЕЛЕГЕ, И ПРАВКИ ПРИХОДЯТ ОТТУДА ЖЕ. Бот спрашивает человека кнопками — взять
   * ли тамошнее имя, взять ли лицо, или назваться самому — и приносит ответ сюда.
   *
   * Доверие: общий секрет (бот — наш) плюс дверь (телега подписала, кто пришёл). Кода
   * восстановления у бота нет и не должно быть: он ведёт разговор, а не владеет аккаунтом.
   */
  app.post("/auth/telegram/profile", async (req, res) => {
    const secret = linkSecret();
    if (!secret) return res.status(503).json({ error: "telegram_not_configured" });
    const { telegramId, secret: given, name, photoFileId, keep } = req.body || {};
    if (typeof telegramId !== "string" || given !== secret) return res.status(401).json({ error: "unauthorized" });

    const account = accountByTelegram(telegramId);
    if (!account) return res.status(404).json({ error: "unknown_door" });

    if (keep === "name" || keep === "photo") {
      declineByTelegram(telegramId, keep);
    } else if (typeof name === "string" && name.trim()) {
      updateByTelegram(telegramId, { name });
    } else if (typeof photoFileId === "string" && photoFileId && process.env.TELEGRAM_BOT_TOKEN) {
      const face = await photoDataUrl(process.env.TELEGRAM_BOT_TOKEN, photoFileId);
      if (!face) return res.status(422).json({ error: "no_face" });
      updateByTelegram(telegramId, { avatar: face });
    } else {
      return res.status(400).json({ error: "bad_request" });
    }

    const after = accountByTelegram(telegramId)!;
    const profile = profileOf(after.id);
    res.json({
      name: after.name,
      offer: offerFor(after, telegramDoor(after.id), profile?.nameChosen ?? true),
    });
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

  // Прежнее имя того же вопроса — отвечает из той же правды, что и `/rooms`.
  app.get("/rooms/public", (_req, res) => {
    res.json(search().map((room) => seenFromOutside(room)));
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
