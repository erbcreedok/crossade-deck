// ЛЮДИ ПЕРЕЕЗЖАЮТ С ДАННЫМИ. Сторож `accounts.migration-is-idempotent` — на НАСТОЯЩЕМ файле
// прежнего формата, потому что миграция, проверенная на выдуманной строке, проверена не была.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { openDb } from "./open.js";
import { importLegacyAccounts } from "./migrations.js";
import { accountById, accountByIdentity, accountByRecoveryHash, identitiesOf } from "./accountsRepo.js";

const LEGACY = [
  { id: "a-1", name: "Ербол", recoveryHash: "BOVAKI", createdAt: 1700000000000, telegramId: "tg-42" },
  { id: "a-2", name: "Марат", recoveryHash: "ZUDMOT", createdAt: 1700000001000 },
];

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "crossade-legacy-"));
  file = path.join(dir, "accounts.json");
  writeFileSync(file, JSON.stringify(LEGACY, null, 2));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("accounts.migration-is-idempotent", () => {
  it("забирает аккаунты из accounts.json со всеми полями", () => {
    const db = openDb(":memory:");
    expect(importLegacyAccounts(db, file)).toBe(2);

    const one = accountById("a-1", db);
    expect(one?.name).toBe("Ербол");
    expect(one?.createdAt).toBe(1700000000000);
    // Их имена выдавал не этот сервер: предложить им «назваться» значит предложить сменить то,
    // что человек уже выбрал.
    expect(one?.nameChosen).toBe(true);
    expect(accountByRecoveryHash("BOVAKI", db)?.id).toBe("a-1");
    db.close();
  });

  it("телеграм был полем — стал дверью", () => {
    const db = openDb(":memory:");
    importLegacyAccounts(db, file);

    expect(accountByIdentity("telegram", "tg-42", db)?.id).toBe("a-1");
    expect(identitiesOf("a-1", db).map((i) => i.provider)).toEqual(["telegram"]);
    // Гость переехал гостем: ноль дверей — это не потеря, это его состояние.
    expect(identitiesOf("a-2", db)).toEqual([]);
    db.close();
  });

  it("второй прогон на той же базе не меняет ничего", () => {
    const db = openDb(":memory:");
    importLegacyAccounts(db, file);
    const before = db.prepare("SELECT COUNT(*) AS n FROM accounts").get() as { n: number };
    const identsBefore = db.prepare("SELECT COUNT(*) AS n FROM identities").get() as { n: number };

    importLegacyAccounts(db, file);
    importLegacyAccounts(db, file);

    expect(db.prepare("SELECT COUNT(*) AS n FROM accounts").get()).toEqual(before);
    expect(db.prepare("SELECT COUNT(*) AS n FROM identities").get()).toEqual(identsBefore);
    expect(accountById("a-1", db)?.name).toBe("Ербол");
    db.close();
  });

  it("миграции прогоняются один раз: повторное открытие базы их не повторяет", () => {
    const dbFile = path.join(dir, "crossade.db");
    const first = openDb(dbFile);
    const applied = first.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number };
    expect(applied.n).toBeGreaterThan(0);
    first.close();

    const again = openDb(dbFile);
    expect(again.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()).toEqual(applied);
    again.close();
  });

  it("битый файл не роняет сервер и никого не заводит", () => {
    const db = openDb(":memory:");
    writeFileSync(file, "{ это не json");
    expect(importLegacyAccounts(db, file)).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM accounts").get()).toEqual({ n: 0 });
    db.close();
  });
});
