import { Container, Graphics } from "pixi.js";
import { SHADOW_ALPHA, SHADOW_COLOR } from "../engine/constants";
import type { ShadowShape } from "./Card";

// Слитая тень одного УРОВНЯ. Главное правило: тени НЕ складывают альфу. N полупрозрачных
// силуэтов, наезжая друг на друга, темнели бы на каждом наложении (грязь под плотной стопкой).
// Лечится не прозрачностью, а порядком: силуэты собираются в МАСКУ (их объединение), и сквозь
// неё ОДИН раз заливается непрозрачный прямоугольник. Сколько бы теней ни пересеклось, заливка
// ложится ровно один раз — стандартный приём merged shadows (как в боевом движке).
export class ShadowLayer {
  readonly root = new Container();
  private readonly mask = new Graphics();
  private readonly fill = new Graphics();

  constructor() {
    this.root.addChild(this.mask, this.fill);
    this.fill.mask = this.mask;
  }

  /** Пересобрать тень уровня из силуэтов (каждый кадр — карты двигаются). */
  update(shapes: readonly ShadowShape[], w: number, h: number): void {
    this.mask.clear();
    for (const s of shapes) {
      if (s.round) {
        // Эллипс — для круглых фишек и овальных подставок фигур (не карточный прямоугольник).
        this.mask.ellipse(s.x, s.y, s.hw, s.hh).fill({ color: 0xffffff });
        continue;
      }
      // Восьмиугольник (прямоугольник со срезанными углами) — точные скругления маске не нужны.
      const c = Math.min(s.hw, s.hh) * 0.22;
      const cos = Math.cos(s.rot);
      const sin = Math.sin(s.rot);
      const local: Array<[number, number]> = [
        [-s.hw + c, -s.hh],
        [s.hw - c, -s.hh],
        [s.hw, -s.hh + c],
        [s.hw, s.hh - c],
        [s.hw - c, s.hh],
        [-s.hw + c, s.hh],
        [-s.hw, s.hh - c],
        [-s.hw, -s.hh + c],
      ];
      const pts: number[] = [];
      for (const [lx, ly] of local) pts.push(s.x + lx * cos - ly * sin, s.y + lx * sin + ly * cos);
      this.mask.poly(pts).fill({ color: 0xffffff });
    }
    this.fill.clear();
    if (shapes.length > 0) {
      this.fill.rect(-200, -200, w + 400, h + 400).fill({ color: SHADOW_COLOR, alpha: SHADOW_ALPHA });
    }
  }
}
