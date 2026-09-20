// ЗАКОНЫ РУКИ, ОБЩИЕ ДЛЯ ВСЕХ СТОЛОВ: отклонение, ровная рука и переворот руки целиком.
//
// Здесь проверяется не игра, а сама рука: эти правила одинаковы и в песочнице, и в крестовом, и в
// том, чего ещё нет. Ломаются они тихо — карта уходит не той стороной, и замечают это через круг.

import { describe, expect, it } from "vitest";
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
const croupierSeat = (t: Table) => t.layout().chairs.find((c) => c.croupier)!.id;
const ok = (out: ReturnType<Table["act"]>) => expect("refused" in out ? out.refused : "ok").toBe("ok");
/** Снять верхнюю карту колоды в эту руку. */
function toHand(t: Table, by: string, chair: string): string {
  const top = t.seenBy(by).piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
  ok(t.act(by, { t: "grab", id: top }, 0));
  ok(t.act(by, { t: "drop", id: top, to: { in: "hand", chair, i: 0 } }, 0));
  return top;
}
/**
 * Как карта лежит в руке: `true` — перевёрнута, то есть рубашкой к хозяину.
 *
 * Мерка — именно «перевёрнута», а не «лицо видно»: лицо видно ещё и соседям, если стул не скрыт, и
 * по видимости сторону не прочесть.
 */
const backUp = (t: Table, owner: string, chair: string, card: string) =>
  t.seenBy(owner).chairs.find((c) => c.id === chair)!.hand.find((h) => h.id === card)!.up === true;

describe("ОТКЛОНЯТЬ: рука не принимает, но отдаёт", () => {
  it("с отклонением карту в руку не положить — ни чужую, ни свою", () => {
    const t = table("Аня", "Боря");
    const mine = seatOf(t, "Аня");
    ok(t.act("Аня", { t: "flag", chair: mine, flag: "reject", on: true }, 0));
    const top = t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
    ok(t.act("Аня", { t: "grab", id: top }, 0));
    expect(t.act("Аня", { t: "drop", id: top, to: { in: "hand", chair: mine, i: 0 } }, 0)).toEqual({ refused: "chair-locked" });
    ok(t.act("Аня", { t: "drop", id: top, to: { in: "felt", x: 1, y: 1, up: false, angle: 0 } }, 0));
  });

  it("и стопку целиком тоже не положить", () => {
    const t = table("Аня");
    const mine = seatOf(t, "Аня");
    ok(t.act("Аня", { t: "flag", chair: mine, flag: "reject", on: true }, 0));
    expect(t.act("Аня", { t: "pileDrop", pile: MAIN_PILE, to: { in: "hand", chair: mine, i: 0 } }, 0)).toEqual({ refused: "chair-locked" });
  });

  it("а БРАТЬ из отклоняющей руки можно: отклонение про вход, а не про выход", () => {
    const t = table("Аня");
    const mine = seatOf(t, "Аня");
    const card = toHand(t, "Аня", mine);
    ok(t.act("Аня", { t: "flag", chair: mine, flag: "reject", on: true }, 0));
    ok(t.act("Аня", { t: "grab", id: card }, 0));
    ok(t.act("Аня", { t: "drop", id: card, to: { in: "felt", x: 1, y: 1, up: true, angle: 0 } }, 0));
  });

  it("без отклонения рука принимает, как раньше", () => {
    const t = table("Аня");
    toHand(t, "Аня", seatOf(t, "Аня"));
    expect(t.layout().chairs.find((c) => c.owner === "Аня")!.hand).toHaveLength(1);
  });
});

describe("РОВНАЯ РУКА КРУПЬЕ: вся одной стороной", () => {
  const withCroupier = () => {
    const t = table("Аня");
    t.seatCroupier({ ...person("Крупье"), ink: "#fff" });
    return t;
  };

  it("пустая ровная рука принимает рубашкой вверх — даже карту, которую несли ЛИЦОМ", () => {
    const t = withCroupier();
    const seat = croupierSeat(t);
    // Карта с колоды на сукно лицом вверх, и уже оттуда — в руку крупье.
    const top = t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
    ok(t.act("Аня", { t: "grab", id: top }, 0));
    ok(t.act("Аня", { t: "drop", id: top, to: { in: "felt", x: 2, y: 2, up: true, angle: 0 } }, 0));
    ok(t.act("Аня", { t: "grab", id: top }, 0));
    ok(t.act("Аня", { t: "drop", id: top, to: { in: "hand", chair: seat, i: 0 } }, 0));
    expect(backUp(t, "Крупье", seat, top), "легла закрытой, как лежит колода в руках").toBe(true);
  });

  it("следующая карта равняется на руку, а не на того, кто несёт", () => {
    const t = withCroupier();
    const seat = croupierSeat(t);
    const first = toHand(t, "Аня", seat);
    ok(t.act("Аня", { t: "flip", chair: seat }, 0));
    expect(backUp(t, "Крупье", seat, first), "руку перевернули — она открыта").toBe(false);
    const second = toHand(t, "Аня", seat);
    expect(backUp(t, "Крупье", seat, second), "и пришедшая легла так же").toBe(false);
  });

  it("ОДНУ КАРТУ В НЕЙ НЕ ПЕРЕВЕРНУТЬ — отказ", () => {
    const t = withCroupier();
    const seat = croupierSeat(t);
    const card = toHand(t, "Аня", seat);
    expect(t.act("Аня", { t: "turn", id: card }, 0)).toEqual({ refused: "locked" });
  });

  it("в обычной руке одну карту перевернуть можно — это отличие крупье, а не общий запрет", () => {
    const t = table("Аня");
    const card = toHand(t, "Аня", seatOf(t, "Аня"));
    ok(t.act("Аня", { t: "turn", id: card }, 0));
  });
});

