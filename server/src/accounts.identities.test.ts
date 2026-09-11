// АККАУНТ И ЕГО ДВЕРИ. Сторож `accounts.two-full-accounts-never-merge` — правило необратимое,
// поэтому оно жёсткое: слиянием можно потерять предметы, и первая же жалоба будет неразрешима.

import { describe, it, expect, vi } from "vitest";

vi.mock("fs", () => ({
  existsSync: () => false,
  readFileSync: () => "[]",
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import {
  createAccount,
  findAccountByTelegramId,
  isGuest,
  linkTelegram,
  profileOf,
  updateProfile,
} from "./accounts.js";
import { linkIdentity } from "./db/accountsRepo.js";

describe("гость — это ноль дверей", () => {
  it("заведённый молча аккаунт гостевой", () => {
    const guest = createAccount();
    expect(isGuest(guest.id)).toBe(true);
    expect(profileOf(guest.id)?.identities).toEqual([]);
  });

  it("вошедший через телегу — уже не гость, и телеграм виден как поле по-прежнему", () => {
    const account = createAccount("Ербол", "tg-1");
    expect(isGuest(account.id)).toBe(false);
    expect(account.telegramId).toBe("tg-1");
    expect(findAccountByTelegramId("tg-1")?.id).toBe(account.id);
  });
});

describe("привязка телеграма", () => {
  it("свободная дверь привязывается к своему аккаунту", () => {
    const guest = createAccount();
    const result = linkTelegram(guest.id, guest.recoveryHash, "tg-free");
    expect(result?.kind).toBe("linked");
    expect(findAccountByTelegramId("tg-free")?.id).toBe(guest.id);
    expect(isGuest(guest.id)).toBe(false);
  });

  it("повторная привязка той же двери ничего не ломает", () => {
    const account = createAccount("Дана", "tg-same");
    const result = linkTelegram(account.id, account.recoveryHash, "tg-same");
    expect(result?.kind).toBe("linked");
    expect(profileOf(account.id)?.identities).toEqual(["telegram"]);
  });

  it("чужим кодом не привязать", () => {
    const account = createAccount();
    expect(linkTelegram(account.id, "WRONGC", "tg-x")).toBeUndefined();
    expect(findAccountByTelegramId("tg-x")).toBeUndefined();
  });

  it("одна дверь не ведёт к двоим", () => {
    const first = createAccount("Первый", "tg-one");
    const second = createAccount("Второй");
    expect(() => linkIdentity(second.id, "telegram", "tg-one")).toThrow();
    expect(findAccountByTelegramId("tg-one")?.id).toBe(first.id);
  });
});

describe("accounts.two-full-accounts-never-merge", () => {
  it("чистый гость не сливается, а переключается на свой настоящий аккаунт", () => {
    const real = createAccount("Ербол", "tg-real");
    const guest = createAccount();

    const result = linkTelegram(guest.id, guest.recoveryHash, "tg-real");

    expect(result?.kind).toBe("switch");
    expect(result?.account.id).toBe(real.id);
    // Гостевой аккаунт остаётся там, где был: ничего не уничтожено и ничего не перенесено.
    expect(isGuest(guest.id)).toBe(true);
    expect(profileOf(guest.id)).toBeDefined();
  });

  it("две полноценные стороны — отказ, и в базе не меняется ничего", () => {
    const mine = createAccount("Мой", "tg-mine");
    const other = createAccount("Чужой", "tg-other");

    const result = linkTelegram(mine.id, mine.recoveryHash, "tg-other");

    expect(result?.kind).toBe("conflict");
    expect(result?.account.id).toBe(other.id);
    expect(profileOf(mine.id)?.identities).toEqual(["telegram"]);
    expect(findAccountByTelegramId("tg-other")?.id).toBe(other.id);
    expect(findAccountByTelegramId("tg-mine")?.id).toBe(mine.id);
  });
});

describe("профиль", () => {
  it("цвет и аватар меняются своим кодом и снимаются пустым значением", () => {
    const account = createAccount("Тимур");
    const painted = updateProfile(account.id, account.recoveryHash, { color: "#f2c14e", avatar: "🐙" });
    expect(painted?.color).toBe("#f2c14e");
    expect(painted?.avatar).toBe("🐙");

    const bare = updateProfile(account.id, account.recoveryHash, { color: "", avatar: "" });
    expect(bare?.color).toBeUndefined();
    expect(profileOf(account.id)?.color).toBeNull();
  });

  it("чужим кодом не перекрасить", () => {
    const account = createAccount("Алия");
    expect(updateProfile(account.id, "WRONGC", { color: "#000000" })).toBeUndefined();
    expect(profileOf(account.id)?.color).toBeNull();
  });

  it("наружу отдаются двери, но не ключи от них", () => {
    const account = createAccount("Канат", "tg-secret");
    const profile = profileOf(account.id)!;
    expect(profile.identities).toEqual(["telegram"]);
    expect(JSON.stringify(profile)).not.toContain("tg-secret");
  });

  it("пустое имя игнорируется — человек без имени за столом это дыра", () => {
    const account = createAccount("Асель");
    updateProfile(account.id, account.recoveryHash, { name: "   " });
    expect(profileOf(account.id)?.name).toBe("Асель");
  });
});
