// СХЕМА, ПО ШАГАМ. Каждый шаг применяется однажды и записывается как применённый.
//
// Правка уже уехавшей миграции не применяется НИКОГДА — база помнит её номер. Изменение схемы
// всегда новый номер, даже когда прошлый написан вчера.

import type { DatabaseSync } from "node:sqlite";
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
];
