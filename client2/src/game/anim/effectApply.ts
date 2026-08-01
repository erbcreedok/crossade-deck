import { Graphics, type Container } from "pixi.js";
import type { EffectFrame } from "./destroyStyles";

// Наложение кадра эффекта на элемент — ОДИН путь для карты и для фишки.
//
// Раньше уничтожение у них было разное: карта расходилась маской, фишка просто тускнела и
// сжималась, и жили эти два эффекта в двух классах. Значит и любой новый способ («шреддер»,
// «улёт») пришлось бы писать дважды, а разъехались бы они, как водится, при первой же правке.
//
// Функция свободная, а не метод: у карты и фишки нет общего предка и заводить его ради двадцати
// строк было бы хуже — общий предок начал бы обрастать всем подряд.

/** Держатель маски. Объект, а не поле, потому что вызывающий хранит её у себя между кадрами. */
export interface MaskRef {
  g: Graphics | null;
}

/**
 * Применить кадр к УЗЛУ элемента. Тени тут нет и быть не может: она ВЫВОДИТСЯ из состояния предмета
 * (позиция, масштаб, маска) один раз за кадр, а не описывается заново под каждый эффект.
 */
export function applyEffect(root: Container, px: number, py: number, f: EffectFrame, mask: MaskRef): void {
  root.position.set(px + f.dx, py + f.dy);
  root.rotation += f.rot;
  root.alpha = f.alpha;
  if (f.scale !== 1) root.scale.set(root.scale.x * f.scale, root.scale.y * f.scale);

  if (f.mask) {
    if (!mask.g) {
      mask.g = new Graphics();
      root.addChild(mask.g);
      root.mask = mask.g;
    }
    mask.g.clear();
    for (const poly of f.mask) mask.g.poly(poly).fill(0xffffff);
  } else if (mask.g) {
    // Маску обязательно снимать: появление заканчивается обычным элементом, и застывшая шторка
    // «wipe» оставила бы его обрезанным навсегда.
    root.mask = null;
    mask.g.destroy();
    mask.g = null;
  }
}
