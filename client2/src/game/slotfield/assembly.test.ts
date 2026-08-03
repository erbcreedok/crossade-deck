import { describe, expect, it } from "vitest";
import type { CollectItem } from "./collectOrder";
import {
  ASSEMBLY_PRESETS,
  anchorIndexFor,
  assemble,
  formOffsets,
  isValidGatherAnchor,
  orderItems,
  reanchorOffsets,
  validAnchorsFor,
  type AssemblyConfig,
} from "./assembly";

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

describe("isValidGatherAnchor — валидность связки gatherOn/anchor (§4.C)", () => {
  it("finger валиден ТОЛЬКО при drag-start", () => {
    expect(isValidGatherAnchor("drag-start", "finger")).toBe(true);
    expect(isValidGatherAnchor("select-each", "finger")).toBe(false);
    expect(isValidGatherAnchor("select-first", "finger")).toBe(false);
    expect(isValidGatherAnchor("never", "finger")).toBe(false);
  });
  it("first/latest/zone валидны при select-*", () => {
    for (const anchor of ["first", "latest", "zone"] as const) {
      expect(isValidGatherAnchor("select-each", anchor)).toBe(true);
      expect(isValidGatherAnchor("select-first", anchor)).toBe(true);
    }
  });
  it("drag-start допускает и first/latest/zone (finger — не единственный вариант)", () => {
    for (const anchor of ["first", "latest", "zone"] as const) {
      expect(isValidGatherAnchor("drag-start", anchor)).toBe(true);
    }
  });
  it("все пресеты (§5) — валидные связки", () => {
    for (const [name, cfg] of Object.entries(ASSEMBLY_PRESETS)) {
      expect(isValidGatherAnchor(cfg.gatherOn, cfg.anchor), name).toBe(true);
    }
  });
  it("validAnchorsFor перечисляет допустимые якоря для gatherOn", () => {
    expect(validAnchorsFor("drag-start")).toEqual(["finger", "first", "latest", "zone"]);
    expect(validAnchorsFor("select-each")).toEqual(["first", "latest", "zone"]);
    expect(validAnchorsFor("select-first")).toEqual(["first", "latest", "zone"]);
    expect(validAnchorsFor("never")).toEqual(["first", "latest", "zone"]);
  });
});

// ——— issue #74: gather-на-селект (select-each), анимация подстановки ———

describe("anchorIndexFor — индекс якоря в упорядоченном наборе", () => {
  it("first → всегда индекс 0", () => {
    expect(anchorIndexFor("first", 1)).toBe(0);
    expect(anchorIndexFor("first", 4)).toBe(0);
  });
  it("latest → последний индекс (растёт со стопкой)", () => {
    expect(anchorIndexFor("latest", 1)).toBe(0);
    expect(anchorIndexFor("latest", 4)).toBe(3);
  });
  it("finger/zone (не участвуют в select-each) — падают на 0, не бросают", () => {
    expect(anchorIndexFor("finger", 4)).toBe(0);
    expect(anchorIndexFor("zone", 4)).toBe(0);
  });
  it("пустой набор → 0 (защита от отрицательного индекса)", () => {
    expect(anchorIndexFor("latest", 0)).toBe(0);
  });
});

describe("reanchorOffsets — переносит нулевую точку на якорный индекс", () => {
  const off = formOffsets(["a", "b", "c", "d"], "stack-tight", 100);

  it("anchorIndex=0 — не меняет офсеты (уже относительно первого)", () => {
    const re = reanchorOffsets(off, 0);
    re.forEach((o, i) => {
      expect(o.dx).toBeCloseTo(off[i]!.dx);
      expect(o.dy).toBeCloseTo(off[i]!.dy);
      expect(o.id).toBe(off[i]!.id);
    });
  });
  it("anchorIndex=last — якорная карта встаёт в (0,0), остальные — относительно неё", () => {
    const re = reanchorOffsets(off, 3);
    expect(re[3]!.dx).toBe(0);
    expect(re[3]!.dy).toBe(0);
    // расстояния между соседями сохраняются (жёсткое смещение всего набора)
    for (let i = 0; i < off.length; i++) {
      expect(re[i]!.dx).toBeCloseTo(off[i]!.dx - off[3]!.dx);
      expect(re[i]!.dy).toBeCloseTo(off[i]!.dy - off[3]!.dy);
    }
  });
  it("сохраняет id и rot (веер) при переносе", () => {
    const fan = formOffsets(["a", "b", "c"], "fan", 100);
    const re = reanchorOffsets(fan, 2);
    expect(re.map((o) => o.id)).toEqual(["a", "b", "c"]);
    expect(re[2]!.rot).toBeCloseTo(fan[2]!.rot ?? 0);
  });
  it("не мутирует вход", () => {
    const before = off.map((o) => ({ ...o }));
    reanchorOffsets(off, 2);
    expect(off).toEqual(before);
  });
});

describe("именованные пресеты трёх схем (issue #74)", () => {
  it("drag-start === grab-to-hand (дефолт, поведение не меняется)", () => {
    expect(ASSEMBLY_PRESETS["drag-start"]).toEqual(ASSEMBLY_PRESETS["grab-to-hand"]);
  });
  it("follow-first: select-each + anchor=first", () => {
    const c = ASSEMBLY_PRESETS["follow-first"]!;
    expect(c.gatherOn).toBe("select-each");
    expect(c.anchor).toBe("first");
  });
  it("follow-last: select-each + anchor=latest", () => {
    const c = ASSEMBLY_PRESETS["follow-last"]!;
    expect(c.gatherOn).toBe("select-each");
    expect(c.anchor).toBe("latest");
  });
  it("все три — валидные связки gatherOn/anchor", () => {
    for (const name of ["drag-start", "follow-first", "follow-last"] as const) {
      const c = ASSEMBLY_PRESETS[name]!;
      expect(isValidGatherAnchor(c.gatherOn, c.anchor), name).toBe(true);
    }
  });
});
