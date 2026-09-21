// ДОСТУПЫ: кто что вправе сделать со столом — и что НИКАКОЕ право не обходит замок руки.
//
// Здесь же сторож главного закона: во всём столе нет ни одной проверки «это админ». Есть право и
// вопрос «вправе ли». Иначе новая роль потребует обойти восемь мест, и одно из них забудут.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { allowed, grantedTo, isRole, KEYS, may, mayFlagChair, no, ROLES, why, type Key, type Role } from "./access.js";
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
  const set = (...roles: Role[]) => grantedTo(roles).sort();

  it("у распорядителя — стол целиком, у раздающего — работа сдающего, у игрока — ничего лишнего", () => {
    expect(set("owner")).toEqual([...ROLES.owner].sort());
    expect(set("dealer")).toEqual(["table.collect", "table.deal", "table.shuffle"]);
    expect(set("player")).toEqual([]);
  });

  it("НАЗНАЧЕНИЕ РОЛЕЙ — такой же ключ, как всё прочее", () => {
    expect(set("owner")).toContain("table.roles");
    expect(set("dealer"), "раздающий ролей не раздаёт").not.toContain("table.roles");
  });

  it("роли складываются: распорядитель, взявший раздачу, остаётся распорядителем", () => {
    expect(set("owner", "dealer")).toEqual([...ROLES.owner].sort());
  });

  it("игра может добавить свои ключи всем — их не выдают ролью", () => {
    expect(grantedTo(["player"], ["crew.layout"])).toEqual(["crew.layout"]);
  });

  it("незнакомая роль — не роль", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("ведущий")).toBe(false);
  });
});

describe("разбор: четыре источника, первый отказ выигрывает", () => {
  const granted: Key[] = ["table.deal", "hand.pose"];

  it("ВЕЩЬ ПЕРВАЯ: отклоняющая рука не принимает ни от кого, даже от хозяина", () => {
    expect(may("hand.drop", { granted, locks: { reject: true }, mine: true })).toEqual(no("rejects"));
  });

  it("замок руки стережёт чужого и не трогает хозяина", () => {
    expect(may("hand.take", { granted, locks: { lock: true }, mine: false })).toEqual(no("locked"));
    expect(allowed(may("hand.take", { granted, locks: { lock: true }, mine: true }))).toBe(true);
  });

  it("ИГРА ГОВОРИТ ПОСЛЕ ЗАМКОВ, но раньше набора", () => {
    expect(may("card.cover", { granted, game: no("beats") })).toEqual(no("beats"));
    expect(may("hand.drop", { granted, game: no("not-your-turn") })).toEqual(no("not-your-turn"));
  });

  it("НАБОР — последним: чего не выдали, того нельзя", () => {
    expect(may("table.preset", { granted })).toEqual(no("no-right"));
    expect(allowed(may("table.deal", { granted }))).toBe(true);
  });

  it("ПРАВО НЕ ЛОМАЕТ ЗАМОК: выданный ключ не перебивает замок вещи", () => {
    const all: Key[] = [...KEYS];
    expect(may("hand.take", { granted: all, locks: { lock: true }, mine: false })).toEqual(no("locked"));
    expect(may("hand.drop", { granted: all, locks: { reject: true } })).toEqual(no("rejects"));
    expect(may("pile.grip", { granted: all, locks: { seal: true } })).toEqual(no("locked"));
  });

  it("со своим человек волен без всякой выдачи", () => {
    expect(allowed(may("hand.reorder", { granted: [], mine: true }))).toBe(true);
    expect(allowed(may("pile.take", { granted: [] }))).toBe(true);
  });

  it("ОТКАЗ ВСЕГДА НАЗВАН — по причине человеку пишут словами", () => {
    expect(why(may("table.preset", { granted: [] }))).toBe("no-right");
    expect(why(may("hand.drop", { granted: [], locks: { reject: true } }))).toBe("rejects");
    expect(why(may("hand.take", { granted: [] }))).toBe(null);
  });
});

