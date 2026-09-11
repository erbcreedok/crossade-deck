import { describe, it, expect, vi } from "vitest";

// База живёт в памяти (`server/vitest.config.ts`), а прежний `accounts.json` не читается: его
// забирает миграция, и `existsSync` здесь отвечает, что файла нет.
vi.mock("fs", () => ({
  existsSync: () => false,
  readFileSync: () => "[]",
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { GUEST_ADJ, GUEST_NOUN } from "./guestNames.js";
import {
  createAccount,
  findAccountById,
  findAccountByRecoveryHash,
  findAccountByTelegramId,
  renameAccount,
  regenerateRecoveryHash,
} from "./accounts.js";

const VOWELS = "AEIOU";

describe("createAccount", () => {
  it("trims the given name", () => {
    expect(createAccount("  Alice  ").name).toBe("Alice");
  });

  it("имя гостю выдаёт сервер: кличка из двух слов, а не номер", () => {
    const [adj, noun] = createAccount().name.split(" ");
    expect(GUEST_ADJ).toContain(adj);
    expect(GUEST_NOUN).toContain(noun);
  });

  it("пустое имя — та же кличка, а не пустота", () => {
    const [adj, noun] = createAccount("   ").name.split(" ");
    expect(GUEST_ADJ).toContain(adj);
    expect(GUEST_NOUN).toContain(noun);
  });

  it("caps the name length at 24 characters", () => {
    const account = createAccount("x".repeat(40));
    expect(account.name).toHaveLength(24);
  });

  it("generates a 6-letter recovery code following the CVCCVC pattern", () => {
    const { recoveryHash } = createAccount();
    expect(recoveryHash).toMatch(/^[A-Z]{6}$/);
    const isVowel = [...recoveryHash].map((c) => VOWELS.includes(c));
    expect(isVowel).toEqual([false, true, false, false, true, false]);
  });

  it("never issues the same recovery code twice", () => {
    const codes = new Set(Array.from({ length: 300 }, () => createAccount().recoveryHash));
    expect(codes.size).toBe(300);
  });
});

describe("findAccountByTelegramId", () => {
  it("finds the account created with that telegramId", () => {
    const account = createAccount("Henry", "tg-42");
    expect(findAccountByTelegramId("tg-42")?.id).toBe(account.id);
    expect(account.telegramId).toBe("tg-42");
  });

  it("returns undefined for an unknown telegramId", () => {
    expect(findAccountByTelegramId("tg-does-not-exist")).toBeUndefined();
  });

  it("omits telegramId on accounts created without it", () => {
    const account = createAccount("Ivy");
    expect(account.telegramId).toBeUndefined();
  });
});

describe("findAccountById", () => {
  it("finds an account that was created", () => {
    const account = createAccount("Bob");
    expect(findAccountById(account.id)?.name).toBe("Bob");
  });

  it("returns undefined for an unknown id", () => {
    expect(findAccountById("does-not-exist")).toBeUndefined();
  });
});

describe("findAccountByRecoveryHash", () => {
  it("finds the account regardless of case or dashes in the input", () => {
    const account = createAccount("Carol");
    const messy = [...account.recoveryHash].join("-").toLowerCase();
    expect(findAccountByRecoveryHash(messy)?.id).toBe(account.id);
  });

  it("returns undefined for a code that was never issued", () => {
    expect(findAccountByRecoveryHash("ZZZZZZ")).toBeUndefined();
  });
});

describe("renameAccount", () => {
  it("rejects an incorrect recoveryHash and leaves the name untouched", () => {
    const account = createAccount("Dave");
    expect(renameAccount(account.id, "WRONGCODE", "Hacker")).toBeUndefined();
    expect(findAccountById(account.id)?.name).toBe("Dave");
  });

  it("renames when the recoveryHash matches", () => {
    const account = createAccount("Dave");
    const updated = renameAccount(account.id, account.recoveryHash, "David");
    expect(updated?.name).toBe("David");
    expect(findAccountById(account.id)?.name).toBe("David");
  });

  it("ignores an empty/whitespace new name", () => {
    const account = createAccount("Erin");
    renameAccount(account.id, account.recoveryHash, "   ");
    expect(findAccountById(account.id)?.name).toBe("Erin");
  });
});

describe("regenerateRecoveryHash", () => {
  it("rejects an incorrect recoveryHash", () => {
    const account = createAccount("Frank");
    expect(regenerateRecoveryHash(account.id, "WRONGCODE")).toBeUndefined();
  });

  it("issues a new code and invalidates the old one", () => {
    const account = createAccount("Grace");
    const oldHash = account.recoveryHash;

    const updated = regenerateRecoveryHash(account.id, oldHash);

    expect(updated?.recoveryHash).toBeDefined();
    expect(updated!.recoveryHash).not.toBe(oldHash);
    expect(findAccountByRecoveryHash(oldHash)).toBeUndefined();
    expect(findAccountByRecoveryHash(updated!.recoveryHash)?.id).toBe(account.id);
  });
});
