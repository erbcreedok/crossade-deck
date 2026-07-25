import { describe, it, expect, vi } from "vitest";
import { SingleDrag, GroupDrag, type DragContext } from "./drag";
import type { TableElement } from "./element";

// Фейковый элемент: тело с записью setTarget, опциональные способности flip/burn.
function elem(id: string, opts: { flip?: boolean; burn?: boolean; burning?: boolean } = {}): TableElement {
  const targets: unknown[] = [];
  const el: Record<string, unknown> = {
    id,
    root: { zIndex: 0 },
    body: { px: 10, py: 20, targets, setTarget: (t: unknown) => targets.push(t), snapTo: () => {} },
    state: "idle",
    setState() {},
    shadowRect: null,
    resting: true,
    dead: false,
    step() {},
    sync() {},
  };
  if (opts.flip) el.requestFlip = vi.fn(() => true);
  if (opts.burn) {
    el.burn = vi.fn();
    Object.defineProperty(el, "burning", { get: () => !!opts.burning });
  }
  return el as unknown as TableElement;
}

function ctx() {
  const raised: string[] = [];
  const homed: string[] = [];
  const c: DragContext = { raise: (e) => raised.push(e.id), returnHome: (e) => homed.push(e.id) };
  return { c, raised, homed };
}

describe("SingleDrag", () => {
  it("на захвате поднимается; move ведёт по offset; release возвращает домой", () => {
    const { c, raised, homed } = ctx();
    const el = elem("A");
    const d = new SingleDrag(el, c, { x: 0, y: 0 }); // off = (10,20)
    expect(raised).toEqual(["A"]);
    d.move({ x: 100, y: 100 });
    expect((el.body as unknown as { targets: { x: number; y: number }[] }).targets.at(-1)).toMatchObject({ x: 110, y: 120 });
    d.release();
    expect(homed).toEqual(["A"]);
  });

  it("способности: flip/burn есть только если элемент их реализует", () => {
    const { c } = ctx();
    const plain = new SingleDrag(elem("p"), c, { x: 0, y: 0 });
    expect(plain.flip).toBeUndefined();
    expect(plain.burn).toBeUndefined();

    const rich = new SingleDrag(elem("r", { flip: true, burn: true }), c, { x: 0, y: 0 });
    expect(rich.flip).toBeTypeOf("function");
    expect(rich.burn).toBeTypeOf("function");
  });

  it("consumed = горит ли элемент", () => {
    const { c } = ctx();
    expect(new SingleDrag(elem("a", { burn: true, burning: false }), c, { x: 0, y: 0 }).consumed).toBe(false);
    expect(new SingleDrag(elem("b", { burn: true, burning: true }), c, { x: 0, y: 0 }).consumed).toBe(true);
  });
});

describe("GroupDrag", () => {
  it("поднимает все, лид — верхняя (последняя)", () => {
    const { c, raised } = ctx();
    const els = [elem("0"), elem("1"), elem("2")];
    const d = new GroupDrag(els, [{ dx: 0, dy: 0 }, { dx: 5, dy: 0 }, { dx: 10, dy: 0 }], c);
    expect(raised).toEqual(["0", "1", "2"]);
    expect(d.lead.id).toBe("2");
    expect(els[2]!.root.zIndex).toBeGreaterThan(els[0]!.root.zIndex); // порядок сохранён
  });

  it("move двигает все по своим сдвигам; release возвращает всех", () => {
    const { c, homed } = ctx();
    const els = [elem("0"), elem("1")];
    const d = new GroupDrag(els, [{ dx: -3, dy: 0 }, { dx: 3, dy: 0 }], c);
    d.move({ x: 100, y: 50 });
    expect((els[0]!.body as unknown as { targets: { x: number }[] }).targets.at(-1)).toMatchObject({ x: 97 });
    expect((els[1]!.body as unknown as { targets: { x: number }[] }).targets.at(-1)).toMatchObject({ x: 103 });
    d.release();
    expect(homed).toEqual(["0", "1"]);
  });
});
