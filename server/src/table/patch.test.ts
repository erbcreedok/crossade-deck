// РАЗБОР ПАТЧА — ОДИН НА ОБА КОНЦА. Сервер собирает им снимок зрителя, клиент — свою догадку о том,
// что сейчас произойдёт. Поэтому закон круга живёт и здесь: место карты — это УГОЛ, и правило, по
// которому он выбирается, обязано совпадать со столом до последнего случая.

import { describe, expect, it } from "vitest";
import { applyPatch } from "./patch.js";
import { DEFAULT_RULES, DEFAULT_SPOT, type Snapshot } from "./contract.js";
import { ringCardStep, ringHour } from "./ring.js";

describe("круг кладёт по углу — и в разборе патча тем же правилом, что и стол", () => {
  const ring = (cards: { id: string; turn?: number }[]): Snapshot => ({
    v: 1, people: [], felt: [], trails: {}, locks: {}, picks: {}, admin: null, dealer: null, rights: [], play: null,
    chairs: [{ id: "c1", angle: 0, owner: "я", lock: false, hide: false, reject: false, forever: false, out: false, pose: { fan: true, shrink: false, tuck: false }, hand: [] }],
    rules: DEFAULT_RULES,
    piles: [{ ...DEFAULT_SPOT, id: "круг", pose: "ring", x: 0, y: 0, cards, shuffles: 0 }],
  });
  const из = { in: "hand" as const, chair: "c1", i: 0 };
  const круг = (s: Snapshot) => s.piles[0]!;
  const врозь = (a: number, b: number) => {
    const away = Math.abs(((a - b) % 360 + 540) % 360 - 180);
    return Math.min(away, 360 - away);
  };

  it("КЛАДУТ НА УГОЛ — карта садится на него, соседи не шевелятся", () => {
    const было = ring([{ id: "a", turn: 0 }]);
    const now = applyPatch(было, { v: 2, ops: [{ t: "move", card: { id: "b" }, from: из, to: { in: "deck", pile: "круг", turn: 90 } }] });
    expect(круг(now).cards.map((c) => c.id)).toEqual(["a", "b"]);
    expect(круг(now).cards.map((c) => c.turn)).toEqual([0, 90]);
  });

  it("угол берётся КАК ЕСТЬ: к часам прилипает прицел, а не разбор", () => {
    // Снеппинг живёт там, где человек целится и видит контур. Снепни его ещё раз здесь — и карта
    // уехала бы с места, которое игрок уже выбрал.
    const now = applyPatch(ring([]), { v: 2, ops: [{ t: "move", card: { id: "b" }, from: из, to: { in: "deck", pile: "круг", turn: 88 } }] });
    expect(круг(now).cards[0]!.turn).toBe(88);
    expect(ringHour(88), "а часы всё так же рядом — ими пользуется прицел").toBe(90);
  });

  it("ЗАНЯТЫЙ УГОЛ НЕ ЗАНИМАЮТ ВТОРОЙ РАЗ: карта встаёт рядом, не прячась", () => {
    const now = applyPatch(ring([{ id: "a", turn: 0 }]), { v: 2, ops: [{ t: "move", card: { id: "b" }, from: из, to: { in: "deck", pile: "круг", turn: 3 } }] });
    const [a, b] = круг(now).cards;
    expect(b!.turn, "не легла поверх").not.toBe(a!.turn);
    expect(врозь(a!.turn!, b!.turn!), "и не налезла").toBeGreaterThanOrEqual(ringCardStep() - 0.001);
  });

  it("вернулась мимо всего — на свой прежний угол, круг не тронут", () => {
    const было = ring([{ id: "в", turn: 0 }, { id: "д", turn: 90 }, { id: "к", turn: 180 }]);
    const now = applyPatch(было, { v: 2, ops: [{ t: "move", card: { id: "д" }, from: { in: "deck", pile: "круг" }, to: { in: "deck", pile: "круг" } }] });
    expect(круг(now).cards.map((c) => c.turn).sort((x, y) => x! - y!), "углы у всех прежние").toEqual([0, 90, 180]);
  });

  it("ПОРЯДОК В КРУГЕ — ЭТО ПОРЯДОК ВХОДА, а не порядок по сукну", () => {
    // Первой зашла та, что легла в конце круга: стрелка смотрит на неё, где бы она ни лежала.
    let s = ring([]);
    s = applyPatch(s, { v: 2, ops: [{ t: "move", card: { id: "первая" }, from: из, to: { in: "deck", pile: "круг", turn: 270 } }] });
    s = applyPatch(s, { v: 3, ops: [{ t: "move", card: { id: "вторая" }, from: из, to: { in: "deck", pile: "круг", turn: 0 } }] });
    expect(круг(s).cards.map((c) => c.id)).toEqual(["первая", "вторая"]);
  });

  it("ушла из зоны — угол забыт: вернётся, круг даст ей новый", () => {
    const было = ring([{ id: "a", turn: 90 }]);
    const now = applyPatch(было, { v: 2, ops: [{ t: "move", card: { id: "a" }, from: { in: "deck", pile: "круг" }, to: { in: "hand", chair: "c1", i: 0 } }] });
    expect(now.chairs[0]!.hand.map((c) => c.id), "карта в руке").toEqual(["a"]);
    expect(now.chairs[0]!.hand[0]!.turn, "а угла у неё больше нет").toBeUndefined();
  });
});
