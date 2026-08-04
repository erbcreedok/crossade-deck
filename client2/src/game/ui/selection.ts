import { Container, Graphics, Sprite, Texture } from "pixi.js";

// СВЕЧЕНИЕ ВЫДЕЛЕНИЯ — атом, устроенный КАК ТЕНИ, вплоть до формы: часть фигуры — это либо
// прямоугольник со скруглением (карта, круглая фишка), либо СОБСТВЕННЫЙ СИЛУЭТ предмета
// (silhouetteExtract — тот же снимок, которым фигура отбрасывает тень): конь огибается как конь,
// пешка как пешка, а не «примерно квадрат». Контур союза выводится РЕНДЕРОМ: расширенные
// силуэты заливаются слоями свечения (dilate — веером смещённых тонированных копий), затем
// ТОЧНЫЕ силуэты стираются erase-блендом — остаётся ободок по настоящему контуру фигуры.
// Контейнер кешируется в текстуру: erase не дырявит стол, пересчёт — только при смене состава.
// Узел добавляется нижним ребёнком root НЕСУЩЕГО элемента — едет/наклоняется/масштабируется сам.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Часть фигуры. Координаты — top-left в единицах, о которых договорился вызывающий
 *  (сцена передаёт КОНТЕНТ-единицы относительно центра несущего элемента). */
export type GlowShape =
  | (Rect & { kind?: "rect"; radius: number })
  /** Собственный силуэт предмета — снимок его визуала (ownShadowOf): форма один в один. */
  | (Rect & { kind: "silhouette"; texture: Texture });

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

/** Веер направлений дилатации силуэта: 8 смещённых копий имитируют расширение формы. */
const DILATE_DIRS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
});

function tintedCopy(sh: Rect & { texture: Texture }, dx: number, dy: number, color: number, alpha: number): Sprite {
  const sp = new Sprite(sh.texture);
  sp.tint = color;
  sp.alpha = alpha;
  sp.position.set(sh.x + dx, sh.y + dy);
  sp.width = sh.w;
  sp.height = sh.h;
  return sp;
}

export function makeFigureGlow(shapes: readonly GlowShape[], s: GlowStyle): Container {
  const strength = s.strength ?? 1;
  const c = new Container();
  const fills = new Graphics();
  c.addChild(fills);
  for (const layer of GLOW_FILL_LAYERS) {
    const alpha = layer.alpha * strength;
    for (const sh of shapes) {
      if (sh.kind === "silhouette") {
        // Дилатация настоящей формы: веер тонированных копий силуэта, смещённых на expand.
        for (const d of DILATE_DIRS) c.addChild(tintedCopy(sh, d.x * layer.expand, d.y * layer.expand, s.color, alpha));
      } else {
        fills
          .roundRect(sh.x - layer.expand, sh.y - layer.expand, sh.w + layer.expand * 2, sh.h + layer.expand * 2, sh.radius + layer.expand)
          .fill({ color: s.color, alpha });
      }
    }
  }
  // Точные силуэты стираются: свечение остаётся ТОЛЬКО ободком вокруг фигуры (как маска теней).
  const eraseRects = new Graphics();
  let hasEraseRects = false;
  for (const sh of shapes) {
    if (sh.kind === "silhouette") {
      const sp = tintedCopy(sh, 0, 0, 0xffffff, 1);
      sp.blendMode = "erase";
      c.addChild(sp);
    } else {
      eraseRects.roundRect(sh.x, sh.y, sh.w, sh.h, sh.radius).fill({ color: 0xffffff });
      hasEraseRects = true;
    }
  }
  if (hasEraseRects) {
    eraseRects.blendMode = "erase";
    c.addChild(eraseRects);
  }
  // Кеш в текстуру: erase действует внутри кеша и не дырявит стол; перерисовка — только при
  // пересоздании узла (смена состава фигуры), не по кадрам.
  (c as unknown as { cacheAsTexture?: (v: boolean) => void }).cacheAsTexture?.(true);
  return c;
}
