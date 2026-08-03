import { describe, it, expect } from "vitest";
import { resolveDrop, type DropCandidate } from "./dropResolve";

// EC1: из целей, что накрыли точку И принимают груз, побеждает по priority → вложенность (глубже
// = специфичнее) → z. accepts=false = ПРОЗРАЧНОСТЬ (проваливаемся дальше). Чистая функция.
type P = { kind: string };
const rect = (x: number, y: number, w: number, h: number) => (px: number, py: number) => px >= x && px <= x + w && py >= y && py <= y + h;

const cand = (id: string, o: Partial<DropCandidate<P>> & { depth: number }): DropCandidate<P> => ({
  id,
  contains: rect(0, 0, 100, 100),
  accepts: () => true,
  ...o,
});

describe("resolveDrop (EC1)", () => {
  const payload: P = { kind: "card" };

  it("внутреннее (глубже) побеждает внешнее среди накрывших+принявших", () => {
    const board = cand("board", { depth: 0 });
    const slot = cand("slot", { depth: 1 });
    const stack = cand("stack", { depth: 2 });
    expect(resolveDrop([board, slot, stack], 50, 50, payload)!.id).toBe("stack");
  });

  it("accepts=false — ПРОЗРАЧНОСТЬ: цель выпадает, палец проваливается на следующую", () => {
    const zone = cand("zone", { depth: 2, accepts: () => false }); // самая глубокая, но не берёт
    const slot = cand("slot", { depth: 1 });
    expect(resolveDrop([zone, slot], 50, 50, payload)!.id).toBe("slot");
  });

  it("priority перебивает вложенность", () => {
    const slot = cand("slot", { depth: 1 });
    const zone = cand("zone", { depth: 0, priority: 10 }); // внешняя, но приоритетнее
    expect(resolveDrop([slot, zone], 50, 50, payload)!.id).toBe("zone");
  });

  it("z — тайбрейк при равных priority и depth", () => {
    const a = cand("a", { depth: 1, z: 1 });
    const b = cand("b", { depth: 1, z: 5 });
    expect(resolveDrop([a, b], 50, 50, payload)!.id).toBe("b");
  });

  it("не накрыли / никто не принял → null", () => {
    const far = cand("far", { depth: 1, contains: rect(500, 500, 10, 10) });
    expect(resolveDrop([far], 50, 50, payload)).toBeNull();
    const rejectAll = cand("rej", { depth: 1, accepts: () => false });
    expect(resolveDrop([rejectAll], 50, 50, payload)).toBeNull();
  });
});
