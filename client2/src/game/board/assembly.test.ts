import { describe, expect, it } from "vitest";
import type { CollectItem } from "./collectOrder";
import { ASSEMBLY_PRESETS, assemble, formOffsets, orderItems, type AssemblyConfig } from "./assembly";

// набор: пресс-порядок 0..3, разные лица и позиции
const items: CollectItem[] = [
  { id: "a", press: 0, x: 100, y: 10, face: "10♠" }, // rank 10, ♠
  { id: "b", press: 1, x: 30, y: 10, face: "6♣" }, // rank 6, ♣
  { id: "c", press: 2, x: 60, y: 60, face: "8♥" }, // rank 8, ♥
  { id: "d", press: 3, x: 200, y: 10, face: "A♦" }, // rank 14, ♦
];

describe("orderItems — естественный слой", () => {
  it("selection = по нажатию", () => {
    expect(orderItems(items, "selection", "none")).toEqual(["a", "b", "c", "d"]);
  });
  it("append = тоже по нажатию", () => {
    expect(orderItems(items, "append", "none")).toEqual(["a", "b", "c", "d"]);
  });
  it("proximity = reading-order (строка y, затем столбец x)", () => {
    // y=10: b(x30), a(x100), d(x200); затем y=60: c
    expect(orderItems(items, "proximity", "none")).toEqual(["b", "a", "d", "c"]);
  });
});

describe("orderItems — override ПОВЕРХ естественного", () => {
  it("rank перебивает и сортирует по номиналу", () => {
    expect(orderItems(items, "selection", "rank")).toEqual(["b", "c", "a", "d"]); // 6,8,10,14
  });
  it("suit перебивает: ♣<♦<♥<♠", () => {
    expect(orderItems(items, "selection", "suit")).toEqual(["b", "d", "c", "a"]);
  });
  it("override устойчив: равные ключи сохраняют естественный порядок", () => {
    const same: CollectItem[] = [
      { id: "x", press: 0, x: 0, y: 0, face: "7♣" },
      { id: "y", press: 1, x: 0, y: 0, face: "7♠" },
      { id: "z", press: 2, x: 0, y: 0, face: "7♥" },
    ];
    // rank одинаков (7) → порядок остаётся естественным (по нажатию)
    expect(orderItems(same, "selection", "rank")).toEqual(["x", "y", "z"]);
  });
  it("center: пирамида по рангу — старшая в центр, младшие к краям", () => {
    // ранги 6,8,10,A(14); asc = b,c,a,d → пик d в середине, вниз к краям
    expect(orderItems(items, "selection", "center")).toEqual(["b", "a", "d", "c"]);
  });
  it("center нечётный: пик ровно по центру", () => {
    const three: CollectItem[] = [
      { id: "x", press: 0, x: 0, y: 0, face: "6♣" },
      { id: "y", press: 1, x: 0, y: 0, face: "10♣" },
      { id: "z", press: 2, x: 0, y: 0, face: "8♣" },
    ];
    // asc 6,8,10 → [6,10,8]: пик 10 в центре
    expect(orderItems(three, "selection", "center")).toEqual(["x", "y", "z"]);
  });
  it("center читается как «гора»: ранги нарастают к центру и спадают", () => {
    const five: CollectItem[] = [2, 4, 6, 8, 10].map((r, i) => ({ id: `c${r}`, press: i, x: 0, y: 0, face: `${r}♣` }));
    const ranks = orderItems(five, "selection", "center").map((id) => Number(id.slice(1)));
    const peak = ranks.indexOf(Math.max(...ranks));
    for (let i = 1; i <= peak; i++) expect(ranks[i]).toBeGreaterThan(ranks[i - 1]!);
    for (let i = peak + 1; i < ranks.length; i++) expect(ranks[i]).toBeLessThan(ranks[i - 1]!);
  });
});

describe("formOffsets — геометрия", () => {
  it("row: один ряд (dy=0), центрирован на курсоре", () => {
    const off = formOffsets(["a", "b", "c"], "row", 100);
    expect(off.every((o) => o.dy === 0)).toBe(true);
    expect(off[0]!.dx).toBeLessThan(0);
    expect(off[2]!.dx).toBeGreaterThan(0);
    expect(off[0]!.dx + off[2]!.dx).toBeCloseTo(0); // симметрия
  });
  it("stack-tight: близко, лёгкий сдвиг вверх (dy<0)", () => {
    const off = formOffsets(["a", "b"], "stack-tight", 100);
    expect(off[0]!.dx).toBe(0);
    expect(off[1]!.dy).toBeLessThan(0);
    expect(Math.abs(off[1]!.dy)).toBeLessThan(20); // тонкая
  });
  it("stack-open: заметный сдвиг ВНИЗ (нижние выглядывают)", () => {
    const off = formOffsets(["a", "b"], "stack-open", 100);
    expect(off[1]!.dy).toBeGreaterThan(0);
    expect(off[1]!.dy).toBeGreaterThan(formOffsets(["a", "b"], "stack-tight", 100)[1]!.dy);
  });
  it("fan делегирует fanAssembly: карты наклонены (rot ≠ 0 на краях)", () => {
    const off = formOffsets(["a", "b", "c"], "fan", 100);
    expect(off[0]!.rot).toBeLessThan(0);
    expect(off[2]!.rot).toBeGreaterThan(0);
    expect(off[1]!.rot).toBeCloseTo(0, 6);
  });
  it("offsets индекс-в-индекс с порядком", () => {
    const off = formOffsets(["a", "b", "c"], "row", 100);
    expect(off.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });
});

describe("assemble — order+override → форма", () => {
  it("sorted-row: по рангу в ряд", () => {
    const { orderedIds, offsets } = assemble(items, ASSEMBLY_PRESETS["sorted-row"]!, 100);
    expect(orderedIds).toEqual(["b", "c", "a", "d"]);
    expect(offsets.every((o) => o.dy === 0)).toBe(true);
    expect(offsets.map((o) => o.id)).toEqual(orderedIds);
  });
  it("grab-to-hand (дефолт): proximity + сжатая стопка", () => {
    const { orderedIds } = assemble(items, ASSEMBLY_PRESETS["grab-to-hand"]!, 100);
    expect(orderedIds).toEqual(["b", "a", "d", "c"]); // reading-order
  });
});

describe("ASSEMBLY_PRESETS", () => {
  it("все пресеты — валидные конфиги (полный набор рычагов)", () => {
    for (const [name, cfg] of Object.entries(ASSEMBLY_PRESETS)) {
      const c = cfg as AssemblyConfig;
      expect(c.gatherOn, name).toBeTruthy();
      expect(c.anchor, name).toBeTruthy();
      expect(c.form, name).toBeTruthy();
      expect(c.order, name).toBeTruthy();
      expect(c.sortOverride, name).toBeTruthy();
    }
  });
  it("пресеты РАЗНООБРАЗНЫ (не копии): ≥4 разных форм и оба override-состояния", () => {
    const forms = new Set(Object.values(ASSEMBLY_PRESETS).map((c) => c.form));
    expect(forms.size).toBeGreaterThanOrEqual(4);
    const overrides = new Set(Object.values(ASSEMBLY_PRESETS).map((c) => c.sortOverride));
    expect(overrides.has("none")).toBe(true);
    expect(overrides.has("rank")).toBe(true);
  });
});
