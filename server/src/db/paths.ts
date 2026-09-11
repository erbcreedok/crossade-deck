// ГДЕ ЛЕЖАТ ДАННЫЕ СЕРВЕРА — один ответ на весь процесс.
//
// Отдельным файлом, потому что путь нужен и тому, кто открывает базу, и той миграции, что забирает
// людей из прежнего `accounts.json`: держи его в одном из них — и второй потянул бы первый по
// кругу.

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Тот самый каталог, что примонтирован волюмом во fly (`server/fly.toml`, `[mounts]`). */
export const DATA_DIR = path.join(__dirname, "..", "..", "data");

/** Файл базы. `CROSSADE_DB_FILE` перебивает его — так тесты берут `:memory:` и не трогают диск. */
export function dbFile(): string {
  return process.env.CROSSADE_DB_FILE || path.join(DATA_DIR, "crossade.db");
}

/** Где люди лежали до базы. Читается один раз, миграцией. */
export const LEGACY_ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
