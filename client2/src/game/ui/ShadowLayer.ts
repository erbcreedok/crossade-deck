import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { CARD_CORNER, SHADOW_ALPHA, SHADOW_COLOR, TEX_W } from "../engine/constants";
import type { ShadowShape } from "./Card";

// Слитая тень одного УРОВНЯ. Главное правило: тени НЕ складывают альфу. N полупрозрачных
// силуэтов, наезжая друг на друга, темнели бы на каждом наложении (грязь под плотной стопкой).
// Лечится не прозрачностью, а порядком: силуэты собираются в МАСКУ (их объединение), и сквозь
// неё ОДИН раз заливается непрозрачный прямоугольник. Сколько бы теней ни пересеклось, заливка
// ложится ровно один раз — стандартный приём merged shadows (как в боевом движке).
export class ShadowLayer {
  readonly root = new Container();
  /**
   * Маска — КОНТЕЙНЕР, а не одна Graphics: кроме фигур в неё кладутся СНИМКИ предметов (тень
   * шахматной фигуры — это она сама, приплюснутая). Заливка по-прежнему одна на весь слой, так что
   * пересечения не темнеют.
   */
  private readonly mask = new Container();
  private readonly shapes = new Graphics();
  private readonly stamps: Sprite[] = []; // снимки: переиспользуем, а не пересоздаём каждый кадр
  private readonly fill = new Graphics();

  constructor() {
    this.mask.addChild(this.shapes);
    this.root.addChild(this.mask, this.fill);
    this.fill.mask = this.mask;
  }

  /** Свободный спрайт-снимок из пула (маска пересобирается каждый кадр — новые не плодим). */
  private stamp(i: number): Sprite {
    let sp = this.stamps[i];
    if (!sp) {
      sp = new Sprite();
      sp.anchor.set(0.5);
      this.stamps.push(sp);
      this.mask.addChild(sp);
    }
    sp.visible = true;
    return sp;
  }

  /** Пересобрать тень уровня из силуэтов (каждый кадр — карты двигаются). */
  update(shapes: readonly ShadowShape[], w: number, h: number): void {
    this.shapes.clear();
    for (const sp of this.stamps) sp.visible = false;
    let stampAt = 0;
    for (const s of shapes) {
      if (s.tex) {
        // СНИМОК предмета: его собственный силуэт, приплюснутый и положенный туда, где предмет
        // стоит. Ничего рукописного — что нарисовано, то и отбрасывает тень.
        const sp = this.stamp(stampAt++);
        sp.texture = s.tex as Texture;
        sp.position.set(s.x, s.y);
        sp.rotation = s.rot;
        sp.width = s.hw * 2;
        sp.height = s.hh * 2 * (s.flatten ?? 1);
        continue;
      }
      if (s.round && !s.poly) {
        // Эллипс — для круглых фишек и овальных подставок фигур (не карточный прямоугольник).
        this.shapes.ellipse(s.x, s.y, s.hw, s.hh).fill({ color: 0xffffff });
        continue;
      }
      if (s.poly) {
        // Форма от эффекта: полигоны приходят в координатах ТЕКСТУРЫ, поэтому переводим их в
        // масштаб тени — она может быть крупнее предмета (высота) или мельче (догорание).
        // Карточная форма приходит в координатах текстуры, своя (силуэт предмета) — в своих:
        // множитель приносит тот, кто форму задал.
        const k = s.polyK ?? s.hw / (TEX_W / 2);
        const ky = s.polyKy ?? k; // меньше k — силуэт приплюснут: тень легла на стол
        const c0 = Math.cos(s.rot);
        const s0 = Math.sin(s.rot);
        for (const poly of s.poly) {
          const pts: number[] = [];
          for (let i = 0; i < poly.length; i += 2) {
            const lx = poly[i]! * k;
            const ly = poly[i + 1]! * ky;
            pts.push(s.x + lx * c0 - ly * s0, s.y + lx * s0 + ly * c0);
          }
          this.shapes.poly(pts).fill({ color: 0xffffff });
        }
        continue;
      }
      // Скруглённый прямоугольник — по РАДИУСУ САМОЙ КАРТЫ, а не «на глаз».
      //
      // Раньше здесь был восьмиугольник со срезом в 22% короткой стороны: срез получался в разы
      // крупнее скругления карты (16px на текстуре), и тень читалась как гранёная фигура под
      // гладкой картой. Маске не нужны точные скругления, но нужен ТОТ ЖЕ силуэт — иначе тень
      // выдаёт, что она не от этой карты.
      const cos = Math.cos(s.rot);
      const sin = Math.sin(s.rot);
      const r = CARD_CORNER * (s.hw / (TEX_W / 2));
      const SEG = 4; // сегментов на угол: больше — незаметно, меньше — снова грани
      const local: Array<[number, number]> = [];
      const corners: Array<[number, number, number]> = [
        [s.hw - r, -s.hh + r, -Math.PI / 2],
        [s.hw - r, s.hh - r, 0],
        [-s.hw + r, s.hh - r, Math.PI / 2],
        [-s.hw + r, -s.hh + r, Math.PI],
      ];
      for (const [cx, cy, a0] of corners) {
        for (let k = 0; k <= SEG; k++) {
          const a = a0 + (Math.PI / 2) * (k / SEG);
          local.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
      }
      const pts: number[] = [];
      for (const [lx, ly] of local) pts.push(s.x + lx * cos - ly * sin, s.y + lx * sin + ly * cos);
      this.shapes.poly(pts).fill({ color: 0xffffff });
    }
    this.fill.clear();
    if (shapes.length > 0) {
      this.fill.rect(-200, -200, w + 400, h + 400).fill({ color: SHADOW_COLOR, alpha: SHADOW_ALPHA });
    }
  }
}
