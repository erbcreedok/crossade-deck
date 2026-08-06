// ДОК ЗОНЫ В HUD — СЛОЙ-ЛЕНТА и КРАСКА одного пришвартованного экземпляра зоны, не владелец нод
// и не математика. Куда пришвартован (край, отрезок дока) решает SceneHud (scene/hud.ts): док —
// один из виджетов дока, среди равных; сколько зон — столько доков. Ключевые каноны:
//   • одна нода на жителя: карты/фишки дока — те же узлы nodeStore, их root перекладывается на
//     экранно-фиксированный слой HUD (chrome, не зумится); переход борда↔док — непрерывный полёт
//     ОДНОЙ ноды (nodeStore конвертирует координаты/масштаб на границе);
//   • вся геометрия (край side, ось flow, размер ячейки, позы, индексы) — ЧИСТЫЙ strip/dock,
//     сторожится юнитами; здесь только Pixi-краска ленты rest/armed/hot и пометка драга.

import { Graphics } from "pixi.js";
import type { DockConfig } from "../strip/presentation";
import { dockBand, dockCell, dockDragPose, dockIndexAt, dockPoses, type DockFrame, type DockPose } from "../strip/dock";
import type { HudSide } from "../core/spec";
import { paintStripBand } from "../strip/bandPaint";

/** Состояние ленты-дропзоны: покой / груз в полёте где-то / груз над лентой (владелец). */
export type BandState = "rest" | "armed" | "hot";

export interface ZoneDockDeps {
  /** Разобранный конфиг дока зоны (ZoneSpec → zoneDockConfig: лента-ряд или стопка). */
  config(): DockConfig;
  /** Жители СВОЕГО экземпляра зоны по порядку (stripKey(zone, selfSeat)). */
  members(): readonly string[];
  accent(): number;
  wake(): void;
  /** Перецелить жителей дока на свежие позы (гэп-превью раздвинул/сомкнул ряд) — зовёт nodeStore. */
  retarget(): void;
}

export class SceneZoneDock {
  /** Краска ленты (band) — SceneHud кладёт её ПОД общий слой карт. */
  readonly band = new Graphics();
  private size = { w: 0, h: 0 };
  private dockSide: HudSide | null = null; // назначение SceneHud: край…
  private span: { from: number; len: number } | null = null; // …и отрезок дока вдоль края
  // Отступы от SceneHud: edge — от своего края (safe+inset), main — старт main-оси (safe/хром),
  // chromeTop/Bottom — ЖИВЫЕ полосы хрома (0 без кнопок — док прибит к краю).
  private off = { edge: 0, main: 0, chromeTop: 0, chromeBottom: 0 };
  private bandState: BandState = "rest";
  private dragging: string | null = null; // житель, поднятый в драг: из ряда исключается (гэп закрыт)
  private preview: number | null = null; // гэп-превью: индекс вставки, под который ряд раздвинут

  constructor(
    /** id базовой зоны и ключ СВОЕГО контейнера («hand:p1») — цель move/reorderSlot при дропе. */
    readonly zoneId: string,
    readonly key: string,
    private readonly deps: ZoneDockDeps,
  ) {}

  /** Назначение от SceneHud: край, отрезок дока вдоль края и отступы (edge — от СВОЕГО края:
   *  safe-zone сцены + inset дока; main — старт main-оси; chrome — живые полосы). null — на борде. */
  setDock(side: HudSide | null, span: { from: number; len: number } | null, off = { edge: 0, main: 0, chromeTop: 0, chromeBottom: 0 }): void {
    this.dockSide = side;
    this.span = span;
    this.off = off;
  }

  active(): boolean {
    return this.dockSide !== null && this.span !== null;
  }

  private vertical(): boolean {
    return this.dockSide === "left" || this.dockSide === "right";
  }

  /** Смещение ОТРЕЗКА дока в экране: math дока живёт в локальной рамке отрезка. */
  private origin(): { x: number; y: number } {
    if (!this.span) return { x: 0, y: 0 };
    return this.vertical() ? { x: 0, y: this.off.main + this.span.from } : { x: this.off.main + this.span.from, y: 0 };
  }

  /** Рамка дока для чистой геометрии; null — зона не в HUD. Рамка ЛОКАЛЬНА отрезку (origin). */
  private frame(): DockFrame | null {
    if (!this.dockSide || !this.span) return null;
    const c = this.deps.config();
    if (this.vertical()) return { w: this.size.w, h: this.span.len, insetTop: 0, insetBottom: 0, side: this.dockSide, flow: c.flow, size: c.size, card: c.cell, edge: this.off.edge, stack: c.stack };
    return { w: this.span.len, h: this.size.h, insetTop: this.off.chromeTop, insetBottom: this.off.chromeBottom, side: this.dockSide, flow: c.flow, size: c.size, card: c.cell, edge: this.off.edge, stack: c.stack };
  }

