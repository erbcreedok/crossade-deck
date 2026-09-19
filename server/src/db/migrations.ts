// СХЕМА, ПО ШАГАМ. Каждый шаг применяется однажды и записывается как применённый.
//
// Правка уже уехавшей миграции не применяется НИКОГДА — база помнит её номер. Изменение схемы
// всегда новый номер, даже когда прошлый написан вчера.

import type { DatabaseSync } from "node:sqlite";
import { inkFor } from "../profileInks.js";
import { readFileSync, existsSync } from "fs";
import { LEGACY_ACCOUNTS_FILE } from "./paths.js";

export interface Migration {
  readonly version: number;
  up(db: DatabaseSync): void;
}

/** Как аккаунт лежал в `accounts.json` — ровно те поля, что писал прежний сервер. */
interface LegacyAccount {
  id?: unknown;
  name?: unknown;
  recoveryHash?: unknown;
  createdAt?: unknown;
  telegramId?: unknown;
}

/**
 * ЛЮДИ ИЗ `accounts.json` ПЕРЕЕЗЖАЮТ С ДАННЫМИ, А НЕ НАЧИНАЮТ С ЧИСТОГО ЛИСТА.
 *
 * `INSERT OR IGNORE` и по аккаунту, и по идентичности: миграция помечается применённой, но эта
 * функция всё равно написана так, чтобы второй прогон на той же базе не менял ничего — файл на
 * волюме переживает и откат сервера на прошлую версию, и повторный старт с пустой таблицей
 * миграций.
 */
