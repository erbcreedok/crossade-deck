// СИЛЬНЫЙ БРОСОК — карта из руки летит на стол с ударом у всех. Стол помечает это в СЛЕДЕ карты:
// звук и удар каждый экран выводит из кадра, а не из операций, и пометка обязана быть в самом кадре.

import { describe, expect, it } from "vitest";
import type { Person } from "./contract.js";
import { readIntent } from "./intent.js";
import { Table } from "./table.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const cards = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, face: { rank: String(i + 6), suit: "s" as const } }));
const ok = (r: ReturnType<Table["act"]>) => {
  if ("refused" in r) throw new Error(`refused: ${r.refused}`);
  return r.ops;
};

/** Аня за столом, одна карта у неё в руке. */
function withCard() {
  const t = new Table(cards, "Аня");
  t.join(person("Аня"));
  t.join(person("Боря"));
  const seat = t.seenBy("Аня").people.find((p) => p.key === "Аня")!.seat!;
  const top = t.seenBy("Аня").piles[0]!.cards.at(-1)!.id;
  ok(t.act("Аня", { t: "grab", id: top }, 0));
  ok(t.act("Аня", { t: "drop", id: top, to: { in: "hand", chair: seat, i: 0 } }, 0));
  return { t, seat, id: top };
}
const trailSeenBy = (t: Table, viewer: string, id: string) => t.seenBy(viewer).trails[id];

describe("throw.marks-the-trail", () => {
  it("бросок из руки на сукно помечен в следе — и его видит сосед", () => {
    const { t, id } = withCard();
    ok(t.act("Аня", { t: "grab", id }, 0));
    ok(t.act("Аня", { t: "drop", id, to: { in: "felt", x: 1, y: -2, up: true, angle: 0 }, throw: true }, 1));
    expect(trailSeenBy(t, "Боря", id)?.thrown, "у соседа").toBe(true);
    expect(t.seenBy("Боря").felt.some((f) => f.id === id), "карта на сукне").toBe(true);
  });

  it("обычный перенос следа броска не несёт — даже после броска той же карты", () => {
    const { t, id } = withCard();
    ok(t.act("Аня", { t: "grab", id }, 0));
    ok(t.act("Аня", { t: "drop", id, to: { in: "felt", x: 1, y: -2, up: true, angle: 0 }, throw: true }, 1));
    // Сдвинули по сукну — это не бросок: иначе карта «шлёпнула» бы у всех ещё раз.
    ok(t.act("Аня", { t: "grab", id }, 2));
    ok(t.act("Аня", { t: "drop", id, to: { in: "felt", x: 2, y: -1, up: true, angle: 0 } }, 3));
    expect(trailSeenBy(t, "Боря", id)?.thrown).toBeUndefined();
  });

  it("бросать можно только из руки: с сукна и из колоды пометки нет", () => {
    const t = new Table(cards, "Аня");
    t.join(person("Аня"));
    const top = t.seenBy("Аня").piles[0]!.cards.at(-1)!.id;
    ok(t.act("Аня", { t: "grab", id: top }, 0));
    ok(t.act("Аня", { t: "drop", id: top, to: { in: "felt", x: 0, y: 0, up: true, angle: 0 }, throw: true }, 1));
    expect(trailSeenBy(t, "Аня", top)?.thrown, "из колоды").toBeUndefined();
  });

  it("в руку не бросают: карта, брошенная в стул, ложится без пометки", () => {
    const { t, id } = withCard();
    const other = t.seenBy("Боря").people.find((p) => p.key === "Боря")!.seat!;
    ok(t.act("Аня", { t: "grab", id }, 0));
    ok(t.act("Аня", { t: "drop", id, to: { in: "hand", chair: other, i: 0 }, throw: true }, 1));
    expect(trailSeenBy(t, "Боря", id)?.thrown).toBeUndefined();
  });
});

describe("throw.the-wire-carries-it", () => {
  it("провод пропускает флаг броска, и только как true", () => {
    const to = { in: "felt", x: 1, y: 1, up: true, angle: 0 };
    expect(readIntent({ t: "drop", id: "c1", to, throw: true })).toMatchObject({ throw: true });
    expect(readIntent({ t: "drop", id: "c1", to, throw: "да" })).not.toHaveProperty("throw");
    expect(readIntent({ t: "drop", id: "c1", to })).not.toHaveProperty("throw");
  });
});
