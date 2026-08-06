import { describe, it, expect } from "vitest";
import { areaFrames, laneBlocks, PIN_DEFAULT_SPAN, dockedZones, zoneDockAt, zoneOnBoard, type AreaFrame } from "./hudLayout";
import type { HudEnv } from "./regions";
import type { HudSpec, ZoneSpec } from "../core/spec";
import { pin, placeholderW, region, zoneW } from "../core/hudSpec";

// Сторож layout-системы HUD: регионы делят лейн края (px-константы держатся, доли делят
// свободное), прижим — выбором региона start/center/end, углы по владельцам БЕЗ наплывов;
// пины — от якоря, поверх. Где живёт зона — решает hudLayout (виджет kind:"zone"), не зона.

const env = (over: Partial<HudEnv> = {}): HudEnv => ({
  w: 1000,
  h: 800,
  safe: { top: 0, bottom: 0, left: 0, right: 0 },
  chrome: { top: 0, bottom: 0 },
  ...over,
});
const D56 = (): number => 56;
const hud = (areas: HudSpec["areas"], corners?: HudSpec["corners"]): HudSpec => ({ areas, ...(corners ? { corners } : {}) });
const frameOf = (frames: AreaFrame[], areaIndex: number): AreaFrame => frames.find((f) => f.areaIndex === areaIndex)!;

describe("флекс лейна: константы держатся, доли делят свободное ВСЕГО края", () => {
  it("auto-доля забирает всё свободное рядом с px-константой (в одной области)", () => {
    const frames = areaFrames(hud([region("bottom", "start", [zoneW("hand", "auto"), placeholderW("реакции", 220)])]), env(), D56);
    const [hand, panel] = frames[0]!.widgets;
    expect(hand!.from).toBe(0);
    expect(hand!.len).toBe(1000 - 220 - 10);
    expect(panel!.from).toBe(hand!.len + 10);
    expect(panel!.len).toBe(220);
  });

  it("{fr:2} и {fr:1} В РАЗНЫХ регионах края относятся 2:1 — доли делят свободное всего лейна", () => {
    const frames = areaFrames(hud([region("bottom", "start", [placeholderW("a", { fr: 2 })]), region("bottom", "end", [placeholderW("b", { fr: 1 })])]), env(), D56);
    const a = frameOf(frames, 0).widgets[0]!;
    const b = frameOf(frames, 1).widgets[0]!;
    expect(a.len).toBeCloseTo(b.len * 2, 5);
  });

  it("переполнение констант не роняет ряд: доли ужимаются в ноль, from не уходит в минус", () => {
    const frames = areaFrames(hud([region("bottom", "start", [placeholderW("big", 1200), zoneW("hand", "auto")])]), env(), D56);
    const [big, hand] = frames[0]!.widgets;
    expect(big!.from).toBe(0);
    expect(hand!.len).toBe(0);
  });
});

describe("регионы start/center/end: прижим выбором региона", () => {
  it("start у начала, end у конца, center по центру лейна", () => {
    const frames = areaFrames(
      hud([region("top", "start", [placeholderW("s", 100)]), region("top", "center", [placeholderW("c", 200)]), region("top", "end", [placeholderW("e", 100)])]),
      env(),
      D56,
    );
    expect(frameOf(frames, 0).widgets[0]!.from).toBe(0);
    expect(frameOf(frames, 1).widgets[0]!.from).toBe(400); // (1000-200)/2
    expect(frameOf(frames, 2).widgets[0]!.from).toBe(900);
  });

  it("center клампится: широкий start-блок сдвигает center вправо, наплыва нет", () => {
    const at = laneBlocks({ start: 600, center: 200, end: 0 }, 1000);
    expect(at.center).toBe(610); // не (1000-200)/2=400 — прижат к start+GAP
    expect(at.center).toBeGreaterThanOrEqual(at.start + 600);
  });

  it("переполнение блоков: end не наезжает на start", () => {
    const at = laneBlocks({ start: 700, center: 0, end: 500 }, 1000);
    expect(at.end).toBeGreaterThanOrEqual(700 + 10);
  });
});

