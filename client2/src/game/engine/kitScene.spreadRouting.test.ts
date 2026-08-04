import { describe, expect, it } from "vitest";
import { KitScene } from "./kitScene";
import { SceneEngine, type SceneElement, type SpreadSource } from "./sceneEngine";
import { SPREAD_STATE0, type SpreadConfig, type SpreadState } from "../kit/stackInteraction";
import type { StackOffset } from "../kit/stackLayout";

// ГВАРД РОУТИНГА СПРЕДА (#116): спред двигает ЖЕСТ, а РЕАГИРУЕТ ли стек на конкретный жест — решает
// его конфиг (spread.pointerTrigger / spread.touchTrigger). Один шов spreadOnElement(cp, dGap,
// source): source ∈ {touch-zoom, pointer-zoom, pointer-pan}. Не тот жест для этого стека → false, и
// он целиком уходит камере. Матчасть/детент считаются одинаково независимо от устройства.
//
// Маршрут «событие колеса/пинча → source» живёт в sceneEngine (нужен DOM/app) и проверяется в
// браузере; здесь — сам шов на голом инстансе (new KitScene() не поднимает Pixi, spreadStackAt
// читает у элемента лишь id + body.px/py — тот же приём, что у остальных юнитов движка).

const CFG: SpreadConfig = {
  pointerTrigger: "zoom",
  touchTrigger: "zoom",
  maxGap: 40,
  keepDiagonal: true,
  centerX: false,
  close: { kind: "infinite" },
  spring: 12,
};

interface Entry {
  ids: string[];
  at: { x: number; y: number };
  layout: () => StackOffset;
  cell: { w: number; h: number };
  cfg: SpreadConfig;
  state: SpreadState;
}

/** Витрина с одной картой в (0,0) и спред-записью над ней; роут-метод открыт для вызова. */
class Probe extends KitScene {
  readonly at = { x: 0, y: 0 };

  seed(cfgOver: Partial<SpreadConfig> = {}): void {
    const el = { id: "c0", body: { px: 0, py: 0 } } as unknown as SceneElement;
    this.byId.set("c0", el);
    this.entries().push({ ids: ["c0"], at: { x: 0, y: 0 }, layout: () => ({ dx: 0, dy: 0, rot: 0 }), cell: { w: 60, h: 90 }, cfg: { ...CFG, ...cfgOver }, state: { ...SPREAD_STATE0 } });
  }

  target(): number {
    return this.entries()[0]!.state.target;
  }

  setTarget(v: number): void {
    this.entries()[0]!.state = { ...this.entries()[0]!.state, target: v, amount: v };
  }

  begin(): void {
    this.onSpreadBegin();
  }

  spread(dGap: number, source: SpreadSource): boolean {
    return this.spreadOnElement(this.at, dGap, source);
  }

  private entries(): Entry[] {
    return (this as unknown as { spreadStacks: Entry[] }).spreadStacks;
  }
}

describe("KitScene: роут спреда по source и триггеру стека", () => {
  it("KitScene ПЕРЕопределяет spreadOnElement — иначе спред никогда не тронуть", () => {
    expect(KitScene.prototype["spreadOnElement"]).not.toBe(SceneEngine.prototype["spreadOnElement"]);
  });

  it("нет стека под точкой → false (жест уходит камере)", () => {
    const p = new Probe(); // без seed — реестр пуст
    expect(p.spread(20, "touch-zoom")).toBe(false);
  });

  it("touchTrigger==='zoom': тач-пинч раздвигает, обычное колесо (pointer-pan) — нет", () => {
    const p = new Probe();
    p.seed({ touchTrigger: "zoom", pointerTrigger: "zoom" });
    expect(p.spread(20, "touch-zoom")).toBe(true);
    expect(p.target()).toBeGreaterThan(0);
    p.setTarget(0);
    expect(p.spread(20, "pointer-pan")).toBe(false); // pointerTrigger не 'pan' — колесо мимо спреда
    expect(p.target()).toBe(0);
  });

  it("touchTrigger===false: тач-пинч спред НЕ трогает (уходит в зум камеры)", () => {
    const p = new Probe();
    p.seed({ touchTrigger: false });
    expect(p.spread(20, "touch-zoom")).toBe(false);
    expect(p.target()).toBe(0);
  });

  it("pointerTrigger==='zoom': десктоп-зум раздвигает, обычное колесо — нет", () => {
    const p = new Probe();
    p.seed({ pointerTrigger: "zoom" });
    expect(p.spread(20, "pointer-zoom")).toBe(true);
    p.setTarget(0);
    expect(p.spread(20, "pointer-pan")).toBe(false);
  });

  it("pointerTrigger==='pan': обычное колесо раздвигает, десктоп-зум — нет", () => {
    const p = new Probe();
    p.seed({ pointerTrigger: "pan" });
    expect(p.spread(20, "pointer-pan")).toBe(true);
    p.setTarget(0);
    expect(p.spread(20, "pointer-zoom")).toBe(false); // зум-жест уходит в зум камеры
  });

  it("pointerTrigger===false: ни зум, ни колесо спред не трогают", () => {
    const p = new Probe();
    p.seed({ pointerTrigger: false });
    expect(p.spread(20, "pointer-zoom")).toBe(false);
    expect(p.spread(20, "pointer-pan")).toBe(false);
    expect(p.target()).toBe(0);
  });
});

