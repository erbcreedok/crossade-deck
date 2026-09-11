// СВОЁ ИМЯ ПРОТИВ ВЫДАННОГО СТОЛОМ.
//
// На этой разнице держится вся первая страница хаба: кличка — единственное, что подталкивает
// назваться. Значит это факт в базе, а не догадка клиента по списку слов: список живёт на сервере,
// и клиент, который бы сверялся с его копией, разошёлся бы с ним на первом же новом слове.

import { describe, it, expect, vi } from "vitest";

vi.mock("fs", () => ({
  existsSync: () => false,
  readFileSync: () => "[]",
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { createAccount, profileOf, updateProfile } from "./accounts.js";

describe("accounts.a-nickname-knows-it-is-one", () => {
  it("молча заведённый аккаунт носит кличку, и знает это про себя", () => {
    const guest = createAccount();
    expect(guest.nameChosen).toBe(false);
    expect(profileOf(guest.id)?.nameChosen).toBe(false);
  });

  it("названный при создании — назвался сам", () => {
    expect(createAccount("Ербол").nameChosen).toBe(true);
  });

  it("сменил имя — перестал носить кличку", () => {
    const guest = createAccount();
    const named = updateProfile(guest.id, guest.recoveryHash, { name: "Ербол" });
    expect(named?.nameChosen).toBe(true);
    expect(profileOf(guest.id)?.nameChosen).toBe(true);
  });

  it("сменил цвет — кличка осталась кличкой", () => {
    const guest = createAccount();
    updateProfile(guest.id, guest.recoveryHash, { color: "#f2c14e" });
    expect(profileOf(guest.id)?.nameChosen).toBe(false);
  });
});

// Переехавшие из `accounts.json` носят своё имя, а не кличку — это проверяется там, где
// переезд и живёт (`db/migration.test.ts`): здесь подменён `fs`, и настоящего файла не завести.
