import { describe as suite, expect, it } from "vitest";
import type { Snapshot } from "../src/table/contract.js";
import { describe, faceSeen, rawSeen } from "./replayLog.js";
import type { Told } from "./replayStore.js";

// Кадр правдой: у Ye скрытая рука с дамой пик, у Бо открытая с шестёркой, на сукне лицом вверх туз,
// в колоде — девятка рубашкой.
const snap = (): Snapshot =>
  ({
    v: 1,
    people: [{ key: "ye", name: "Ye", ink: "#fff", door: "guest" }, { key: "bo", name: "Бо", ink: "#fff", door: "guest" }],
    chairs: [
      { id: "c1", angle: 0, owner: "ye", hide: true, hand: [{ id: "q", face: { rank: "Q", suit: "s" } }] },
      { id: "c2", angle: 180, owner: "bo", hide: false, hand: [{ id: "six", face: { rank: "6", suit: "h" } }] },
    ],
    piles: [{ id: "deck", cards: [{ id: "nine", face: { rank: "9", suit: "d" } }] }],
    felt: [{ id: "ace", face: { rank: "A", suit: "c" }, x: 0, y: 0, up: true, angle: 0 }],
  }) as unknown as Snapshot;
const names: Record<string, string> = { ye: "Ye", bo: "Бо" };
const name = (key: string) => names[key] ?? key;
let n = 0;
const told = (kind: string, what?: unknown, who?: string, side: Told["side"] = "table"): Told => ({ id: ++n, at: 1000, side, kind, ...(who ? { who } : {}), ...(what === undefined ? {} : { what }) });
const trail = { by: "ye", byName: "Ye", from: "deck" as const };

suite("replayLog.eyes", () => {
  it("скрытую руку видит только хозяин; открытую руку и сукно лицом вверх — все; колоду рубашкой — никто", () => {
    const s = snap();
    expect(faceSeen(s, "ye", "q")).toEqual({ rank: "Q", suit: "s" });
    expect(faceSeen(s, "bo", "q"), "чужая скрытая рука").toBeNull();
    expect(faceSeen(s, "croupier", "q"), "крупье чужих скрытых рук не видит").toBeNull();
    expect(faceSeen(s, "bo", "six")).toEqual({ rank: "6", suit: "h" });
    expect(faceSeen(s, "ye", "ace")).toEqual({ rank: "A", suit: "c" });
    expect(faceSeen(s, "ye", "nine"), "колода рубашкой").toBeNull();
  });

  it("ход стола в скрытую руку: хозяину — лицо, соседу — рубашка; слова одни и те же, из живого журнала", () => {
    const patch = told("patch", { v: 2, ops: [{ t: "move", card: { id: "q", face: { rank: "Q", suit: "s" } }, from: { in: "deck", pile: "deck" }, to: { in: "hand", chair: "c1", i: 0 }, trail }] });
    const mine = describe(patch, snap(), "ye", name);
    const theirs = describe(patch, snap(), "bo", name);
    expect(mine).toEqual([{ who: "Ye", says: "из «колода» себе в руку", cards: [{ rank: "Q", suit: "s" }], known: true }]);
    expect(theirs[0]!.cards, "лицо чужой скрытой карты журнал не раскрывает").toEqual([null]);
    expect(JSON.stringify(theirs)).not.toContain('"Q"');
  });

  it("намерение и отказ — словами, карта глазами зрителя", () => {
    const drop = told("act", { intent: { t: "drop", id: "q", to: { in: "felt", x: 0, y: 0, up: true, angle: 0 } } }, "ye");
    expect(describe(drop, snap(), "bo", name)[0]).toMatchObject({ who: "Ye", says: "кладёт на стол", cards: [null] });
    expect(describe(drop, snap(), "ye", name)[0]!.cards).toEqual([{ rank: "Q", suit: "s" }]);
    const no = told("refused", { intent: { t: "grab", id: "six" }, why: "not-your-turn" }, "bo");
    expect(describe(no, snap(), "ye", name)[0]!.says).toBe("получил отказ: сейчас не твой ход (хотел: берёт карту)");
  });

  it("чего описать нечем — честно: «описания нет», а служебный ход — «на столе ничего не сдвинулось»", () => {
    expect(describe(told("something.new", { x: 1 }), snap(), "ye", name)[0]).toMatchObject({ says: "событие «something.new» — описания нет", known: false });
    expect(describe(told("act", { intent: { t: "wat" } }, "ye"), snap(), "ye", name)[0]).toMatchObject({ known: false });
    expect(describe(told("patch", { v: 3, ops: [{ t: "lock", id: "q", by: "ye" }] }), snap(), "ye", name)[0]!.says).toMatch(/^служебное изменение стола \(lock\)/);
    expect(describe(told("patch", { v: 3 }), snap(), "ye", name)[0]).toMatchObject({ known: false });
  });
});

suite("replayLog.raw", () => {
  it("сырое в технических подробностях режется теми же глазами: ход в скрытую руку и записанный кадр", () => {
    const patch = told("patch", { v: 2, ops: [{ t: "move", card: { id: "q", face: { rank: "Q", suit: "s" } }, from: { in: "deck", pile: "deck" }, to: { in: "hand", chair: "c1", i: 0 }, trail }] });
    expect(JSON.stringify(rawSeen(patch, snap(), "bo"))).not.toContain('"Q"');
    expect(JSON.stringify(rawSeen(patch, snap(), "ye"))).toContain('"Q"');
    const start = told("match.start", { игроки: [], snapshot: snap() }, "ye");
    const seen = JSON.stringify(rawSeen(start, snap(), "bo"));
    expect(seen, "скрытая рука Ye").not.toContain('"Q"');
    expect(seen, "колода рубашкой").not.toContain('"9"');
    expect(seen, "открытое остаётся").toContain('"A"');
  });
});