describe("роли за столом", () => {
  it("создатель — хозяин; прочие — игроки", () => {
    const t = table("Аня", "Боря");
    expect(t.rolesOf("Аня").sort()).toEqual(["owner", "player"]);
    expect(t.rolesOf("Боря")).toEqual(["player"]);
  });

  it("раздающего вешает тот, у кого право; ему открываются ровно три дела", () => {
    const t = table("Аня", "Боря");
    expect("refused" in t.act("Боря", { t: "dealer", key: "Боря" }, 0), "себе роль не выпишешь").toBe(true);
    expect("ops" in t.act("Аня", { t: "dealer", key: "Боря" }, 0)).toBe(true);
    expect(t.rolesOf("Боря").sort()).toEqual(["dealer", "player"]);
    expect(t.granted("Боря").sort()).toEqual(["table.collect", "table.deal", "table.shuffle"]);
  });

  it("раздающий не трогает то, чего ему не давали", () => {
    const t = table("Аня", "Боря");
    t.act("Аня", { t: "dealer", key: "Боря" }, 0);
    expect(t.may("Боря", "table.deal")).toBe(true);
    expect(t.may("Боря", "pile.guard"), "замки стопок — не его дело").toBe(false);
    expect(t.act("Боря", { t: "deckGuard", pile: MAIN_PILE, guard: "lock", on: true }, 0)).toEqual({ refused: "not-yours" });
  });

  it("роль снимается, и права уходят вместе с ней", () => {
    const t = table("Аня", "Боря");
    t.act("Аня", { t: "dealer", key: "Боря" }, 0);
    t.act("Аня", { t: "dealer", key: null }, 0);
    expect(t.granted("Боря")).toEqual([]);
  });

  it("мои права едут в снимке — экран рисует кнопки по ним, а не гадает, кто я", () => {
    const t = table("Аня", "Боря");
    expect([...t.seenBy("Аня").rights].sort()).toEqual([...ROLES.owner].sort());
    expect(t.seenBy("Боря").rights).toEqual([]);
    t.act("Аня", { t: "dealer", key: "Боря" }, 0);
    expect([...t.seenBy("Боря").rights].sort()).toEqual(["table.collect", "table.deal", "table.shuffle"]);
    expect(t.seenBy("Боря").dealer).toBe("Боря");
  });
});

describe("ХОЗЯИН И РАСПОРЯДИТЕЛЬ", () => {
  it("выданный распорядитель ведёт стол, но ролей не раздаёт и комнату не закрывает", () => {
    const t = table("Аня", "Боря");
    t.setAdmins(["Боря"]);
    expect(t.rolesOf("Боря").sort()).toEqual(["admin", "player"]);
    expect(t.may("Боря", "table.deal"), "стол ведёт").toBe(true);
    expect(t.may("Боря", "pile.guard"), "замки стопок его").toBe(true);
    expect(t.may("Боря", "table.roles"), "а роли — нет").toBe(false);
    expect(t.may("Боря", "table.close"), "и закрыть комнату — нет").toBe(false);
  });

  it("ХОЗЯИНОМ НЕ СТАТЬ ПО ВЫДАЧЕ: он им родился вместе с комнатой", () => {
    const t = table("Аня", "Боря");
    t.setAdmins(["Аня", "Боря"]);
    expect(t.rolesOf("Аня").sort(), "хозяин остаётся хозяином, а не становится вторым распорядителем").toEqual(["owner", "player"]);
    expect(t.may("Аня", "table.close")).toBe(true);
  });

  it("роль забрали — права ушли с нею", () => {
    const t = table("Аня", "Боря");
    t.setAdmins(["Боря"]);
    t.setAdmins([]);
    expect(t.rolesOf("Боря")).toEqual(["player"]);
    expect(t.may("Боря", "table.deal")).toBe(false);
  });
});

describe("ПРАВО НЕ ОБХОДИТ ЗАМОК РУКИ", () => {
  it("замок чужой руки админу не по зубам — но СНЯТЬ его он может", () => {
    const t = table("Аня", "Боря");
    const his = seatOf(t, "Боря");
    const top = t.seenBy("Боря").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
    t.act("Боря", { t: "grab", id: top }, 0);
    t.act("Боря", { t: "drop", id: top, to: { in: "hand", chair: his, i: 0 } }, 0);
    t.act("Боря", { t: "flag", chair: his, flag: "lock", on: true }, 0);
    // ЗАМОК ДЕЙСТВУЕТ НА ВСЕХ, включая распорядителя: пока он стоит, чужая рука закрыта и ему.
    expect(t.act("Аня", { t: "grab", id: top }, 0)).toEqual({ refused: "chair-locked" });
    // А вот снять его распорядитель вправе: замок переживает хозяина — человек ушёл, стул остался
    // заперт, и разгрести это больше некому.
    expect("refused" in t.act("Аня", { t: "flag", chair: his, flag: "lock", on: false }, 0)).toBe(false);
    // И только теперь рука открыта — право не обошло замок, а сняло его.
    expect("refused" in t.act("Аня", { t: "grab", id: top }, 0)).toBe(false);
  });

  it("и отклонение чужой руки — тоже: право открывает дверь, а не ломает замок", () => {
    const t = table("Аня", "Боря");
    const his = seatOf(t, "Боря");
    t.act("Боря", { t: "flag", chair: his, flag: "reject", on: true }, 0);
    const top = t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
    t.act("Аня", { t: "grab", id: top }, 0);
    expect(t.act("Аня", { t: "drop", id: top, to: { in: "hand", chair: his, i: 0 } }, 0)).toMatchObject({ refused: "chair-locked" });
  });
});