describe("ПЕРЕВЕРНУТЬ РУКУ ЦЕЛИКОМ: порядок наоборот и другая сторона", () => {
  it("своя рука: карты идут в обратном порядке и все сменили сторону", () => {
    const t = table("Аня");
    const mine = seatOf(t, "Аня");
    const one = toHand(t, "Аня", mine);
    const two = toHand(t, "Аня", mine);
    const was = [...t.layout().chairs.find((c) => c.id === mine)!.hand];
    const side = backUp(t, "Аня", mine, one);
    ok(t.act("Аня", { t: "flip" }, 0));
    expect(t.layout().chairs.find((c) => c.id === mine)!.hand).toEqual([...was].reverse());
    expect(backUp(t, "Аня", mine, one)).toBe(!side);
    expect(backUp(t, "Аня", mine, two)).toBe(!side);
  });

  it("чужую руку под замком не перевернуть", () => {
    const t = table("Аня", "Боря");
    const his = seatOf(t, "Боря");
    toHand(t, "Боря", his);
    ok(t.act("Боря", { t: "flag", chair: his, flag: "lock", on: true }, 0));
    expect(t.act("Аня", { t: "flip", chair: his }, 0)).toEqual({ refused: "chair-locked" });
  });

  it("без замка — можно: переворот руки открыт всем", () => {
    const t = table("Аня", "Боря");
    const his = seatOf(t, "Боря");
    toHand(t, "Боря", his);
    ok(t.act("Аня", { t: "flip", chair: his }, 0));
  });
});

describe("ФЛАГИ СТУЛА: чей стул, тот и хозяин", () => {
  it("РАСПОРЯДИТЕЛЬ трогает флаги чужого занятого стула, а рядовой игрок — нет", () => {
    // Замок переживает своего хозяина: человек ушёл, стул остался заперт, и разгрести это больше
    // некому. Право на это распорядителю выдано с самого начала (`hand.flags`).
    const t = table("Аня", "Боря", "Витя");
    const his = seatOf(t, "Боря");
    expect("refused" in t.act("Аня", { t: "flag", chair: his, flag: "reject", on: true }, 0), "распорядитель может").toBe(false);
    expect(t.act("Витя", { t: "flag", chair: his, flag: "reject", on: false }, 0), "сосед — нет").toEqual({ refused: "not-yours" });
  });

  it("а СТУЛОМ КРУПЬЕ распоряжается админ — и только он", () => {
    const t = table("Аня", "Боря");
    t.seatCroupier({ ...person("Крупье"), ink: "#fff" });
    const seat = croupierSeat(t);
    ok(t.act("Аня", { t: "flag", chair: seat, flag: "lock", on: true }, 0));
    expect(t.act("Боря", { t: "flag", chair: seat, flag: "lock", on: false }, 0)).toEqual({ refused: "not-yours" });
  });

  it("ЗАМОК НА КРУПЬЕ ЗАПИРАЕТ ЕГО РУКУ ОТ ВСЕХ, включая админа: хозяина у неё нет", () => {
    const t = table("Аня");
    t.seatCroupier({ ...person("Крупье"), ink: "#fff" });
    const seat = croupierSeat(t);
    const card = toHand(t, "Аня", seat);
    ok(t.act("Аня", { t: "flag", chair: seat, flag: "lock", on: true }, 0));
    expect(t.act("Аня", { t: "grab", id: card }, 0)).toEqual({ refused: "chair-locked" });
    ok(t.act("Аня", { t: "flag", chair: seat, flag: "lock", on: false }, 0));
    ok(t.act("Аня", { t: "grab", id: card }, 0));
  });
});
