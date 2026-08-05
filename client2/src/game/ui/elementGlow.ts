import type { Container } from "pixi.js";
import { makeFigureGlow, type GlowShape } from "./selection";

// СВЕЧЕНИЕ ВЫДЕЛЕНИЯ — общая пересадка атома на предмет (Glowable): узел живёт нижним ребёнком
// root, поэтому едет/наклоняется/масштабируется с предметом сам, как собственная тень. Раньше
// эта логика (снести старый узел, отмасштабировать фигуру в локальные единицы, смонтировать
// новый) была скопирована в Card и Piece; отличается у предметов только ФОРМА по умолчанию.

/** Перевести фигуру (контент-единицы отн. центра предмета) в его локальные координаты. */
function scaleShape(sh: GlowShape, f: number): GlowShape {
  return sh.kind === "silhouette"
    ? { ...sh, x: sh.x / f, y: sh.y / f, w: sh.w / f, h: sh.h / f }
    : { ...sh, x: sh.x / f, y: sh.y / f, w: sh.w / f, h: sh.h / f, radius: sh.radius / f };
}

/**
 * Смонтировать/погасить свечение. `prev` сносится всегда; `color === null` — погасить. `figure`
 * (светиться ЦЕЛОЙ стопкой: контур по союзу силуэтов) масштабируется делителем `f` — контент-px
 * на локальную единицу предмета; без фигуры берётся `fallback` — собственная форма предмета.
 * Возвращает новый узел (или null) — предмет хранит его, чтобы погасить при следующем вызове.
 */
export function remountGlow(root: Container, prev: Container | null, color: number | null, figure: readonly GlowShape[] | undefined, f: number, fallback: GlowShape): Container | null {
  prev?.destroy();
  if (color === null) return null;
  const shapes: GlowShape[] = figure ? figure.map((sh) => scaleShape(sh, f)) : [fallback];
  const node = makeFigureGlow(shapes, { color });
  root.addChildAt(node, 0);
  return node;
}
