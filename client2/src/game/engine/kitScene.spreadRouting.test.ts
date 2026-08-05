import { describe, expect, it } from "vitest";
import { KitScene } from "./kitScene";
import type { SpreadEntry } from "./kitSpread";
import { SceneEngine, type SceneElement, type SpreadSource } from "./sceneEngine";
import { SPREAD_STATE0, type SpreadConfig, type SpreadInput } from "../kit/stackInteraction";

// ГВАРД РОУТИНГА СПРЕДА (#116): спред двигает ЖЕСТ, а РЕАГИРУЕТ ли стек на конкретный жест — решает
// его ВВОД-конфиг (spread.input.pointerTrigger / touchTrigger). Шов spreadOnElement(cp, rawX, rawY,
// source): source ∈ {touch-zoom, pointer-zoom, pointer-pan}; сырые device-дельты стек сам маппит в
// прогресс (0..1) по input (ось/инверсия/чувствительность). Не тот жест → false, уходит камере.
//
// Маршрут «событие колеса/пинча → source + raw» живёт в sceneEngine (нужен DOM/app) и проверяется в
// браузере; здесь — сам шов на голом инстансе (new KitScene() не поднимает Pixi, spreadStackAt
// читает у элемента лишь id + body.px/py — тот же приём, что у остальных юнитов движка).

const CFG: SpreadConfig = {
  gain: 10,
  close: { kind: "infinite" },
  spring: 12,
  input: { pointerTrigger: "zoom", touchTrigger: "zoom" },
};

/** Витрина с одной картой в (0,0) и спред-записью над ней; роут-метод открыт для вызова. */
class Probe extends KitScene {
  readonly at = { x: 0, y: 0 };

