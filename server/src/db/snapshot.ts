// СНИМОК БАЗЫ — цельный файл для запасного узла.
//
// `VACUUM INTO` читает базу и пишет новый файл, не мешая работающему серверу: в отличие от копирования
// `.db` рядом с `-wal`, снимок всегда непротиворечив. Пишется во временный файл и переименовывается.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, renameSync, rmSync } from "fs";
import path from "path";

/** Положить снимок `src` в `dest`. `src` открывается только на чтение. */
export function snapshotDb(src: string, dest: string): void {
  mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp`;
  rmSync(tmp, { force: true });
  const db = new DatabaseSync(src, { readOnly: true });
  try {
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  renameSync(tmp, dest);
}
