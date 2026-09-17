// ДОСТУПЫ: кто что вправе сделать со столом — и что НИКАКОЕ право не обходит замок руки.
//
// Здесь же сторож главного закона: во всём столе нет ни одной проверки «это админ». Есть право и
// вопрос «вправе ли». Иначе новая роль потребует обойти восемь мест, и одно из них забудут.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { may, RIGHTS, ROLES, rightsOf, isRole } from "./access.js";
import { deal } from "./deal.js";
import { Table } from "./table.js";
import { MAIN_PILE, type Person } from "./contract.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const table = (...keys: string[]) => {
  const t = new Table(deal(), keys[0]!);
  for (const k of keys) t.join(person(k));
  return t;
};
const seatOf = (t: Table, who: string) => t.layout().chairs.find((c) => c.owner === who)!.id;

describe("наборы доступов", () => {
  it("у админа почти всё, у раздающего — работа сдающего, у игрока — ничего лишнего", () => {
    expect(rightsOf(["admin"])).toEqual([...RIGHTS]);
    expect(rightsOf(["dealer"])).toEqual(["deal", "collect", "shuffle"]);
    expect(rightsOf(["player"])).toEqual([]);
  });

  it("НАЗНАЧЕНИЕ РОЛЕЙ — тоже право, а не «может админ»", () => {
    expect(may(["admin"], "roles")).toBe(true);
    expect(may(["dealer"], "roles"), "раздающий не раздаёт роли").toBe(false);
  });

  it("роли складываются: админ, взявший раздачу, остаётся админом", () => {
    expect(rightsOf(["admin", "dealer"])).toEqual([...RIGHTS]);
  });

  it("незнакомая роль — не роль", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("ведущий")).toBe(false);
  });
});

describe("роли за столом", () => {
  it("создатель — админ, пока он за столом; прочие — игроки", () => {
    const t = table("Аня", "Боря");
    expect(t.rolesOf("Аня").sort()).toEqual(["admin", "player"]);
    expect(t.rolesOf("Боря")).toEqual(["player"]);
  });

  it("раздающего вешает тот, у кого право; ему открываются ровно три дела", () => {
    const t = table("Аня", "Боря");
    expect("refused" in t.act("Боря", { t: "dealer", key: "Боря" }, 0), "себе роль не выпишешь").toBe(true);
    expect("ops" in t.act("Аня", { t: "dealer", key: "Боря" }, 0)).toBe(true);
    expect(t.rolesOf("Боря").sort()).toEqual(["dealer", "player"]);
    expect(t.rightsOf("Боря")).toEqual(["deal", "collect", "shuffle"]);
  });

  it("раздающий не трогает то, чего ему не давали", () => {
    const t = table("Аня", "Боря");
    t.act("Аня", { t: "dealer", key: "Боря" }, 0);
    expect(t.may("Боря", "deal")).toBe(true);
    expect(t.may("Боря", "pile"), "замки стопок — не его дело").toBe(false);
    expect(t.act("Боря", { t: "deckGuard", pile: MAIN_PILE, guard: "lock", on: true }, 0)).toEqual({ refused: "not-yours" });
  });

  it("роль снимается, и права уходят вместе с ней", () => {
    const t = table("Аня", "Боря");
    t.act("Аня", { t: "dealer", key: "Боря" }, 0);
    t.act("Аня", { t: "dealer", key: null }, 0);
    expect(t.rightsOf("Боря")).toEqual([]);
  });

  it("мои права едут в снимке — экран рисует кнопки по ним, а не гадает, кто я", () => {
    const t = table("Аня", "Боря");
    expect(t.seenBy("Аня").rights).toEqual([...RIGHTS]);
    expect(t.seenBy("Боря").rights).toEqual([]);
    t.act("Аня", { t: "dealer", key: "Боря" }, 0);
    expect(t.seenBy("Боря").rights).toEqual(["deal", "collect", "shuffle"]);
    expect(t.seenBy("Боря").dealer).toBe("Боря");
  });
});

describe("ПРАВО НЕ ОБХОДИТ ЗАМОК РУКИ", () => {
  it("замок чужой руки админу не по зубам — и снять его он тоже не может", () => {
    const t = table("Аня", "Боря");
    const his = seatOf(t, "Боря");
    const top = t.seenBy("Боря").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
    t.act("Боря", { t: "grab", id: top }, 0);
    t.act("Боря", { t: "drop", id: top, to: { in: "hand", chair: his, i: 0 } }, 0);
    t.act("Боря", { t: "flag", chair: his, flag: "lock", on: true }, 0);
    expect(t.act("Аня", { t: "grab", id: top }, 0)).toEqual({ refused: "chair-locked" });
    expect(t.act("Аня", { t: "flag", chair: his, flag: "lock", on: false }, 0)).toEqual({ refused: "not-yours" });
  });

  it("и отклонение чужой руки — тоже: право открывает дверь, а не ломает замок", () => {
    const t = table("Аня", "Боря");
    const his = seatOf(t, "Боря");
    t.act("Боря", { t: "flag", chair: his, flag: "reject", on: true }, 0);
    const top = t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
    t.act("Аня", { t: "grab", id: top }, 0);
    expect(t.act("Аня", { t: "drop", id: top, to: { in: "hand", chair: his, i: 0 } }, 0)).toEqual({ refused: "chair-locked" });
  });
});

describe("ЗАКОН: проверок «это админ» в столе нет", () => {
  const dir = new URL(".", import.meta.url).pathname;
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "access.ts");

  it("нигде не сравнивают личность с админом — спрашивают право", () => {
    // ДВА МЕСТА, ГДЕ СРАВНЕНИЕ ЗАКОННО: там, где роль ВЫДАЁТСЯ (`rolesOf`), и там, где о смене
    // админа объявляют дифом. Всё остальное обязано спрашивать право.
    const born = /out\.push\("admin"\)|t: "admin"/;
    const guilty: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(dir, file), "utf8");
      for (const line of text.split("\n")) {
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*") || born.test(line)) continue;
        if (/(===|!==)\s*this\.admin|this\.admin\s*(===|!==)|admin\s*(===|!==)\s*(by|key|me\(\))/.test(line)) guilty.push(`${file}: ${line.trim()}`);
      }
    }
    expect(guilty, "право спрашивают у `access.ts`, а не сравнивают, кто человек").toEqual([]);
  });

  it("у экрана нет своего списка прав: он берёт их из снимка", () => {
    const screen = readFileSync(join(dir, "..", "..", "table-client", "screen.ts"), "utf8");
    const guilty = screen.split("\n").filter((line) => !line.trimStart().startsWith("//") && /admin\s*(===|!==)\s*me\(\)/.test(line));
    expect(guilty, "кнопки рисуются по `s.rights`").toEqual([]);
  });
});
