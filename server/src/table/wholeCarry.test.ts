// СТОПКУ НЕСУТ ЦЕЛИКОМ: остальные видят всю стопку у чужого пальца — со стола (взяли за грип) и бесхозную у пустого стула.

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
const ok = (out: ReturnType<Table["act"]>) => expect("refused" in out ? out.refused : "ok").toBe("ok");
const felt = { in: "felt", x: 1, y: 2, up: false, angle: 90 } as const;
/** Бесхозный стул с картами: третий сел, набрал руку и ушёл — рука осталась у пустого стула. */
const abandoned = (t: Table, n: number) => {
  t.join(person("z"));
  const id = t.layout().chairs.find((c) => c.owner === "z")!.id;
  const ids = stackOn(t, "z", id, n);
  t.leave("z");
  return { id, ids };
};
function stackOn(t: Table, by: string, chair: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const top = t.seenBy(by).piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
    ok(t.act(by, { t: "grab", id: top }, 0));
    ok(t.act(by, { t: "drop", id: top, to: { in: "hand", chair, i: 0 } }, 0));
    out.push(top);
  }
  return out;
}

describe("целая стопка в воздухе", () => {
  it("со стола: взяли за грип — зритель видит всю стопку (верх и остальные), хозяину палец не отдаётся; отпустили — её нет", () => {
    const t = table("a", "b");
    ok(t.act("a", { t: "grip", pile: MAIN_PILE }, 0));
    expect(t.carry("a", { id: MAIN_PILE, over: felt }, 0)).toEqual({ ok: true });
    const [seen] = t.carriesSeenBy("b");
    const size = t.seenBy("b").piles.find((p) => p.id === MAIN_PILE)!.cards.length;
    expect(seen).toMatchObject({ id: MAIN_PILE, by: "a", over: felt, whole: true });
    expect(1 + seen!.with!.length).toBe(size);
    expect(t.carriesSeenBy("a")).toEqual([]);
    ok(t.act("a", { t: "release", id: MAIN_PILE }, 1));
    expect(t.carriesSeenBy("b")).toEqual([]);
  });

  it("со стола: без грипа нести нельзя; чужую, взятую другим, — тоже", () => {
    const t = table("a", "b");
    expect(t.carry("a", { id: MAIN_PILE, over: felt }, 0)).toEqual({ refused: "not-held" });
    ok(t.act("a", { t: "grip", pile: MAIN_PILE }, 0));
    expect(t.carry("b", { id: MAIN_PILE, over: felt }, 0)).toEqual({ refused: "not-held" });
  });

  it("бесхозная у пустого стула: видна зрителю, пока в ней те же карты; разобрали — исчезла; занятый стул не несут", () => {
    const t = table("a", "b");
    const { id: chair, ids } = abandoned(t, 3);
    expect(t.carry("a", { id: `chair:${chair}`, over: felt }, 0)).toEqual({ ok: true });
    const [seen] = t.carriesSeenBy("b");
    expect(seen).toMatchObject({ id: `chair:${chair}`, by: "a", whole: true });
    expect([seen!.with!.map((w) => w.card.id), seen!.card.id].flat().sort()).toEqual([...ids].sort());
    ok(t.act("a", { t: "grab", id: ids[0]! }, 1));
    ok(t.act("a", { t: "drop", id: ids[0]!, to: felt }, 1));
    expect(t.carriesSeenBy("b")).toEqual([]);
    const mine = t.layout().chairs.find((c) => c.owner === "b")!.id;
    expect(t.carry("a", { id: `chair:${mine}`, over: felt }, 2)).toEqual({ refused: "chair-locked" });
  });
});
