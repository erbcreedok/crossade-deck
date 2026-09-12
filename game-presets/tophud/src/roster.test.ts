// СТОРОЖ `tophud.the-roster-puts-me-first-and-counts-the-chairs`.
//
// Список за столом открывают, чтобы увидеть, кто здесь и кто ты среди них. Своя строка, потерянная
// между чужими, заставляет искать себя глазами; счётчик, считающий зрителей за сидящих, врёт про
// свободные места.

import { describe, it, expect } from "vitest";
import { rosterList, type TopHudMember } from "./roster.js";

const one = (name: string, role: TopHudMember["role"], extra: Partial<TopHudMember> = {}): TopHudMember => ({
  name,
  ink: "#fff",
  role,
  seated: role !== "spectator",
  ...extra,
});

describe("tophud.the-roster-puts-me-first-and-counts-the-chairs", () => {
  it("я стою первым, даже будучи зрителем", () => {
    const { rows } = rosterList([one("Алия", "owner"), one("Дана", "spectator", { mine: true }), one("Тимур", "player")]);
    expect(rows.map((r) => r.name)).toEqual(["Дана", "Алия", "Тимур"]);
  });

  it("без меня список идёт по старшинству роли", () => {
    const { rows } = rosterList([one("Дана", "spectator"), one("Тимур", "player"), one("Алия", "owner"), one("Канат", "admin")]);
    expect(rows.map((r) => r.name)).toEqual(["Алия", "Канат", "Тимур", "Дана"]);
  });

  it("одинаковые роли остаются в том порядке, в каком пришли", () => {
    const { rows } = rosterList([one("Тимур", "player"), one("Канат", "player")]);
    expect(rows.map((r) => r.name)).toEqual(["Тимур", "Канат"]);
  });

  it("зритель считается в «всего», но не в «за столом»", () => {
    const list = rosterList([one("Алия", "owner"), one("Дана", "spectator"), one("Тимур", "player", { away: true })]);
    expect(list.seated).toBe(2);
    expect(list.total).toBe(3);
  });
});
