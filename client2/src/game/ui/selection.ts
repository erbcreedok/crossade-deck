import { Container, Graphics } from "pixi.js";

// СВЕЧЕНИЕ ВЫДЕЛЕНИЯ — атом, устроенный КАК ТЕНИ: контур фигуры выводится РЕНДЕРОМ, а не
// геометрией. Расширенные силуэты всех частей фигуры заливаются цветом (слои свечения — данные),
// затем ТОЧНЫЕ силуэты стираются erase-блендом — остаётся ободок по НАСТОЯЩЕМУ ступенчатому
// контуру стопки (union-полигон бесплатно, на GPU, с любыми поворотами частей). Контейнер
// кешируется в текстуру: erase не дырявит фон, а форма пересчитывается только при смене состава.
// Узел добавляется нижним ребёнком root ЭЛЕМЕНТА — едет/наклоняется/масштабируется с ним сам.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Часть фигуры: прямоугольник со скруглением, координаты — как договорится вызывающий
 *  (сцена передаёт КОНТЕНТ-единицы относительно центра несущего элемента). */
export interface GlowShape extends Rect {
  radius: number;
}

export interface GlowStyle {
  color: number;
  /** Насыщенность свечения 0..1 (домножает альфы слоёв). */
  strength?: number;
}

/** Габарит фигуры: объединение прямоугольников её частей. Чистая (тестируется без Pixi). */
export function unionRect(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Слои свечения — данные: от широкого прозрачного к узкому яркому (расширение в px фигуры). */
const GLOW_FILL_LAYERS = [
  { expand: 16, alpha: 0.1 },
  { expand: 10, alpha: 0.18 },
  { expand: 5, alpha: 0.85 },
] as const;

export function makeFigureGlow(shapes: readonly GlowShape[], s: GlowStyle): Container {
  const strength = s.strength ?? 1;
  const c = new Container();
  const fill = new Graphics();
  for (const layer of GLOW_FILL_LAYERS) {
    for (const sh of shapes) {
      fill
        .roundRect(sh.x - layer.expand, sh.y - layer.expand, sh.w + layer.expand * 2, sh.h + layer.expand * 2, sh.radius + layer.expand)
        .fill({ color: s.color, alpha: layer.alpha * strength });
    }
  }
  // Точные силуэты стираются: свечение остаётся ТОЛЬКО ободком вокруг фигуры (как маска теней).
  const erase = new Graphics();
  for (const sh of shapes) erase.roundRect(sh.x, sh.y, sh.w, sh.h, sh.radius).fill({ color: 0xffffff });
  erase.blendMode = "erase";
  c.addChild(fill, erase);
  // Кеш в текстуру: erase действует внутри кеша и не дырявит стол; перерисовка — только при
  // пересоздании узла (смена состава фигуры), не по кадрам.
  (c as unknown as { cacheAsTexture?: (v: boolean) => void }).cacheAsTexture?.(true);
  return c;
}
