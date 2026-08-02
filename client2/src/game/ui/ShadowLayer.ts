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
  private readonly mask = new Graphics();
  private readonly fill = new Graphics();
  /**
   * Тени-КАРТИНКИ: предмет, чья форма не выражается геометрией (шахматная фигура), отбрасывает
   * собственный снимок — один в один он сам, только тёмный. В общую маску такой снимок не положить:
   * она стенсильная и альфы не видит, снимок лёг бы прямоугольником. Поэтому они рисуются рядом,
   * своим слоем, и на пересечении двух таких теней цвет складывается — цена точной формы.
   */
  private readonly images = new Container();
  private readonly pool: Sprite[] = [];

  constructor() {
    this.root.addChild(this.mask, this.fill, this.images);
    this.fill.mask = this.mask;
  }

  /** Пересобрать тень уровня из силуэтов (каждый кадр — карты двигаются). */
  update(shapes: readonly ShadowShape[], w: number, h: number): void {
    this.mask.clear();
    let img = 0;
    for (const s of shapes) {
      if (!s.image || s.poly) continue;
      const sp = this.sprite(img++);
      sp.texture = s.image.texture as Texture;
      // Картинка ставится туда же, где нарисован предмет: центр его габарита относительно центра
      // тени, повёрнутый вместе с ней.
      const cx = (s.image.bx + s.image.bw / 2) * s.image.k;
      const cy = (s.image.by + s.image.bh / 2) * s.image.k;
      const cos = Math.cos(s.rot);
      const sin = Math.sin(s.rot);
      sp.position.set(s.x + cx * cos - cy * sin, s.y + cx * sin + cy * cos);
      sp.rotation = s.rot;
      sp.width = s.image.bw * s.image.k;
      sp.height = s.image.bh * s.image.k;
      sp.visible = true;
    }
    for (let i = img; i < this.pool.length; i++) this.pool[i]!.visible = false;
    for (const s of shapes) {
      if (s.image && !s.poly) continue; // у этого тень — картинка, в геометрию он не идёт
      if (s.round && !s.poly) {
        // Эллипс — для круглых фишек и овальных подставок фигур (не карточный прямоугольник).
        this.mask.ellipse(s.x, s.y, s.hw, s.hh).fill({ color: 0xffffff });
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
          this.mask.poly(pts).fill({ color: 0xffffff });
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
      this.mask.poly(pts).fill({ color: 0xffffff });
    }
    this.fill.clear();
    if (shapes.length > 0) {
      this.fill.rect(-200, -200, w + 400, h + 400).fill({ color: SHADOW_COLOR, alpha: SHADOW_ALPHA });
    }
  }

  /** Спрайт из пула: тень едет каждый кадр, создавать его заново значило бы мусорить в цикле. */
  private sprite(i: number): Sprite {
    const have = this.pool[i];
    if (have) return have;
    const sp = new Sprite();
    sp.anchor.set(0.5);
    sp.tint = SHADOW_COLOR;
    sp.alpha = SHADOW_ALPHA;
    this.pool.push(sp);
    this.images.addChild(sp);
    return sp;
  }

  /** Снести спрайты теней: слой умирает вместе со сценой, а текстуры чужие — их не трогаем. */
  destroy(): void {
    for (const sp of this.pool) sp.destroy();
    this.pool.length = 0;
  }
}
