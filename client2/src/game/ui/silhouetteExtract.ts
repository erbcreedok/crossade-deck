import { Container } from "pixi.js";
import type { Renderer } from "pixi.js";
import { alphaSilhouette } from "./silhouette";

// СНЯТЬ форму с визуала: нарисовать предмет, забрать пиксели, прочитать контур по альфе
// (ui/silhouette.ts). Здесь всё, что требует живого рендерера, и ничего больше — сама арифметика
// формы лежит отдельно и закрыта юнитами.
//
// Снимок делается ОДИН РАЗ на вид предмета и кладётся в кэш: форма фигуры не меняется от кадра к
// кадру, а вот `extract.pixels` синхронно рисует в текстуру и читает её обратно — в цикле такому
// не место. Неудача не кэшируется: рендерера может ещё не быть, и запомнить «формы нет» навсегда
// значило бы потерять её из-за порядка сборки.

export interface OwnShape {
  /** Контур в ЛОКАЛЬНЫХ координатах визуала (центр 0,0) — там же, где он себя рисует. */
  poly: number[];
  /** Самая нижняя точка контура: по ней тень ставится под ноги, а не под центр. */
  bottom: number;
}

const cache = new Map<string, OwnShape>();

/** Форма предмета по его же визуалу. `key` — вид предмета (тип + размер), по нему и кэш. */
export function ownShapeOf(renderer: Renderer | null | undefined, key: string, build: (root: Container) => void): OwnShape | null {
  const hit = cache.get(key);
  if (hit) return hit;
  const shape = extract(renderer, build);
  if (shape) cache.set(key, shape);
  return shape;
}

/** Забыть снятые формы. Нужен тестам и пересборке витрины: тот же ключ — другой визуал. */
export function clearOwnShapes(): void {
  cache.clear();
}

function extract(renderer: Renderer | null | undefined, build: (root: Container) => void): OwnShape | null {
  if (!renderer?.extract) return null;
  const root = new Container();
  try {
    build(root);
    const b = root.getLocalBounds();
    if (!(b.width > 0) || !(b.height > 0)) return null;
    const { pixels, width, height } = renderer.extract.pixels(root);
    if (width <= 0 || height <= 0) return null;
    const alpha = new Uint8Array(width * height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3] ?? 0;
    const poly = alphaSilhouette({ alpha, w: width, h: height });
    if (!poly) return null;
    // Пиксели снимка → координаты визуала: снимок покрывает ровно его габарит.
    const out: number[] = [];
    let bottom = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      const x = b.x + (poly[i]! / width) * b.width;
      const y = b.y + (poly[i + 1]! / height) * b.height;
      out.push(x, y);
      if (y > bottom) bottom = y;
    }
    return { poly: out, bottom };
  } catch {
    // Снять форму не удалось (нет контекста, шрифт ещё не готов) — не повод остаться без тени:
    // предмет обойдётся своим габаритом, а форма снимется на следующей сборке.
    return null;
  } finally {
    root.destroy({ children: true });
  }
}