describe("углы: пустой отдаёт место, спорный — по владельцу, наплывов нет", () => {
  const bottomHand = region("bottom", "start", [zoneW("hand", "auto")]);
  const leftTools = region("left", "start", [placeholderW("tools", 200)]);

  it("пустые соседи: лейн низа — весь край до safe-границ", () => {
    const frames = areaFrames(hud([bottomHand]), env(), D56);
    const w = frames[0]!.widgets[0]!;
    expect(w.from).toBe(0);
    expect(w.len).toBe(1000);
  });

  it("спор bottom↔left: по дефолту углом владеет ГОРИЗОНТАЛЬ — низ во всю ширину, левый лейн срезан снизу на вторжение низа", () => {
    const frames = areaFrames(hud([bottomHand, leftTools]), env(), D56);
    const hand = frameOf(frames, 0).widgets[0]!;
    expect(hand.from).toBe(0);
    expect(hand.len).toBe(1000); // низ не тронут
    const tools = frameOf(frames, 1).widgets[0]!;
    // extent(bottom) = depth 56 + breath 0 → левый лейн заканчивается выше низа.
    expect(tools.from + tools.len).toBeLessThanOrEqual(800 - 56);
  });

  it("corners перекидывает владельца: угол отдан левому — теперь срезан лейн низа", () => {
    const frames = areaFrames(hud([bottomHand, leftTools], { "bottom-left": "left" }), env(), D56);
    const hand = frameOf(frames, 0).widgets[0]!;
    expect(hand.from).toBeGreaterThanOrEqual(56 + 16); // extent(left) = depth + дыхание края
    const tools = frameOf(frames, 1).widgets[0]!;
    expect(tools.from + tools.len).toBeLessThanOrEqual(800); // левый живёт до низа
  });

  it("bleed: явное разрешение — область ложится по НЕурезанному лейну", () => {
    const bleeding = region("bottom", "start", [zoneW("hand", "auto")], { bleed: true });
    const frames = areaFrames(hud([bleeding, leftTools], { "bottom-left": "left" }), env(), D56);
    const hand = frameOf(frames, 0).widgets[0]!;
    expect(hand.from).toBe(0); // угловой вычет проигнорирован — явно разрешили
  });
});

describe("пины: от якоря, поверх, рост внутрь экрана", () => {
  const e = env({ safe: { top: 20, bottom: 30, left: 10, right: 10 } });

  it("bottom-right: конец мини-флекса на safe-границе, offset отодвигает", () => {
    const frames = areaFrames(hud([pin("bottom-right", [placeholderW("tool", 80)], { offset: { x: -8, y: -90 } })]), e, D56);
    const f = frames[0]!;
    expect(f.pinned).toBe(true);
    expect(f.side).toBe("bottom");
    const w = f.widgets[0]!;
    expect(w.from + w.len).toBe(1000 - 10 - 8); // прижат к правой safe-границе + offset.x
    expect(f.edge).toBe(30 + 90); // safe.bottom + подъём offset.y
  });

  it("top-center: мини-флекс центрирован по якорю; виджет без px получает дефолт", () => {
    const frames = areaFrames(hud([pin("top-center", [placeholderW("badge")])]), e, D56);
    const w = frames[0]!.widgets[0]!;
    expect(w.len).toBe(PIN_DEFAULT_SPAN);
    expect(w.from + w.len / 2).toBe(500);
    expect(frames[0]!.edge).toBe(20);
  });

  it("left-middle: вертикальный пин у левого края, центр по высоте", () => {
    const frames = areaFrames(hud([pin("left-middle", [placeholderW("nav", 120)])]), e, D56);
    const f = frames[0]!;
    expect(f.side).toBe("left");
    const w = f.widgets[0]!;
    expect(w.from + w.len / 2).toBe(400);
    expect(f.edge).toBe(10);
  });
});

describe("где живут зоны (совместимый контракт для деревьев борды)", () => {
  const spec: HudSpec = hud([region("top", "start", [zoneW("pouch")]), region("bottom", "start", [placeholderW("x"), zoneW("hand")])]);
  const strip = (id: string): ZoneSpec => ({ id, title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" } });
  const zones = [strip("hand"), strip("pouch"), strip("extra")];

  it("zoneDockAt находит область зоны и позицию виджета; dockedZones перечисляет все", () => {
    expect(zoneDockAt(spec, "hand")).toMatchObject({ areaIndex: 1, index: 1 });
    expect(zoneDockAt(spec, "extra")).toBeNull();
    expect(zoneDockAt({ areas: [] }, "hand")).toBeNull();
    expect(dockedZones(spec)).toEqual(["pouch", "hand"]);
  });

  it("zoneOnBoard: зона на борде ТОЛЬКО когда её нет в HUD; чужой id — не на борде вовсе", () => {
    expect(zoneOnBoard({ zones, hud: spec }, "hand")).toBe(false);
    expect(zoneOnBoard({ zones, hud: spec }, "extra")).toBe(true);
    expect(zoneOnBoard({ zones }, "hand")).toBe(true);
    expect(zoneOnBoard({ zones }, "нетакой")).toBe(false);
  });
});