export function importLegacyAccounts(db: DatabaseSync, file: string): number {
  if (!existsSync(file)) return 0;
  let raw: LegacyAccount[];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf-8"));
    if (!Array.isArray(parsed)) return 0;
    raw = parsed as LegacyAccount[];
  } catch {
    // Повреждённый файл — не повод не подняться: прежний сервер вёл себя точно так же.
    return 0;
  }

  const putAccount = db.prepare(
    `INSERT OR IGNORE INTO accounts (id, name, color, avatar, created_at, recovery_hash)
     VALUES (?, ?, NULL, NULL, ?, ?)`,
  );
  const putIdentity = db.prepare(
    `INSERT OR IGNORE INTO identities (provider, subject, account_id, verified_at) VALUES (?, ?, ?, ?)`,
  );

  let moved = 0;
  for (const one of raw) {
    if (typeof one?.id !== "string" || typeof one.recoveryHash !== "string") continue;
    const name = typeof one.name === "string" && one.name.trim() ? one.name : "Player";
    const createdAt = typeof one.createdAt === "number" ? one.createdAt : Date.now();
    putAccount.run(one.id, name, createdAt, one.recoveryHash);
    // ТЕЛЕГРАМ БЫЛ ПОЛЕМ, СТАНОВИТСЯ ДВЕРЬЮ. Это и есть вся разница между прежней схемой и этой:
    // аккаунт — сущность, а способ входа — его идентичность.
    if (typeof one.telegramId === "string" && one.telegramId) {
      putIdentity.run("telegram", one.telegramId, one.id, createdAt);
    }
    moved += 1;
  }
  return moved;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE accounts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT,
          avatar TEXT,
          created_at INTEGER NOT NULL,
          recovery_hash TEXT NOT NULL UNIQUE
        );
        CREATE TABLE identities (
          provider TEXT NOT NULL,
          subject TEXT NOT NULL,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          verified_at INTEGER NOT NULL,
          PRIMARY KEY (provider, subject)
        );
        CREATE INDEX identities_by_account ON identities(account_id);
      `);
    },
  },
  {
    version: 2,
    up(db) {
      importLegacyAccounts(db, LEGACY_ACCOUNTS_FILE);
    },
  },
  {
    version: 3,
    up(db) {
      // НАЗВАЛСЯ ЛИ ЧЕЛОВЕК САМ. Без этого поля экран профиля не может отличить своё имя от
      // выданной столом клички — а вся первая страница держится ровно на этой разнице: кличка и
      // есть то единственное, что подталкивает назваться.
      //
      // Переехавшие из `accounts.json` считаются назвавшимися: их имена выдавал не этот сервер, и
      // объявить чужое имя кличкой значит предложить человеку сменить то, что он уже выбрал.
      db.exec(`ALTER TABLE accounts ADD COLUMN name_chosen INTEGER NOT NULL DEFAULT 1`);
    },
  },
  {
    version: 4,
    up(db) {
      // КАК ЧЕЛОВЕКА ЗОВУТ ЗА ЭТОЙ ДВЕРЬЮ — `@erbol` у телеграма. Показать «Telegram: привязан» и
      // показать «Telegram: @erbol» — разные вещи: второе человек узнаёт и понимает, ТОТ ли это
      // аккаунт, а первое приходится принимать на веру.
      //
      // Это подпись, а не ключ: `subject` наружу не отдаётся по-прежнему.
      db.exec(`ALTER TABLE identities ADD COLUMN label TEXT`);
    },
  },
  {
    version: 5,
    up(db) {
      // ЧТО ТЕЛЕГА МОЖЕТ ПРЕДЛОЖИТЬ ЧЕЛОВЕКУ: как его зовут ТАМ и его тамошнее лицо.
      //
      // Это не профиль и не подменяет его: человек сам решает, брать ли. Поэтому лежит на ДВЕРИ, а
      // не в аккаунте — аккаунт хранит то, что человек выбрал, дверь помнит, что предлагала.
      db.exec(`ALTER TABLE identities ADD COLUMN offered_name TEXT`);
      db.exec(`ALTER TABLE identities ADD COLUMN offered_photo TEXT`);
    },
  },
  {
    version: 6,
    up(db) {
      // «ОСТАВИТЬ СВОЁ» — ЭТО ВЫБОР, И ОН ОБЯЗАН ПЕРЕЖИТЬ ПЕРЕЗАГРУЗКУ. Иначе вопрос воскресает при
      // каждом открытии профиля, и отказ перестаёт быть отказом.
      db.exec(`ALTER TABLE identities ADD COLUMN declined_name INTEGER NOT NULL DEFAULT 0`);
      db.exec(`ALTER TABLE identities ADD COLUMN declined_photo INTEGER NOT NULL DEFAULT 0`);
    },
  },
  {
    version: 7,
    up(db) {
      // КОМНАТА — ЗАПИСЬ, А ПРОЦЕСС COLYSEUS — ЕЁ ВРЕМЕННАЯ СЕССИЯ.
      //
      // Пока комната была процессом, ни списка комнат, ни вечных комнат быть не могло: последний
      // вышедший уносил с собой и стол, и его код, а ссылка на этот код молча открывала НОВЫЙ стол
      // — человек думал, что пришёл к друзьям, а сидел один.
      //
      // ТРИ ОСИ РАЗДЕЛЬНО, а не один тумблер «приватная/публичная»: кто ВИДИТ комнату, кого в неё
      // ПУСКАЮТ и по какому ТРАНСПОРТУ. «Публичная, но по паролю» и «скрытая, но по ссылке» —
      // разные вещи, и при одном переключателе половина случаев непредставима. У транспорта сегодня
      // одно значение; поле есть, чтобы завтра не переписывать схему.
      //
      // КОД ОСВОБОЖДАЕТСЯ ТОЛЬКО ЗАКРЫТИЕМ: у живой комнаты он `NOT NULL` и уникален (SQLite не
      // считает NULL'ы одинаковыми, поэтому закрытые комнаты не спорят друг с другом за место).
      db.exec(`
        CREATE TABLE rooms (
          id TEXT PRIMARY KEY,
          code TEXT,
          game TEXT NOT NULL,
          title TEXT,
          owner_account TEXT REFERENCES accounts(id) ON DELETE SET NULL,
          visibility TEXT NOT NULL DEFAULT 'public',
          admission TEXT NOT NULL DEFAULT 'code',
          transport TEXT NOT NULL DEFAULT 'server',
          seats INTEGER,
          created_at INTEGER NOT NULL,
          alive_at INTEGER NOT NULL,
          closed_at INTEGER
        );
        CREATE UNIQUE INDEX rooms_by_code ON rooms(code);
        CREATE INDEX rooms_by_owner ON rooms(owner_account);
        CREATE TABLE room_members (
          room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'player',
          joined_at INTEGER NOT NULL,
          PRIMARY KEY (room_id, account_id)
        );
        CREATE INDEX room_members_by_account ON room_members(account_id);
      `);
    },
  },
  {
    version: 8,
    up(db) {
      // ГДЕ СЕЙЧАС ИДЁТ ИГРА В ЭТОЙ КОМНАТЕ. Запись вечна, сессия Colyseus — нет: она поднимается,
      // когда кто-то приходит, и исчезает, когда все вышли. Пустое поле означает ровно это — «стол
      // стоит, за ним никого», а не «комнаты нет».
      db.exec(`ALTER TABLE rooms ADD COLUMN session_id TEXT`);
    },
  },
  {
    version: 9,
    up(db) {
      // УКЛАД КОМНАТЫ И ЕЁ ВЕЧНОСТЬ — два вопроса, которые задаёт стенд при создании стола.
      //
      // Уклад — это КТО РЕШАЕТ: вольница (каждый админ сам), совет (админы голосованием) или вече
      // (настраивают все игроки). Это режим комнаты, а не роль: роли при всех трёх одни и те же.
      //
      // Вечность — переживёт ли стол уход последнего. Невечный закрывается вместе с сессией и
      // отдаёт свой код; вечный стоит и ждёт, потому что принадлежит человеку.
      db.exec(`ALTER TABLE rooms ADD COLUMN mode TEXT NOT NULL DEFAULT 'free'`);
      db.exec(`ALTER TABLE rooms ADD COLUMN forever INTEGER NOT NULL DEFAULT 0`);
    },
  },
  {
    version: 10,
    up(db) {
      // МОК-ЮЗЕР: аккаунт, за которым нет человека. Заводится, чтобы за столом было кого показать,
      // пока экран собирается, — и садится за него сам, без клиента и сокета.
      //
      // Признак нужен именно на аккаунте, а не на членстве: «за этим именем никого нет» — свойство
      // человека, а не одной комнаты. И без него посадить мок-юзера значило бы сажать за стол
      // ВСЯКОГО, кто в комнате числится, — то есть рисовать живым людям места, за которыми их нет.
      db.exec(`ALTER TABLE accounts ADD COLUMN bot INTEGER NOT NULL DEFAULT 0`);
    },
  },
  {
    version: 11,
    up(db) {
      // СТУЛЬЯ И ЛЮДИ — РАЗНЫЕ СЧЁТЫ, и одно поле на двоих было враньём.
      //
      // СТУЛ — место за столом. Сколько их, решает стол: в картах админ наплодит хоть один, хоть
      // тридцать два, в шахматах их всегда два, потому что это правило игры, а не настройка.
      //
      // УЧАСТНИК — тот, кто в комнате состоит: игрок, зритель, админ, ушедший спать. Их всех и
      // считает `capacity`, и выходит человек из этого счёта только тогда, когда ВЫЙДЕТ из комнаты.
      // Пустой стул при этом остаётся стулом, а вышедший освобождает место в комнате.
      db.exec(`ALTER TABLE rooms RENAME COLUMN seats TO chairs`);
      db.exec(`ALTER TABLE rooms ADD COLUMN capacity INTEGER NOT NULL DEFAULT 32`);
    },
  },
  {
    version: 12,
    up(db) {
      // КЕМ ВХОДИТ НОВЫЙ — настройка комнаты, а не правило сервера.
      //
      // Стол на двоих и стол на тридцать человек живут по-разному: за первым пришедший садится
      // играть, за вторым — смотрит, пока ему не дадут стул. Одно зашитое правило («новый — игрок»)
      // обслуживало только первый случай, а во втором раздавало стулья тем, кто зашёл посмотреть.
      //
      // Стул при этом всё равно выдаёт панель людей: настройка говорит, КЕМ человек входит, а не
      // отменяет то, что дальше им распоряжается админ.
      db.exec(`ALTER TABLE rooms ADD COLUMN newcomer TEXT NOT NULL DEFAULT 'player'`);
    },
  },
  {
    version: 13,
    up(db) {
      // ЦВЕТ ЕСТЬ У КАЖДОГО — и у тех, кто завёлся раньше этого правила.
      //
      // Цвет выдаётся вместе с кличкой, но заведённые до него остались без него, а «цвета нет»
      // рисуется одинаково серым у всех: за столом такие люди неотличимы друг от друга — ни на
      // сукне, ни в полосе, ни в списке.
      const rows = db.prepare(`SELECT id FROM accounts WHERE color IS NULL`).all() as { id: string }[];
      const paint = db.prepare(`UPDATE accounts SET color = ? WHERE id = ?`);
      for (const row of rows) paint.run(inkFor(row.id), row.id);
    },
  },
  {
    version: 14,
    up(db) {
      // ЗРИТЕЛЬ — НЕ УРОВЕНЬ КОНТРОЛЯ, А ИГРОК БЕЗ СТУЛА.
      //
      // Уровней три: хозяин, админ, игрок. Стул — вторая ось, и она живёт в идущей сессии. Пока обе
      // оси были одним полем, «посадить зрителя» означало сменить ему уровень, а «лишить стула» —
      // разжаловать; хозяин, вставший из-за стола, и вовсе не имел, чем называться.
      //
      // Записанные зрители становятся игроками: стула у них нет и так, а роль у них была не ниже.
      db.exec(`UPDATE rooms SET newcomer = 'player' WHERE newcomer = 'spectator'`);
      // ...и комната отдельно помнит, даёт ли она новому стул: это уже не про уровень.
      db.exec(`ALTER TABLE rooms ADD COLUMN newcomer_chair INTEGER NOT NULL DEFAULT 1`);
      // СТУЛ ПЕРЕЖИВАЕТ СЕССИЮ. Место за столом поднимается вместе с партией, но ПОЛОЖЕН ли человеку
      // стул — это про комнату: лишённый стула, вернувшись назавтра, снова оказывался бы за столом.
      db.exec(`ALTER TABLE room_members ADD COLUMN chair INTEGER NOT NULL DEFAULT 1`);
      // Записанные зрители — это и есть «без стула»; уровень у них становится игроцким.
      db.exec(`UPDATE room_members SET chair = 0 WHERE role = 'spectator'`);
      db.exec(`UPDATE room_members SET role = 'player' WHERE role = 'spectator'`);
    },
  },
  {
    version: 15,
    up(db) {
      // СНЯТИЕ ВЕЧНОСТИ АДМИНОМ ЖДЁТ СУТКИ, И ЖДАНИЕ ДОЛЖНО БЫТЬ ЗАПИСАНО.
      //
      // Вечная комната — это чужое имущество: в ней лежат люди, права и код, который человек уже
      // разослал друзьям. Снять вечность значит назначить столу смерть, и молчаливый отложенный
      // снос — это сюрприз через день. Отсрочка нужна, чтобы хозяин успел увидеть и вернуть
      // галочку, а увидеть её можно только тогда, когда срок лежит в базе, а не в чьей-то памяти.
      //
      // `NULL` — вечность не снимают. Хозяин снимает её сразу и колонку не трогает.
      db.exec(`ALTER TABLE rooms ADD COLUMN forever_drop_at INTEGER`);
    },
  },
  {
    version: 16,
    up(db) {
      // СТИКЕРЫ ИГРОКА — его личный набор картинок, который он кидает боту в личку и потом ставит строкой
      // у своего стула. Владелец — ключ человека за столом (`tg:<id>`), а не аккаунт: стол пускает по двери
      // Telegram, и набор должен найтись там же. Байты — в базе: картинка переживает переезд сервера и не
      // зависит от ключей файлов Telegram.
      db.exec(`
        CREATE TABLE stickers (
          id TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          type TEXT NOT NULL,
          bytes BLOB NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX stickers_by_owner ON stickers(owner, created_at);
      `);
    },
  },
  {
    version: 17,
    up(db) {
      // ЖУРНАЛ — одна строка на каждое событие стола и экрана. Не состояние: состояние лежит в своих
      // таблицах и всегда показывает «сейчас», а на вопрос «что тут было полчаса назад» ответить нечем.
      //
      // Строка отвечает на пять вещей: когда, в какой комнате, кто, с какой стороны (стол или экран
      // игрока) и что именно. Подробности — JSON в `what`, потому что у каждого вида события они свои,
      // а заводить колонку под каждый вид значит менять схему на каждый новый вид.
      //
      // `room` и `who` пустые у событий, случившихся до того, как человек сел за стол.
      db.exec(`
        CREATE TABLE events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          at INTEGER NOT NULL,
          room TEXT,
          who TEXT,
          side TEXT NOT NULL,
          kind TEXT NOT NULL,
          what TEXT
        );
        CREATE INDEX events_by_room ON events(room, id);
        CREATE INDEX events_by_time ON events(at);
        CREATE INDEX events_by_kind ON events(kind, at);
      `);
    },
  },
];
