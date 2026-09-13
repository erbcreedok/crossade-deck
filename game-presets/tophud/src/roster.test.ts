// СТОРОЖ `tophud.the-roster-puts-me-first-and-counts-the-chairs`.
//
// Список за столом открывают, чтобы увидеть, кто здесь и кто ты среди них. Своя строка, потерянная
// между чужими, заставляет искать себя глазами; счётчик, считающий зрителей за сидящих, врёт про
// свободные места.

import { describe, it, expect } from "vitest";
import { roleWord, rosterList, type TopHudMember } from "./roster.js";

const one = (name: string, role: TopHudMember["role"], seated = true, extra: Partial<TopHudMember> = {}): TopHudMember => ({
  name,
  ink: "#fff",
  role,
  seated,
  ...extra,
});

describe("tophud.the-roster-puts-me-first-and-counts-the-chairs", () => {
  it("я стою первым, даже будучи зрителем", () => {
    const { rows } = rosterList([one("Алия", "owner"), one("Дана", "player", false, { mine: true }), one("Тимур", "player")]);
    expect(rows.map((r) => r.name)).toEqual(["Дана", "Алия", "Тимур"]);
  });

  it("без меня список идёт по старшинству роли", () => {
    const { rows } = rosterList([one("Дана", "player", false), one("Тимур", "player"), one("Алия", "owner"), one("Канат", "admin")]);
    expect(rows.map((r) => r.name)).toEqual(["Алия", "Канат", "Тимур", "Дана"]);
  });

  it("одинаковые роли остаются в том порядке, в каком пришли", () => {
    const { rows } = rosterList([one("Тимур", "player"), one("Канат", "player")]);
    expect(rows.map((r) => r.name)).toEqual(["Тимур", "Канат"]);
  });

  it("зритель считается в «всего», но не в «за столом»", () => {
    const list = rosterList([one("Алия", "owner"), one("Дана", "player", false), one("Тимур", "player", true, { away: true })]);
    expect(list.seated).toBe(2);
    expect(list.total).toBe(3);
  });
});

// СТОРОЖ `tophud.a-word-comes-from-the-level-and-the-chair`.
//
// Слово в строке строится из ДВУХ источников: уровень контроля и есть ли место за столом. Одного
// уровня мало — хозяин, вставший из-за стола, продолжает вести его, но не играет; игрок без места
// не понижен в правах, он просто смотрит.
describe("tophud.a-word-comes-from-the-level-and-the-chair", () => {
  it("хозяин со столом — хозяин, без стола — ведущий", () => {
    expect(roleWord("owner", true)).toBe("хозяин");
    expect(roleWord("owner", false)).toBe("ведущий");
  });

  it("игрок со столом — игрок, без стола — зритель", () => {
    expect(roleWord("player", true)).toBe("игрок");
    expect(roleWord("player", false)).toBe("зритель");
  });

  it("админ остаётся админом — разницу говорит соседняя строка", () => {
    expect(roleWord("admin", true)).toBe("админ");
    expect(roleWord("admin", false)).toBe("админ");
  });

  it("внутри уровня сидящие идут первыми", () => {
    const { rows } = rosterList([
      { name: "смотрит", ink: "#fff", role: "player", seated: false },
      { name: "играет", ink: "#fff", role: "player", seated: true },
    ]);
    expect(rows.map((one) => one.name)).toEqual(["играет", "смотрит"]);
  });
});
