// ГДЕ ЖИВУТ АККАУНТЫ — SQLite на том же волюме, где лежал `accounts.json`.
//
// Решение принято ДО предметов, а не после: файл, целиком читаемый в память и целиком
// переписываемый, кончается на втором инстансе сервера, на выборочных запросах («мои друзья», «мои
// комнаты», «топ») и на предметах. Перенести их потом пришлось бы вместе с живыми людьми.
//
// `node:sqlite` — тот, что уже есть в Node 22 (и в `server/Dockerfile` стоит `node:22-alpine`):
// ни нативной сборки в alpine, ни новой зависимости в `package.json`.

import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { MIGRATIONS } from "./migrations.js";
import { dbFile } from "./paths.js";

function isOnDisk(file: string): boolean {
  return file !== ":memory:" && !file.startsWith("file:");
}

/** Какие миграции эта база уже видела. Их номера, а не «версия схемы» одним числом. */
function appliedVersions(db: DatabaseSync): Set<number> {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  const rows = db.prepare(`SELECT version FROM schema_migrations`).all() as { version: number }[];
  return new Set(rows.map((r) => r.version));
}

/**
 * ПРОГОН МИГРАЦИЙ — по одной, каждая в своей транзакции и со своей отметкой.
 *
 * Отметка ставится ВНУТРИ той же транзакции: миграция, которая применилась, но не успела
 * записаться как применённая, на следующем старте выполнилась бы второй раз — и вторая половина
 * работы (перенос людей из JSON) удвоила бы аккаунты.
 */
export function migrate(db: DatabaseSync): number {
  const done = appliedVersions(db);
  let ran = 0;
  for (const migration of MIGRATIONS) {
    if (done.has(migration.version)) continue;
    db.exec("BEGIN");
    try {
      migration.up(db);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`).run(
        migration.version,
        Date.now(),
      );
      db.exec("COMMIT");
      ran += 1;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return ran;
}

/** Открыть базу по пути и довести её схему до сегодняшней. */
export function openDb(file = dbFile()): DatabaseSync {
  if (isOnDisk(file)) {
    const dir = path.dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(file);
  // ССЫЛКИ ПРОВЕРЯЕТ БАЗА, А НЕ МЫ: identity без аккаунта — это человек, потерявший дверь, и
  // единственный способ не завести такую строку — запретить её на уровне схемы.
  db.exec("PRAGMA foreign_keys = ON");
  // Читающий не ждёт пишущего. На файле — WAL; в памяти журнала нет вовсе.
  if (isOnDisk(file)) db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}

let shared: DatabaseSync | undefined;

/** Одна база на процесс. Открывается при первом обращении, а не при импорте модуля. */
export function db(): DatabaseSync {
  if (!shared) shared = openDb();
  return shared;
}

/** Только для тестов: закрыть и забыть общую базу, чтобы следующий вызов открыл новую. */
export function closeDb(): void {
  shared?.close();
  shared = undefined;
}
