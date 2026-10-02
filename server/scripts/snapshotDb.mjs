// СНИМОК БАЗЫ ДЛЯ ЗАПАСНОГО УЗЛА: `node scripts/snapshotDb.mjs <база> <куда>`.
//
// `VACUUM INTO` читает базу целиком и пишет цельный файл, не мешая работающему серверу, — так, в отличие от
// копирования файла `.db` рядом с `-wal`, снимок всегда непротиворечив. Пишется во временный файл и
// переименовывается: запасной узел, забирая снимок посреди записи, получил бы половину файла.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
  console.error("usage: snapshotDb.mjs <db> <out>");
  process.exit(2);
}
mkdirSync(dirname(dst), { recursive: true });
const tmp = `${dst}.tmp`;
rmSync(tmp, { force: true });
const db = new DatabaseSync(src, { readOnly: true });
try {
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
} finally {
  db.close();
}
renameSync(tmp, dst);
