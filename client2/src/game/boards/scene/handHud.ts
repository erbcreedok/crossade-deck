// РУКА-ВИДЖЕТ HUD — СЛОЙ и КРАСКА, не владелец нод и не математика. Куда пришвартована (край,
// отрезок дока) решает SceneHud (scene/hud.ts): рука — один из виджетов дока, среди равных.
// Ключевые каноны:
//   • одна нода на карту: карты руки — те же узлы nodeStore, их root перекладывается СЮДА, на
//     экранно-фиксированный слой (chrome, не зумится); переход борда↔рука — непрерывный полёт
//     ОДНОЙ ноды (nodeStore конвертирует координаты/масштаб на границе);
//   • вся геометрия дока (край side, ось flow, размер карты, позы, индексы) — ЧИСТЫЙ handDock,
//     сторожится юнитами; здесь только Pixi-слой, полоса-дропзона rest/armed/hot и пометка драга.

import { Container, Graphics } from "pixi.js";
import { CARD } from "../../crossade/tree";
import type { HandConfig } from "../hand/handConfig";
import { dockBand, dockCell, dockDragPose, dockIndexAt, dockPoses, type DockFrame, type DockPose } from "../hand/handDock";
import type { HudSide } from "../core/spec";
import { paintHandBand } from "../hand/handBandPaint";
import { ACTION_BAR_H } from "./chrome";

/** Состояние дроп-зоны руки: покой / груз в полёте где-то / груз над рукой (владелец). */
export type HandZone = "rest" | "armed" | "hot";
export type { DockPose as HandPose } from "../hand/handDock";

export interface HandHudDeps {
  /** Разобранный конфиг руки (null — руки нет). Активен виджет, только когда SceneHud дал док. */
  config(): HandConfig | null;
  /** Карты своей руки по порядку (handKey(selfSeat)). */
  members(): readonly string[];
  accent(): number;
  wake(): void;
  /** Перецелить карты руки на свежие позы (гэп-превью раздвинул/сомкнул ряд) — зовёт nodeStore. */
  retarget(): void;
}

export class SceneHandHud {
  /** Слой руки на chrome: сюда nodeStore перекладывает root'ы карт руки (экранно-фиксированные). */
  readonly root = new Container();
  private readonly zone = new Graphics();
  private size = { w: 0, h: 0 };
  private dockSide: HudSide | null = null; // назначение SceneHud: край…
  private span: { from: number; len: number } | null = null; // …и отрезок дока вдоль края
  private zoneState: HandZone = "rest";
  private dragging: string | null = null; // карта, поднятая в драг: из строки исключается (гэп закрыт)
  private preview: number | null = null; // гэп-превью: индекс вставки, под который ряд раздвинут

  constructor(private readonly deps: HandHudDeps) {
    this.root.sortableChildren = true; // правая карта поверх левой; зона — под всеми
    this.zone.zIndex = -1000;
    this.root.addChild(this.zone);
  }

  /** Назначение от SceneHud: край и отрезок дока вдоль края. null — рука не в HUD (на борде). */
  setDock(side: HudSide | null, span: { from: number; len: number } | null): void {
    this.dockSide = side;
    this.span = span;
  }

  private vertical(): boolean {
    return this.dockSide === "left" || this.dockSide === "right";
  }

  /** Смещение ОТРЕЗКА дока в экране: math дока живёт в локальной рамке отрезка. */
  private origin(): { x: number; y: number } {
    if (!this.span) return { x: 0, y: 0 };
    return this.vertical() ? { x: 0, y: ACTION_BAR_H + this.span.from } : { x: this.span.from, y: 0 };
  }

  /** Рамка дока для чистой геометрии; null — рука не в HUD. Рамка ЛОКАЛЬНА отрезку (origin). */
  private frame(): DockFrame | null {
    const c = this.deps.config();
    if (!c || !this.dockSide || !this.span) return null;
    if (this.vertical()) return { w: this.size.w, h: this.span.len, insetTop: 0, insetBottom: 0, side: this.dockSide, flow: c.flow, size: c.size, card: CARD };
    return { w: this.span.len, h: this.size.h, insetTop: ACTION_BAR_H, insetBottom: ACTION_BAR_H, side: this.dockSide, flow: c.flow, size: c.size, card: CARD };
  }

  /** Поперечная толщина ленты виджета — SceneHud складывает из неё глубину дока и резерв края. */
  bandDepth(): number {
    const f = this.frame();
    if (!f) return 0;
    const b = dockBand(f, this.laidIds().length);
    return this.vertical() ? b.w : b.h;
  }

  /** Перерисовать дроп-зону под текущий размер (позиции карт ставит nodeStore по poseOf). */
  layout(w: number, h: number): void {
    this.size = { w, h };
    this.paintZone();
  }

