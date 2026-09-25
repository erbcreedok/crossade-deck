import { describe, expect, it } from "vitest";
import type { Person } from "./contract.js";
import { INTENT_KINDS, readIntent } from "./intent.js";
import { Table } from "./table.js";

// СЕРВЕР НЕ ВЕРИТ ФОРМЕ СООБЩЕНИЯ. Клиент, который пишут не здесь, может прислать что угодно — и стол
// от этого не падает: намерение либо прочитано целиком, либо его нет.

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const JUNK: unknown[] = [undefined, null, 0, -1, NaN, Infinity, "", "x", "a".repeat(5000), true, [], {}, [[]], { in: "felt" }, { in: "deck" }, { in: "hand" }, { in: "nowhere" }, { pile: 7 }, { x: "1", y: null }];
const FIELDS = ["id", "to", "pile", "chair", "key", "act", "how", "ids", "pose", "flag", "on", "x", "y", "angle", "guard", "side", "moves", "rules"];

function table(): Table {
  const t = new Table(Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, face: { rank: String(i + 6), suit: "s" as const } })), "a");
  t.join(person("a"));
  t.join(person("b"));
  return t;
}

describe("readIntent — намерение читается целиком или не читается", () => {
  it("знает каждое намерение контракта", () => {
    expect(INTENT_KINDS.size).toBe(29);
  });

  it("мусор вместо намерения — null", () => {
    for (const raw of [...JUNK, { t: "nope" }, { t: 5 }]) expect(readIntent(raw), JSON.stringify(raw)).toBeNull();
  });

  it("что бы ни прочлось из мусорных полей — стол от этого не падает", () => {
    const t = table();
    let read = 0;
    for (const kind of INTENT_KINDS) {
      for (const field of FIELDS) {
        for (const junk of JUNK) {
          const intent = readIntent({ t: kind, [field]: junk });
          if (!intent) continue;
          read++;
          expect(() => t.act("a", intent, 1), `${kind}.${field}=${JSON.stringify(junk)}`).not.toThrow();
        }
      }
    }
    expect(read).toBeGreaterThan(0);
  });

  it("честное намерение с одним испорченным полем — тоже не роняет стол", () => {
    const felt = { in: "felt", x: 0, y: 0, up: true, angle: 0 };
    const honest: Record<string, unknown>[] = [
      { t: "grab", id: "c0" },
      { t: "drop", id: "c0", to: felt },
      { t: "moveMany", moves: [{ id: "c1", to: felt }] },
      { t: "gather", ids: ["c1", "c2"], side: "keep", to: { x: 0, y: 0, angle: 0 } },
      { t: "pileDrop", pile: "deck", to: { in: "deck", pile: "deck" } },
      { t: "deckMove", pile: "deck", x: 0, y: 0 },
      { t: "pose", chair: "s1", pose: { fan: false } },
      { t: "arrange", how: "shuffle", ids: ["c0"] },
    ];
    const t = table();
    for (const base of honest) {
      expect(readIntent(base), JSON.stringify(base)).not.toBeNull();
      for (const field of Object.keys(base).filter((k) => k !== "t")) {
        for (const junk of JUNK) {
          const intent = readIntent({ ...base, [field]: junk });
          if (intent) expect(() => t.act("a", intent, 1), `${String(base.t)}.${field}=${JSON.stringify(junk)}`).not.toThrow();
        }
      }
    }
  });

  it("честное намерение проходит как есть, лишние поля отрезаются", () => {
    expect(readIntent({ t: "grab", id: "c1", evil: 1 })).toEqual({ t: "grab", id: "c1" });
    expect(readIntent({ t: "drop", id: "c1", to: { in: "felt", x: 1, y: 2, up: true, angle: 0 } })).toEqual({ t: "drop", id: "c1", to: { in: "felt", x: 1, y: 2, up: true, angle: 0 } });
    expect(readIntent({ t: "drop", id: "c1", to: { in: "deck", pile: "p", turn: 90 } })).toEqual({ t: "drop", id: "c1", to: { in: "deck", pile: "p", turn: 90 } });
    expect(readIntent({ t: "drop", id: "c1" })).toBeNull();
    expect(readIntent({ t: "moveMany", moves: [{ id: "c1", to: { in: "hand", chair: "s1", i: 0 } }] })).toEqual({ t: "moveMany", moves: [{ id: "c1", to: { in: "hand", chair: "s1", i: 0 } }] });
    expect(readIntent({ t: "moveMany", moves: [{ id: "c1" }] })).toBeNull();
    expect(readIntent({ t: "sync" })).toEqual({ t: "sync" });
  });

  it("пачка карт ограничена: тысяча имён в одном намерении — не намерение", () => {
    expect(readIntent({ t: "pick", on: true, ids: Array.from({ length: 1000 }, (_, i) => `c${i}`) })).toBeNull();
  });
});

/**
 * ДЕЛО КРУПЬЕ НЕСЁТ АДРЕСАТА. «Указать ход» без стула — дело ни о чём: оно доходило до стола
 * безадресным и молча ничего не делало, а на экране это выглядело как «кнопка не работает».
 */
describe("intent.a-crew-act-keeps-its-target", () => {
  it("стул дела сохраняется", () => {
    expect(readIntent({ t: "crew", act: "point", chair: "c3" })).toEqual({ t: "crew", act: "point", chair: "c3" });
  });

  it("а дело без адресата остаётся безадресным", () => {
    expect(readIntent({ t: "crew", act: "ring" })).toEqual({ t: "crew", act: "ring" });
  });

  it("чужой мусор в поле стула не проходит", () => {
    expect(readIntent({ t: "crew", act: "point", chair: 5 })).toEqual({ t: "crew", act: "point" });
  });
});