  /** Поперечная толщина ленты — SceneHud складывает из неё глубину дока и резерв края. */
  bandDepth(): number {
    const f = this.frame();
    if (!f) return 0;
    const b = dockBand(f, this.laidIds().length);
    return this.vertical() ? b.w : b.h;
  }

  /** Перерисовать ленту под текущий размер (позиции жителей ставит nodeStore по poseOf). */
  layout(w: number, h: number): void {
    this.size = { w, h };
    this.paintBand();
  }

  /** Экранная поза жителя id (центр + scale ноды), либо null — он не тут или его тащат. */
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

  // ——— драг док↔борда: захват, лента-дропзона, снятие ———

  /** id жителя под ЭКРАННОЙ точкой (верхний по нахлёсту) — для захвата. Помечает его dragging. */
  pickAt(sx: number, sy: number): string | null {
    const id = this.cardAt(sx, sy);
    if (id !== null) {
      this.dragging = id;
      this.deps.wake();
    }
    return id;
  }

  /** id жителя под точкой, иначе null. Перетаскиваемого пропускаем. */
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

  /** Экранная поза груза над доком: следует за пальцем по оси ряда, в ряду. */
  dragPose(sx: number, sy: number): DockPose {
    const f = this.frame();
    if (!f) return { x: sx, y: sy, scale: 1 };
    const o = this.origin();
    const p = dockDragPose(f, { x: sx - o.x, y: sy - o.y });
    return { x: p.x + o.x, y: p.y + o.y, scale: p.scale };
  }

  /** Экранная точка над лентой дока (дроп-зоной)? */
  overBand(sx: number, sy: number): boolean {
    const f = this.frame();
    if (!f) return false;
    const o = this.origin();
    const b = dockBand(f, this.laidIds().length);
    return sx - o.x >= b.x && sx - o.x <= b.x + b.w && sy - o.y >= b.y && sy - o.y <= b.y + b.h;
  }

  /** Индекс вставки по точке — по БАЗОВОМУ ряду (превью не двигает цель). Без перетаскиваемого. */
  insertIndexAt(sx: number, sy: number): number {
    const f = this.frame();
    const o = this.origin();
    return f ? dockIndexAt(f, this.laidIds().length, { x: sx - o.x, y: sy - o.y }) : 0;
  }

  /** Груз навис над доком в экранной точке: лента hot + гэп-превью — ряд раздвигается под индекс
   *  вставки, игрок ВИДИТ, куда ляжет груз, до отпускания. */
  hoverAt(sx: number, sy: number): void {
    this.setBand("hot");
    if (!this.deps.config().preview) return; // стопка/лента без превью: только подсветка
    const idx = this.insertIndexAt(sx, sy);
    if (idx === this.preview) return;
    this.preview = idx;
    this.deps.retarget();
    this.deps.wake();
  }

  setBand(state: BandState): void {
    if (state === this.bandState) return;
    this.bandState = state;
    if (state !== "hot") this.clearPreview(); // груз ушёл с ленты — гэп смыкается
    this.paintBand();
    this.deps.wake();
  }

  /** Снять пометку драга (житель вернулся/ушёл): вернуть покой ленты и полный ряд. */
  clearDragging(): void {
    this.dragging = null;
    this.bandState = "rest";
    this.clearPreview();
    this.paintBand();
    this.deps.wake();
  }

  private clearPreview(): void {
    if (this.preview === null) return;
    this.preview = null;
    this.deps.retarget();
  }

  /** id жителей, участвующих в РАСКЛАДКЕ (без перетаскиваемого — под него гэп закрыт). */
  private laidIds(): string[] {
    return this.deps.members().filter((id) => id !== this.dragging);
  }

  private paintBand(): void {
    const g = this.band;
    g.clear();
    const f = this.frame();
    if (!f) return;
    // Стиль — общий painter лент (strip/bandPaint): док и лента-на-борде выглядят одинаково.
    const o = this.origin();
    const b = dockBand(f, this.laidIds().length);
    paintStripBand(g, { ...b, x: b.x + o.x, y: b.y + o.y }, this.bandState, this.deps.accent());
  }

  /** Дев-хук: экранные ЦЕЛЕВЫЕ позиции жителей дока по порядку. */
  screenPoses(): { zone: string; id: string; x: number; y: number }[] {
    const out: { zone: string; id: string; x: number; y: number }[] = [];
    for (const id of this.deps.members()) {
      const p = this.poseOf(id);
      if (p) out.push({ zone: this.zoneId, id, x: p.x, y: p.y });
    }
    return out;
  }

  destroy(): void {
    this.band.destroy();
  }
}
