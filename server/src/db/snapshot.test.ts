import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { snapshotDb } from "./snapshot.js";

describe("снимок базы", () => {
  it("копирует живую базу целиком и не оставляет временный файл", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "snap-"));
    try {
      const src = path.join(dir, "a.db");
      const db = new DatabaseSync(src);
      db.exec("PRAGMA journal_mode = WAL; CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1), (2), (3)");
      const dest = path.join(dir, "out", "b.db");
      snapshotDb(src, dest); // база ещё открыта и в WAL — как у работающего сервера
      db.close();
      const copy = new DatabaseSync(dest, { readOnly: true });
      expect((copy.prepare("SELECT count(*) AS c FROM t").get() as { c: number }).c).toBe(3);
      expect((copy.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check).toBe("ok");
      copy.close();
      expect(() => new DatabaseSync(`${dest}.tmp`, { readOnly: true })).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
