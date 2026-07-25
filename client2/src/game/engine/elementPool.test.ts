import { describe, expect, it } from "vitest";
import { ElementPool, type Slot } from "./elementPool";
import type { CardTargets } from "../CardBody";

// Фейковый визуал: нужен только body (пружина). id держим для проверок. Без Pixi.
type V = { id: string; body: { snaps: CardTargets[]; targets: CardTargets[]; snapTo(t: CardTargets): void; setTarget(t: CardTargets): void } };
function fakeVisual(id: string): V {
  const body = {
    snaps: [] as CardTargets[],
    targets: [] as CardTargets[],
    snapTo(t: CardTargets) {
      this.snaps.push(t);
    },
    setTarget(t: CardTargets) {
      this.targets.push(t);
    },
  };
  return { id, body } as unknown as V;
}

function anchor(slot: Slot): CardTargets {
  const bx: Record<string, number> = { deck: 0, hand: 100, discard: 200 };
  return { x: bx[slot.box] ?? 300, y: slot.within, rot: 0, scale: 1 };
}

function makePool() {
  const created: string[] = [];
  const entered: string[] = [];
  const placed: string[] = [];
  const left: string[] = [];
  const pool = new ElementPool<V>({
    create: (id) => {
      created.push(id);
      return fakeVisual(id);
    },
    anchor,
    onEnter: (_v, s) => entered.push(`${s.id}@${s.box}`),
    onPlace: (_v, s) => placed.push(`${s.id}@${s.box}`),
    onLeave: (_v, id) => left.push(id),
  });
  return { pool, created, entered, placed, left };
}

const slot = (id: string, box: string, within = 0): Slot => ({ id, box, within });

describe("ElementPool", () => {
  it("новый элемент создаётся, встаёт у якоря и летит в слот", () => {
    const { pool, created, entered } = makePool();
    pool.apply([slot("A♠", "deck")]);
    expect(created).toEqual(["A♠"]);
    expect(entered).toEqual(["A♠@deck"]);
    const v = pool.get("A♠")!;
    expect(v.body.snaps).toHaveLength(1);
    expect(v.body.targets.at(-1)).toMatchObject({ x: 0 });
  });

  it("переход бокс→бокс СОХРАНЯЕТ визуал, create не зовётся снова", () => {
    const { pool, created, placed } = makePool();
    pool.apply([slot("A♠", "deck")]);
    const same = pool.get("A♠");
    pool.apply([slot("A♠", "hand")]);
    expect(created).toEqual(["A♠"]);
    expect(pool.get("A♠")).toBe(same);
    expect(placed).toEqual(["A♠@hand"]);
    expect(same!.body.targets.at(-1)).toMatchObject({ x: 100 });
  });

  it("исчезнувший элемент уходит через onLeave и вычищается", () => {
    const { pool, left } = makePool();
    pool.apply([slot("A♠", "deck"), slot("K♥", "deck", 1)]);
    pool.apply([slot("A♠", "deck")]);
    expect(left).toEqual(["K♥"]);
    expect(pool.has("K♥")).toBe(false);
    expect(pool.size).toBe(1);
  });

  it("inBox отдаёт элементы бокса по порядку within", () => {
    const { pool } = makePool();
    pool.apply([slot("A♠", "play:0", 1), slot("K♥", "play:0", 0), slot("Q♦", "hand", 0)]);
    expect(pool.inBox("play:0").map((v) => v.id)).toEqual(["K♥", "A♠"]);
    expect(pool.inBox("hand").map((v) => v.id)).toEqual(["Q♦"]);
  });

  it("apply возвращает entered/moved(from→to)/left", () => {
    const { pool } = makePool();
    pool.apply([slot("A♠", "deck"), slot("K♥", "deck", 1)]);
    const r = pool.apply([slot("A♠", "hand"), slot("Q♦", "deck")]);
    expect(r.entered).toEqual(["Q♦"]);
    expect(r.moved).toEqual([{ id: "A♠", from: "deck", to: "hand" }]);
    expect(r.left).toEqual(["K♥"]);
  });

  it("clear отпускает пул", () => {
    const { pool } = makePool();
    pool.apply([slot("A♠", "deck")]);
    pool.clear();
    expect(pool.size).toBe(0);
    expect(pool.slots).toEqual([]);
  });
});
