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
import { ACTION_BAR_H } from "./chrome";

const BG = 0x1a241e;

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
    const b = dockBand(f, this.laidIds().length);
    g.roundRect(b.x, b.y, b.w, b.h, 12).fill({ color: BG, alpha: 0.14 });
    if (this.zoneState === "armed") {
      dashedRoundRect(g, b.x, b.y, b.w, b.h, 12);
      g.stroke({ width: 2, color: 0x9aa79c, alpha: 0.95 });
    } else {
      const hot = this.zoneState === "hot";
      g.roundRect(b.x, b.y, b.w, b.h, 12).stroke({ width: hot ? 3 : 1.5, color: hot ? this.deps.accent() : 0x5f7a6d, alpha: hot ? 1 : 0.3 });
    }
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

/** Пунктирная обводка скруглённого прямоугольника: прямые рёбра штрихами, углы — сплошными дугами.
 *  Путь копится в g; вызвать g.stroke() после. Pixi v8 dash-паттерна не имеет — рисуем сегментами. */
function dashedRoundRect(g: Graphics, x: number, y: number, w: number, h: number, r: number, dash = 9, gap = 7): void {
  const x2 = x + w;
  const y2 = y + h;
  dashLine(g, x + r, y, x2 - r, y, dash, gap);
  dashLine(g, x2, y + r, x2, y2 - r, dash, gap);
  dashLine(g, x2 - r, y2, x + r, y2, dash, gap);
  dashLine(g, x, y2 - r, x, y + r, dash, gap);
  g.moveTo(x2 - r, y).arc(x2 - r, y + r, r, -Math.PI / 2, 0);
  g.moveTo(x2, y2 - r).arc(x2 - r, y2 - r, r, 0, Math.PI / 2);
  g.moveTo(x + r, y2).arc(x + r, y2 - r, r, Math.PI / 2, Math.PI);
  g.moveTo(x, y + r).arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
}

function dashLine(g: Graphics, x1: number, y1: number, x2: number, y2: number, dash: number, gap: number): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const ux = dx / len;
  const uy = dy / len;
  for (let t = 0; t < len; t += dash + gap) {
    const t2 = Math.min(t + dash, len);
    g.moveTo(x1 + ux * t, y1 + uy * t).lineTo(x1 + ux * t2, y1 + uy * t2);
  }
}