  /** Экранная поза карты руки id (центр + scale ноды), либо null — она не в руке или её тащат. */
  poseOf(id: string): DockPose | null {
    const f = this.frame();
    if (!f) return null;
    const ids = this.laidIds();
    const i = ids.indexOf(id);
    if (i < 0) return null;
    const o = this.origin();
    const p = dockPoses(f, ids.length, this.preview)[i]!;
    return { x: p.x + o.x, y: p.y + o.y, scale: p.scale };
  }

  // ——— драг руки↔борда: захват, дроп-зона, снятие ———

  /** id карты руки под ЭКРАННОЙ точкой (верхняя по нахлёсту) — для захвата. Помечает её dragging. */
  pickAt(sx: number, sy: number): string | null {
    const id = this.cardAt(sx, sy);
    if (id !== null) {
      this.dragging = id;
      this.deps.wake();
    }
    return id;
  }

  /** id карты руки под точкой, иначе null. Перетаскиваемую пропускаем. */
  cardAt(sx: number, sy: number): string | null {
    const f = this.frame();
    if (!f) return null;
    const cell = dockCell(f);
    let hit: string | null = null;
    for (const id of this.laidIds()) {
      const p = this.poseOf(id);
      if (p && Math.abs(sx - p.x) <= cell.w / 2 && Math.abs(sy - p.y) <= cell.h / 2) hit = id;
    }
    return hit;
  }

  /** Экранная поза перетаскиваемой карты над доком: следует за пальцем по оси ряда, в ряду. */
  dragPose(sx: number, sy: number): DockPose {
    const f = this.frame();
    if (!f) return { x: sx, y: sy, scale: 1 };
    const o = this.origin();
    const p = dockDragPose(f, { x: sx - o.x, y: sy - o.y });
    return { x: p.x + o.x, y: p.y + o.y, scale: p.scale };
  }

  /** Экранная точка над полосой руки (дроп-зоной)? */
  overBand(sx: number, sy: number): boolean {
    const f = this.frame();
    if (!f) return false;
    const o = this.origin();
    const b = dockBand(f, this.laidIds().length);
    return sx - o.x >= b.x && sx - o.x <= b.x + b.w && sy - o.y >= b.y && sy - o.y <= b.y + b.h;
  }

  /** Индекс вставки по точке — по БАЗОВОМУ ряду (превью не двигает цель). Без перетаскиваемой. */
  insertIndexAt(sx: number, sy: number): number {
    const f = this.frame();
    const o = this.origin();
    return f ? dockIndexAt(f, this.laidIds().length, { x: sx - o.x, y: sy - o.y }) : 0;
  }

  /** Груз навис над рукой в экранной точке: зона hot + гэп-превью — ряд раздвигается под индекс
   *  вставки, игрок ВИДИТ, куда ляжет карта, до отпускания. */
  hoverAt(sx: number, sy: number): void {
    this.setZone("hot");
    const idx = this.insertIndexAt(sx, sy);
    if (idx === this.preview) return;
    this.preview = idx;
    this.deps.retarget();
    this.deps.wake();
  }

  setZone(state: HandZone): void {
    if (state === this.zoneState) return;
    this.zoneState = state;
    if (state !== "hot") this.clearPreview(); // груз ушёл с руки — гэп смыкается
    this.paintZone();
    this.deps.wake();
  }

  /** Снять пометку драга (карта вернулась/ушла на стол): вернуть покой зоны и полную строку. */
  clearDragging(): void {
    this.dragging = null;
    this.zoneState = "rest";
    this.clearPreview();
    this.paintZone();
    this.deps.wake();
  }

  private clearPreview(): void {
    if (this.preview === null) return;
    this.preview = null;
    this.deps.retarget();
  }

  /** id карт руки, участвующих в РАСКЛАДКЕ (без перетаскиваемой — под неё гэп закрыт). */
  private laidIds(): string[] {
    return this.deps.members().filter((id) => id !== this.dragging);
  }

  private paintZone(): void {
    const g = this.zone;
    g.clear();
    const f = this.frame();
    if (!f) return;
    // Стиль — общий painter руки (handBandPaint): док и рука-на-борде обязаны выглядеть одинаково.
    const o = this.origin();
    const b = dockBand(f, this.laidIds().length);
    paintHandBand(g, { ...b, x: b.x + o.x, y: b.y + o.y }, this.zoneState, this.deps.accent());
  }

  /** Дев-хук: экранные ЦЕЛЕВЫЕ позиции карт руки по порядку. */
  screenPoses(): { id: string; x: number; y: number }[] {
    const out: { id: string; x: number; y: number }[] = [];
    for (const id of this.deps.members()) {
      const p = this.poseOf(id);
      if (p) out.push({ id, x: p.x, y: p.y });
    }
    return out;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

