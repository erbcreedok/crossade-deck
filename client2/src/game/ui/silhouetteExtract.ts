import { ColorMatrixFilter, Container, Texture } from "pixi.js";
import type { Renderer } from "pixi.js";

// СНЯТЬ ТЕНЬ С САМОГО ПРЕДМЕТА: нарисовать его и оставить картинку.
//
// Тень предмета — это ОН САМ, только тёмный. Ни контур по типу («вот так выглядит шахматная
// фигура»), ни обводка по альфе многоугольником не годятся: первое даёт коню тень пешки, второе —
// ступенчатую аппроксимацию, в которой от коня не остаётся ни морды, ни ушей. Единственная форма,
// совпадающая с предметом один в один, — его собственная картинка.
//
// Снимок делается ОДИН РАЗ на вид предмета и кэшируется: он рисует в текстуру, и в кадре такому не
// место. Неудача не кэшируется — рендерера может ещё не быть, и запомнить «формы нет» навсегда
// значило бы потерять её из-за порядка сборки.

export interface OwnShadow {
  /** Картинка предмета — она же его тень. */
  texture: Texture;
  /** ОДНОЦВЕТНАЯ (белая) версия той же формы — для свечения: tint по белому даёт чистый цвет,
   *  по рисунку с тёмными пикселями — грязь. Альфа один в один с предметом. */
  white: Texture | null;
  /** Габарит визуала в его ЛОКАЛЬНЫХ координатах: по нему картинка ставится туда же, где предмет. */
  bounds: { x: number; y: number; width: number; height: number };
}

const cache = new Map<string, OwnShadow>();

/** Тень предмета по его же визуалу. `key` — вид предмета (тип + размер), по нему и кэш. */
export function ownShadowOf(renderer: Renderer | null | undefined, key: string, build: (root: Container) => void): OwnShadow | null {
  const hit = cache.get(key);
  if (hit) return hit;
  const shape = extract(renderer, build);
  if (shape) cache.set(key, shape);
  return shape;
}

/** Забыть снятые тени. Нужен тестам и пересборке витрины: тот же ключ — другой визуал. */
export function clearOwnShadows(): void {
  for (const s of cache.values()) {
    s.texture.destroy(true);
    s.white?.destroy(true);
  }
  cache.clear();
}

function extract(renderer: Renderer | null | undefined, build: (root: Container) => void): OwnShadow | null {
  if (!renderer?.extract) return null;
  const root = new Container();
  try {
    build(root);
    const b = root.getLocalBounds();
    if (!(b.width > 0) || !(b.height > 0)) return null;
    const texture = renderer.extract.texture({ target: root, resolution: 2 });
    // Белая версия: та же форма, цвет выбелен фильтром (rgb = альфа, premultiplied) — для glow.
    let white: Texture | null = null;
    try {
      const bleach = new ColorMatrixFilter();
      bleach.matrix = [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
      root.filters = [bleach];
      white = renderer.extract.texture({ target: root, resolution: 2 });
      root.filters = [];
    } catch {
      white = null; // без белой формы glow обойдётся футпринтом — тень важнее, её не роняем
    }
    return { texture, white, bounds: { x: b.x, y: b.y, width: b.width, height: b.height } };
  } catch {
    // Снять нечем (нет контекста, шрифт ещё не готов) — не повод остаться без тени: предмет
    // обойдётся своим габаритом, а картинка снимется на следующей сборке.
    return null;
  } finally {
    root.destroy({ children: true });
  }
}
