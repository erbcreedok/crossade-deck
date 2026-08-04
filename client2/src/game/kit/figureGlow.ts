import { Container } from "pixi.js";
import { makeFigureGlow, type GlowShape } from "../ui/selection";
import type { Glowable } from "../engine/element";

// ЖИВОЕ ВЫДЕЛЕНИЕ ФИГУРЫ-ГРУППЫ. Контур союза НЕ привязан ни к одной части — он слой сцены
// (surface, ПОД элементами): драг любой части, включая первую, слой с места не сдвигает.
// Часть, ушедшая со своего дома (её тащат), РВЁТ силуэт: выпадает из союза и светится ЛИЧНО —
// своим силуэтом, на себе, едет с пальцем. Вернулась домой — вливается обратно в союз.
//
// Слежение — дешёвый опрос позиций (сравнение чисел); пересборка контура — только когда
// НАБОР ушедших сменился. Таймеры едут на after() сцены: движок спит — не тикаем (будит драг).

export interface FigureGlowPart {
  el: Glowable & { root: { x: number; y: number } };
  /** Дом ЦЕНТРА части (контент-координаты): от него меряется «ушла ли с места». */
  home: { x: number; y: number };
  /** Форма части в АБСОЛЮТНЫХ контент-координатах (по разметке фигуры). */
  shape: GlowShape;
}

const MOVE_EPS = 3; // px: дыхание/пружины не считаются уходом
const POLL_SEC = 0.12;

export function watchFigureGlow(
  host: { decor(node: Container): void; after(delay: number, fn: () => void): void; wake(): void },
  parts: readonly FigureGlowPart[],
  color: number,
): void {
  const layer = new Container();
  host.decor(layer);
  let awayKey: string | null = null;

  const rebuild = (away: readonly boolean[]): void => {
    for (const c of layer.removeChildren()) c.destroy({ children: true });
    const still = parts.filter((_, i) => !away[i]).map((p) => p.shape);
    if (still.length) layer.addChild(makeFigureGlow(still, { color }));
    parts.forEach((p, i) => p.el.setGlow(away[i] ? color : null));
    host.wake();
  };

  const tick = (): void => {
    const away = parts.map((p) => Math.hypot(p.el.root.x - p.home.x, p.el.root.y - p.home.y) > MOVE_EPS);
    const key = away.map((a) => (a ? "1" : "0")).join("");
    if (key !== awayKey) {
      awayKey = key;
      rebuild(away);
    }
    host.after(POLL_SEC, tick);
  };
  tick();
}
