import { describe, expect, it } from "vitest";
import { KitScene } from "./kitScene";
import type { SceneElement } from "./sceneEngine";
import { PICK_ANY, PICK_FIRST, type PieceDrag, type StackDrag } from "../kit/stackInteraction";

// ГВАРД РАЗВОДА ДРАГА (#116): pieceDrag и stackDrag — ДВА независимых интента, каждый со своим
// триггером (tap/hold). Роутер спрашивает dragOnTap/dragOnHold, что доступно этим жестом, и выбирает
// по жесту — поэтому stackDrag больше НЕ перебивает pieceDrag. Тут проверяем именно доступность
// интентов по жесту (то, что было сломано); сам захват (beginDrag: стек группой vs одиночная карта)
// трогает Pixi и проверяется в браузере.
//
// Таблица владельца (для верхней карты, где pick=first применим):
//   cd tap + sd tap  → tap:стек,  hold:—      (совпали → стек)
//   cd tap + sd hold → tap:карта, hold:стек
//   cd hold+ sd tap  → tap:стек,  hold:карта
//   cd hold+ sd hold → tap:—,     hold:стек   (совпали → стек)

interface Entry {
  ids: string[];
  pieceDrag: PieceDrag | null;
  stackDrag: StackDrag | null;
}

class Probe extends KitScene {
  seed(pieceDrag: PieceDrag | null, stackDrag: StackDrag | null, n = 3): void {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = `c${i}`;
      ids.push(id);
      this.byId.set(id, { id, draggable: true, body: { px: i, py: 0 } } as unknown as SceneElement);
    }
    (this as unknown as { dragStacks: Entry[] }).dragStacks.push({ ids, pieceDrag, stackDrag });
  }

  private el(id: string): SceneElement {
    return this.byId.get(id)!;
  }

  tap(id: string): boolean {
    return this.dragOnTap(this.el(id));
  }
  hold(id: string): boolean {
    return this.dragOnHold(this.el(id));
  }
  draggable(id: string): boolean {
    return this.canDrag(this.el(id));
  }
}

const TOP = "c2"; // верхняя = последняя в порядке; PICK_FIRST применим только к ней
const MID = "c1";

describe("KitScene: доступность драг-интентов по жесту (верхняя карта)", () => {
  it("cd tap + sd tap → тап доступен (совпадут в стек), hold нет", () => {
    const p = new Probe();
    p.seed({ pick: PICK_FIRST, trigger: "tap" }, { trigger: "tap" });
    expect(p.tap(TOP)).toBe(true);
    expect(p.hold(TOP)).toBe(false);
  });

  it("cd tap + sd hold → тап (карта) и hold (стек) оба доступны", () => {
    const p = new Probe();
    p.seed({ pick: PICK_FIRST, trigger: "tap" }, { trigger: "hold" });
    expect(p.tap(TOP)).toBe(true);
    expect(p.hold(TOP)).toBe(true);
  });

  it("cd hold + sd tap → тап (стек) и hold (карта) оба доступны", () => {
    const p = new Probe();
    p.seed({ pick: PICK_FIRST, trigger: "hold" }, { trigger: "tap" });
    expect(p.tap(TOP)).toBe(true);
    expect(p.hold(TOP)).toBe(true);
  });

  it("cd hold + sd hold → тап нет, hold доступен (совпадут в стек)", () => {
    const p = new Probe();
    p.seed({ pick: PICK_FIRST, trigger: "hold" }, { trigger: "hold" });
    expect(p.tap(TOP)).toBe(false);
    expect(p.hold(TOP)).toBe(true);
  });
});

describe("KitScene: только один интент", () => {
  it("только pieceDrag(tap, any) → тап у любой карты, hold нет", () => {
    const p = new Probe();
    p.seed({ pick: PICK_ANY, trigger: "tap" }, null);
    expect(p.tap(MID)).toBe(true);
    expect(p.hold(MID)).toBe(false);
  });

  it("только stackDrag(hold) → hold у любой карты, тап нет", () => {
    const p = new Probe();
    p.seed(null, { trigger: "hold" });
    expect(p.tap(MID)).toBe(false);
    expect(p.hold(MID)).toBe(true);
  });
});

describe("KitScene: pick сужает КАРТОЧНЫЙ интент, но не стековый", () => {
  it("cd(first) + sd(tap): не-верхняя карта тащится ТОЛЬКО как стек (tap), картой — никак", () => {
    const p = new Probe();
    p.seed({ pick: PICK_FIRST, trigger: "hold" }, { trigger: "tap" });
    // не-верхняя: card hold не применим (pick=first), остаётся только stack tap
    expect(p.tap(MID)).toBe(true); // стек
    expect(p.hold(MID)).toBe(false); // карту эту (не верхнюю) hold-ом не взять
    expect(p.draggable(MID)).toBe(true); // но как стек — да
  });

  it("cd(first) без stackDrag: не-верхняя карта не тащится вовсе", () => {
    const p = new Probe();
    p.seed({ pick: PICK_FIRST, trigger: "tap" }, null);
    expect(p.tap(MID)).toBe(false);
    expect(p.hold(MID)).toBe(false);
    expect(p.draggable(MID)).toBe(false);
    expect(p.draggable(TOP)).toBe(true); // верхнюю — да
  });
});