// СПРЕД — ВНУТРЕННИЙ слой, камера — ВНЕШНИЙ. На пределе спреда (target упёрся в 0/maxGap и жест
// давит дальше в ту же сторону) spreadOnElement возвращает false — жест уходит камере.
describe("KitScene: на пределе спреда жест отдаётся камере", () => {
  it("полностью раскрыт (maxGap) + открывание → НЕ перехвачено", () => {
    const p = new Probe();
    p.seed();
    p.setTarget(CFG.maxGap);
    expect(p.spread(20, "pointer-zoom")).toBe(false);
    expect(p.target()).toBe(CFG.maxGap);
  });

  it("сомкнут (0) + закрывание → НЕ перехвачено, спред не уходит в минус", () => {
    const p = new Probe();
    p.seed();
    expect(p.spread(-20, "pointer-zoom")).toBe(false);
    expect(p.target()).toBe(0);
  });

  it("обратный жест сразу ведёт спред: раскрыт + закрывание → перехвачено", () => {
    const p = new Probe();
    p.seed();
    p.setTarget(CFG.maxGap);
    expect(p.spread(-20, "pointer-zoom")).toBe(true);
    expect(p.target()).toBeLessThan(CFG.maxGap);
  });
});

// ДЕТЕНТ: жест, который сам наполнил спред, на пределе ОСТАНАВЛИВАЕТСЯ (не отдаёт камере) — чтобы
// почувствовать лимит. Камеру активирует лишь СЛЕДУЮЩИЙ жест, начатый уже на пределе. Одинаково для
// тач-пинча и колеса — проверяем на pointer-zoom (маршрут колеса), логика от source не зависит.
describe("KitScene: детент на пределе — камера отдельным жестом", () => {
  it("жест, наполнивший спред, на пределе ГЛОТАЕТ жест (true), а не отдаёт камере", () => {
    const p = new Probe();
    p.seed();
    p.begin();
    for (let i = 0; i < 10; i++) p.spread(20, "pointer-zoom"); // за один жест наполняем до предела
    expect(p.target()).toBe(CFG.maxGap);
    expect(p.spread(20, "pointer-zoom")).toBe(true); // дальше в тот же жест — детент
  });

  it("СЛЕДУЮЩИЙ жест, начатый на пределе, отдаётся камере (false)", () => {
    const p = new Probe();
    p.seed();
    p.begin();
    for (let i = 0; i < 10; i++) p.spread(20, "pointer-zoom"); // наполнили + детент
    p.begin(); // палец отпущен / пауза у колеса — новый жест
    expect(p.spread(20, "pointer-zoom")).toBe(false);
    expect(p.target()).toBe(CFG.maxGap);
  });

  it("детент НЕ мешает реверсу в том же жесте: с предела закрывание ведёт спред", () => {
    const p = new Probe();
    p.seed();
    p.begin();
    for (let i = 0; i < 10; i++) p.spread(20, "pointer-zoom");
    expect(p.spread(-20, "pointer-zoom")).toBe(true);
    expect(p.target()).toBeLessThan(CFG.maxGap);
  });
});
