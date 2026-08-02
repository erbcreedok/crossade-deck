// СИЛУЭТ — форма тени, СНЯТАЯ с самого предмета.
//
// Рисовать контур по типу («вот так выглядит шахматная фигура») — подделка: один контур на все
// типы даёт коню тень пешки, а завтра машине — тень поезда. Единственный источник правды о форме
// предмета — то, что он нарисовал сам. Поэтому визуал снимается в пиксели, и форма читается по
// АЛЬФЕ: где непрозрачно — там предмет, где нет — там его нет.
//
// Пасс слитых теней (ui/ShadowLayer) собирает маску КОНТУРАМИ (стенсил), альфу он не видит: снимок,
// положенный в такую маску, ложится прямоугольником — это и было видно вместо коня. Поэтому альфа
// превращается в многоугольник ЗДЕСЬ, и дальше идёт обычным путём `poly`, которым уже ходят маски
// эффектов. Снимок делается один раз на вид предмета (silhouetteExtract.ts), в кадре его нет.

export interface AlphaBitmap {
  /** Альфа по пикселям, строка за строкой: `alpha[y * w + x]`, 0..255. */
  alpha: ArrayLike<number>;
  w: number;
  h: number;
}

export interface SilhouetteOptions {
  /** С какой альфы пиксель считается предметом. Ниже — кромка сглаживания, а не тело. */
  threshold?: number;
  /** На сколько вертикальных полос делить снимок. Больше — точнее контур и тяжелее маска. */
  columns?: number;
}

/**
 * Контур по альфе: для каждой вертикальной полосы — самый верхний и самый нижний непрозрачный
 * пиксель. Обход идёт по верхней кромке слева направо и по нижней обратно.
 *
 * Так контур повторяет ВЫРЕЗЫ формы (зубцы короны ферзя, шея коня) — там, где полоса пустее,
 * кромка проваливается внутрь. Чего этот способ не умеет: дырку ВНУТРИ силуэта (кольцо останется
 * залитым) и разрыв на две части (они соединятся перемычкой). Для тени это честнее, чем кажется:
 * тень рассеяна, и просвет в пару пикселей она не держит; а рисовать дырки означало бы городить
 * marching squares ради того, чего на столе не видно.
 *
 * Координаты — ПИКСЕЛЬНЫЕ, того же снимка. Переводит их в свои тот, кто снимал: только он знает
 * габарит визуала.
 */
export function alphaSilhouette(bm: AlphaBitmap, opts: SilhouetteOptions = {}): number[] | null {
  const { alpha, w, h } = bm;
  if (w <= 0 || h <= 0) return null;
  const threshold = opts.threshold ?? 24;
  const columns = Math.max(2, Math.floor(opts.columns ?? 24));

  const bands: Array<{ x: number; top: number; bottom: number }> = [];
  let minX = Infinity;
  let maxX = -Infinity;
  for (let b = 0; b < columns; b++) {
    const x0 = Math.floor((b * w) / columns);
    const x1 = Math.max(x0 + 1, Math.floor(((b + 1) * w) / columns));
    let top = Infinity;
    let bottom = -Infinity;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = x0; x < x1 && x < w; x++) {
        if ((alpha[row + x] ?? 0) < threshold) continue;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (bottom >= top) bands.push({ x: (x0 + x1) / 2, top, bottom: bottom + 1 });
  }
  if (bands.length < 2) return null;

  // Крайние полосы тянем до настоящей кромки: иначе силуэт получается уже предмета на полполосы.
  bands[0]!.x = minX;
  bands[bands.length - 1]!.x = maxX + 1;

  const pts: number[] = [];
  for (const b of bands) pts.push(b.x, b.top);
  for (let i = bands.length - 1; i >= 0; i--) pts.push(bands[i]!.x, bands[i]!.bottom);
  return pts;
}

export interface CastOptions {
  /** Во сколько тень короче предмета: она лежит на столе, а не висит за спиной. */
  flatten: number;
  /** Насколько ЗАВАЛЕНА в сторону от света, в долях высоты предмета. */
  shear: number;
}

/**
 * Положить силуэт СТОЯЩЕГО предмета на стол.
 *
 * Одного сплющивания мало: сплющенная копия остаётся ровно за предметом и им же закрывается —
 * фигура выглядит без тени. У стоящего предмета тень ЗАВАЛЕНА: ноги остаются на месте (предмет
 * стоит именно там), а всё, что выше, уезжает от источника света тем дальше, чем оно выше. Отсюда
 * и читается, что предмет стоит, а не лежит.
 *
 * Свет на этом столе — сверху справа (тот же, что у карточных теней), поэтому тень уходит влево.
 * Опора — самая нижняя точка контура: она и есть «пол» предмета.
 */
export function castOnTable(poly: readonly number[], o: CastOptions): number[] {
  let floor = -Infinity;
  for (let i = 1; i < poly.length; i += 2) floor = Math.max(floor, poly[i]!);
  const out: number[] = [];
  for (let i = 0; i < poly.length; i += 2) {
    const height = floor - poly[i + 1]!; // сколько эта точка над полом
    out.push(poly[i]! - height * o.shear, floor - height * o.flatten);
  }
  return out;
}
