import { describe, it, expect } from "vitest";
import { rowAssembly } from "./rowAssembly";

// Раскладка выделенного набора В РЯД при старте драга (issue #56). ОСЬ №2 (геометрия), отдельная
// от порядка (collectOrder). Чистая: по уже упорядоченным id даёт offset каждой карты ОТ курсора,
// ряд центрирован на курсоре, одна строка (dy=0), шаг = ширина карты + зазор. Возвращает offsets,
// выровненные по входному порядку (индекс в индекс — так их и ждёт GroupDrag).

describe("rowAssembly", () => {
  it("три карты: центрированный ряд, шаг = cardW+gap, dy=0", () => {
    const off = rowAssembly(["a", "b", "c"], 100, 20); // step 120
    expect(off).toEqual([
      { id: "a", dx: -120, dy: 0 },
      { id: "b", dx: 0, dy: 0 },
      { id: "c", dx: 120, dy: 0 },
    ]);
  });

  it("две карты: симметрично вокруг курсора (±step/2)", () => {
    const off = rowAssembly(["l", "r"], 100, 20);
    expect(off).toEqual([
      { id: "l", dx: -60, dy: 0 },
      { id: "r", dx: 60, dy: 0 },
    ]);
  });

  it("одна карта: точно под курсором", () => {
    expect(rowAssembly(["solo"], 80, 10)).toEqual([{ id: "solo", dx: 0, dy: 0 }]);
  });

  it("порядок id сохраняется индекс-в-индекс (слева направо)", () => {
    const off = rowAssembly(["x", "y", "z", "w"], 50, 0);
    expect(off.map((o) => o.id)).toEqual(["x", "y", "z", "w"]);
    expect(off.map((o) => o.dx)).toEqual([-75, -25, 25, 75]); // step 50, центрировано
  });

  it("пустой набор → пусто", () => {
    expect(rowAssembly([], 100, 20)).toEqual([]);
  });
});
