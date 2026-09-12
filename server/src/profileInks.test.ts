// СТОРОЖ `accounts.a-person-owns-a-colour-from-birth`.
//
// Цвет — не украшение, а то, чем человек помечен на сукне, в полосе сверху и в списке за столом.
// Пока цвет был необязательным, половина стола рисовалась одинаково серым — «цвета нет» выглядит у
// всех одинаково, и двоих за столом становится не различить.

import { describe, it, expect, vi } from "vitest";
import { inkFor, inksApart, INKS } from "./profileInks.js";

vi.mock("fs", () => ({
  existsSync: () => false,
  readFileSync: () => "[]",
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// СТОРОЖ `accounts.no-two-people-at-one-table-wear-one-colour`.
//
// Восемь цветов на всех — двое рано или поздно приходят за один стол одинаковыми, и узнавать по
// цвету становится нечего. Разводит их сервер: экраны, решая это сами, показали бы одного человека
// разным цветом разным соседям.
describe("accounts.no-two-people-at-one-table-wear-one-colour", () => {
  it("совпавшему цвету даётся ближайший свободный, первый остаётся при своём", () => {
    const apart = inksApart([
      { id: "a", color: INKS[1] },
      { id: "b", color: INKS[1] },
      { id: "c", color: INKS[3] },
    ]);
    expect(apart.get("a")).toBe(INKS[1]);
    expect(apart.get("b")).not.toBe(INKS[1]);
    expect(apart.get("b")).not.toBe(INKS[3]);
    expect(apart.get("c")).toBe(INKS[3]);
    expect(new Set([...apart.values()]).size).toBe(3);
  });

  it("за полным столом цветов на всех не хватает — и последний остаётся при своём", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, color: INKS[0] }));
    const apart = inksApart(nine);
    expect(new Set([...apart.values()]).size).toBe(INKS.length);
    expect(apart.get("n8")).toBe(INKS[0]);
  });
});

describe("accounts.a-person-owns-a-colour-from-birth", () => {
  it("цвет выдаётся вместе с кличкой", async () => {
    const { createAccount } = await import("./accounts.js");
    const one = createAccount();
    expect(one.color).toBe(inkFor(one.id));
  });

  it("один и тот же номер — один и тот же цвет, разные — обычно разные", () => {
    expect(inkFor("один")).toBe(inkFor("один"));
    const spread = new Set(Array.from({ length: 64 }, (_, i) => inkFor(`акк-${i}`)));
    expect(spread.size, "восемь цветов раздаются, а не один на всех").toBeGreaterThan(4);
  });

  it("цвет нельзя снять в никуда — пустой возвращает выданный при рождении", async () => {
    const { createAccount, updateProfile } = await import("./accounts.js");
    const one = createAccount("Алия");
    updateProfile(one.id, one.recoveryHash, { color: "#123456" });
    const bare = updateProfile(one.id, one.recoveryHash, { color: "" });
    expect(bare?.color).toBe(inkFor(one.id));
  });
});