  seed(inputOver: Partial<SpreadInput> = {}): void {
    const el = { id: "c0", body: { px: 0, py: 0 } } as unknown as SceneElement;
    this.api.byId.set("c0", el);
    const cfg: SpreadConfig = { ...CFG, input: { ...CFG.input, ...inputOver } };
    // Сеем ЧЕРЕЗ ВЛАДЕЛЬЦА (kitSpread.ts) — тем же вызовом, которым это делает сборка витрины.
    this.spreadOwner.register(["c0"], { x: 0, y: 0 }, () => ({ dx: 0, dy: 0, rot: 0 }), { w: 60, h: 90 }, cfg);
    this.entries()[0]!.state = { ...SPREAD_STATE0 };
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

  /** open>0 = раздвигать. Переводим намерение в СЫРЫЕ device-дельты под конвенции source (знак/ось):
   *  zoom — к себе (rawY<0) раздвигает; touch-пинч — span растёт (rawX>0); pan — вправо (rawX>0). */
  spread(open: number, source: SpreadSource): boolean {
    const rawX = source === "pointer-zoom" ? 0 : open;
    const rawY = source === "pointer-zoom" ? -open : 0;
    return this.spreadOnElement(this.at, rawX, rawY, source);
  }

  private entries(): readonly SpreadEntry[] {
    return this.spreadOwner.entries();
  }
}

describe("KitScene: роут спреда по source и триггеру стека", () => {
  it("KitScene реализует шов spreadOnElement делегатом — иначе спред никогда не тронуть", () => {
    expect(typeof KitScene.prototype["spreadOnElement"]).toBe("function");
  });

  it("нет стека под точкой → false (жест уходит камере)", () => {
    const p = new Probe(); // без seed — реестр пуст
    expect(p.spread(20, "touch-zoom")).toBe(false);
  });

  it("touchTrigger==='zoom': тач-пинч раздвигает, обычное колесо (pointer-pan) — нет", () => {
    const p = new Probe();
    p.seed({ touchTrigger: "zoom", pointerTrigger: "zoom" });
    expect(p.spread(200, "touch-zoom")).toBe(true);
    expect(p.target()).toBeGreaterThan(0);
    p.setTarget(0);
    expect(p.spread(200, "pointer-pan")).toBe(false); // pointerTrigger не 'pan' — колесо мимо спреда
    expect(p.target()).toBe(0);
  });

  it("touchTrigger===false: тач-пинч спред НЕ трогает (уходит в зум камеры)", () => {
    const p = new Probe();
    p.seed({ touchTrigger: false });
    expect(p.spread(200, "touch-zoom")).toBe(false);
    expect(p.target()).toBe(0);
  });

  it("pointerTrigger==='zoom': десктоп-зум раздвигает, обычное колесо — нет", () => {
    const p = new Probe();
    p.seed({ pointerTrigger: "zoom" });
    expect(p.spread(200, "pointer-zoom")).toBe(true);
    p.setTarget(0);
    expect(p.spread(200, "pointer-pan")).toBe(false);
  });

  it("pointerTrigger==='pan': обычное колесо раздвигает, десктоп-зум — нет", () => {
    const p = new Probe();
    p.seed({ pointerTrigger: "pan" });
    expect(p.spread(200, "pointer-pan")).toBe(true);
    p.setTarget(0);
    expect(p.spread(200, "pointer-zoom")).toBe(false); // зум-жест уходит в зум камеры
  });

  it("pointerTrigger===false: ни зум, ни колесо спред не трогают", () => {
    const p = new Probe();
    p.seed({ pointerTrigger: false });
    expect(p.spread(200, "pointer-zoom")).toBe(false);
    expect(p.spread(200, "pointer-pan")).toBe(false);
    expect(p.target()).toBe(0);
  });

  it("invert меняет знак: тот же жест теперь СОБИРАЕТ, а не раздвигает", () => {
    const p = new Probe();
    p.seed({ pointerTrigger: "zoom", invert: true });
    p.setTarget(0.5);
    expect(p.spread(200, "pointer-zoom")).toBe(true); // жест принят
    expect(p.target()).toBeLessThan(0.5); // но пошёл ВНИЗ (инверсия)
  });
});

// СПРЕД — ВНУТРЕННИЙ слой, камера — ВНЕШНИЙ. На пределе спреда (target упёрся в 0/1 и жест давит
// дальше в ту же сторону) spreadOnElement возвращает false — жест уходит камере.
describe("KitScene: на пределе спреда жест отдаётся камере", () => {
  it("полностью раскрыт (1) + открывание → НЕ перехвачено", () => {
    const p = new Probe();
    p.seed();
    p.setTarget(1);
    expect(p.spread(200, "pointer-zoom")).toBe(false);
    expect(p.target()).toBe(1);
  });

  it("сомкнут (0) + закрывание → НЕ перехвачено, спред не уходит в минус", () => {
    const p = new Probe();
    p.seed();
    expect(p.spread(-200, "pointer-zoom")).toBe(false);
    expect(p.target()).toBe(0);
  });

  it("обратный жест сразу ведёт спред: раскрыт + закрывание → перехвачено", () => {
    const p = new Probe();
    p.seed();
    p.setTarget(1);
    expect(p.spread(-200, "pointer-zoom")).toBe(true);
    expect(p.target()).toBeLessThan(1);
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
    for (let i = 0; i < 20; i++) p.spread(200, "pointer-zoom"); // за один жест наполняем до предела
    expect(p.target()).toBe(1);
    expect(p.spread(200, "pointer-zoom")).toBe(true); // дальше в тот же жест — детент
  });

  it("СЛЕДУЮЩИЙ жест, начатый на пределе, отдаётся камере (false)", () => {
    const p = new Probe();
    p.seed();
    p.begin();
    for (let i = 0; i < 20; i++) p.spread(200, "pointer-zoom"); // наполнили + детент
    p.begin(); // палец отпущен / пауза у колеса — новый жест
    expect(p.spread(200, "pointer-zoom")).toBe(false);
    expect(p.target()).toBe(1);
  });

  it("детент НЕ мешает реверсу в том же жесте: с предела закрывание ведёт спред", () => {
    const p = new Probe();
    p.seed();
    p.begin();
    for (let i = 0; i < 20; i++) p.spread(200, "pointer-zoom");
    expect(p.spread(-200, "pointer-zoom")).toBe(true);
    expect(p.target()).toBeLessThan(1);
  });
});