describe("ЗАКОН: модель доступа одна", () => {
  const dir = new URL(".", import.meta.url).pathname;
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "access.ts");
  const screen = readFileSync(join(dir, "..", "..", "table-client", "screen.ts"), "utf8");
  const lines = (text: string) => text.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"));

  it("нигде не сравнивают личность с распорядителем — спрашивают ключ", () => {
    // ДВА МЕСТА, ГДЕ СРАВНЕНИЕ ЗАКОННО: там, где роль ВЫДАЁТСЯ (`rolesOf`), и там, где о смене
    // распорядителя объявляют дифом. Всё остальное обязано спрашивать ключ.
    const born = /out\.push\("(owner|admin)"\)|t: "admin"/;
    const guilty: string[] = [];
    for (const file of files) {
      for (const line of lines(readFileSync(join(dir, file), "utf8"))) {
        if (born.test(line)) continue;
        if (/(===|!==)\s*this\.admin|this\.admin\s*(===|!==)|admin\s*(===|!==)\s*(by|key|me\(\))/.test(line)) guilty.push(`${file}: ${line.trim()}`);
      }
    }
    expect(guilty, "ключ спрашивают у `access.ts`").toEqual([]);
  });

  it("У ЭКРАНА НЕТ СВОЕГО РАЗБОРА: он зовёт общий и не читает замки руками", () => {
    const guilty = lines(screen).filter((l) => /admin\s*(===|!==)\s*me\(\)/.test(l) || /chair\.(lock|reject)\s*&&/.test(l) || /\.rights\.includes\(/.test(l));
    expect(guilty, "кнопки рисуются через `may` из `access.ts`").toEqual([]);
    expect(screen, "и разбор берётся оттуда же, а не пишется заново").toContain('from "../src/table/access.js"');
  });

  it("замки вещей называет один файл: у стола и у экрана имена одни", () => {
    const contract = readFileSync(join(dir, "contract.ts"), "utf8");
    for (const lock of ["lock", "hide", "reject"]) expect(contract, `флаг ${lock} объявлен в контракте`).toContain(`${lock}: boolean`);
  });
});

describe("ФЛАГИ СТУЛА — одно правило на сервер и на экран", () => {
  const chair = (owner: string | null, croupier?: true) => ({ owner, ...(croupier ? { croupier } : {}) });

  it("свой — хозяин, покинутый — любой, чужой — только с правом hand.flags", () => {
    expect(mayFlagChair([], chair("я"), "я")).toBe(true);
    expect(mayFlagChair([], chair(null), "я")).toBe(true);
    expect(mayFlagChair([], chair("сосед"), "я")).toBe(false);
    expect(mayFlagChair(grantedTo(["owner"]), chair("сосед"), "я")).toBe(true);
    expect(mayFlagChair(grantedTo(["admin"]), chair("сосед"), "я")).toBe(true);
    expect(mayFlagChair(grantedTo(["dealer"]), chair("сосед"), "я")).toBe(false);
  });

  it("стул крупье — только с правом на крупье, даже покинутый", () => {
    expect(mayFlagChair([], chair(null, true), "я")).toBe(false);
    expect(mayFlagChair(grantedTo(["admin"]), chair(null, true), "я")).toBe(true);
  });

  it("экран не держит своей копии правила", () => {
    const screen = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "table-client", "screen.ts"), "utf8");
    const gate = screen.split("\n").find((line) => line.includes("const mayFlag ="))!;
    expect(gate).toContain("mayFlagChair(");
    expect(gate).not.toContain("chair.owner");
  });
});
