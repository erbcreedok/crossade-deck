// ЭКРАННАЯ РУКА (HUD) — СЛОЙ и КРАСКА, не владелец нод и не математика. Ключевые каноны:
//   • одна нода на карту: карты руки — те же узлы nodeStore, их root перекладывается СЮДА, на
//     экранно-фиксированный слой (chrome, не зумится); переход борда↔рука — непрерывный полёт
//     ОДНОЙ ноды (nodeStore конвертирует координаты/масштаб на границе);
//   • вся геометрия дока (край side, ось flow, размер карты, позы, индексы) — ЧИСТЫЙ handDock,
//     сторожится юнитами; здесь только Pixi-слой, полоса-дропзона rest/armed/hot и пометка драга.

import { Container, Graphics } from "pixi.js";
import { CARD } from "../../crossade/tree";
import type { HandConfig } from "../hand/handConfig";
import { dockBand, dockCell, dockDragPose, dockIndexAt, dockPoses, dockReserved, type DockFrame, type DockPose } from "../hand/handDock";
import { paintHandBand } from "../hand/handBandPaint";
import { ACTION_BAR_H } from "./chrome";

/** Состояние дроп-зоны руки: покой / груз в полёте где-то / груз над рукой (владелец). */
export type HandZone = "rest" | "armed" | "hot";
export type { DockPose as HandPose } from "../hand/handDock";

export interface HandHudDeps {
  /** Разобранный конфиг руки (null — руки нет). Док активен при placement:"screen". */
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
  private zoneState: HandZone = "rest";
  private dragging: string | null = null; // карта, поднятая в драг: из строки исключается (гэп закрыт)
  private preview: number | null = null; // гэп-превью: индекс вставки, под который ряд раздвинут

  constructor(private readonly deps: HandHudDeps) {
    this.root.sortableChildren = true; // правая карта поверх левой; зона — под всеми
    this.zone.zIndex = -1000;
    this.root.addChild(this.zone);
  }

  /** Рамка дока для чистой геометрии; null — рука не экранная (докa нет). */
  private frame(): DockFrame | null {
    const c = this.deps.config();
    if (!c || c.placement !== "screen") return null;
    return { w: this.size.w, h: this.size.h, insetTop: ACTION_BAR_H, insetBottom: ACTION_BAR_H, side: c.side, flow: c.flow, size: c.size, card: CARD };
  }

  /** Сколько экрана резервирует док у своего края — стол вписывается в остаток (fitZoom). */
  reserved(w: number, h: number): { top: number; bottom: number; left: number; right: number } {
    const f = this.frame() ?? null;
    const zero = { top: 0, bottom: 0, left: 0, right: 0 };
    return f ? dockReserved({ ...f, w, h }, this.deps.members().length) : zero;
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
    return i < 0 ? null : dockPoses(f, ids.length, this.preview)[i]!;
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
    return f ? dockDragPose(f, { x: sx, y: sy }) : { x: sx, y: sy, scale: 1 };
  }

  /** Экранная точка над полосой руки (дроп-зоной)? */
  overBand(sx: number, sy: number): boolean {
    const f = this.frame();
    if (!f) return false;
    const b = dockBand(f, this.laidIds().length);
    return sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h;
  }

  /** Индекс вставки по точке — по БАЗОВОМУ ряду (превью не двигает цель). Без перетаскиваемой. */
  insertIndexAt(sx: number, sy: number): number {
    const f = this.frame();
    return f ? dockIndexAt(f, this.laidIds().length, { x: sx, y: sy }) : 0;
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
    paintHandBand(g, dockBand(f, this.laidIds().length), this.zoneState, this.deps.accent());
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

