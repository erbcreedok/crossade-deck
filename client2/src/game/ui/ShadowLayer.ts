import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { CARD_CORNER, SHADOW_ALPHA, SHADOW_COLOR, TEX_W } from "../engine/constants";
import type { ShadowShape } from "./Card";

// Слитая тень одного УРОВНЯ. Главное правило: тени НЕ складывают альфу. N полупрозрачных
// силуэтов, наезжая друг на друга, темнели бы на каждом наложении (грязь под плотной стопкой).
// Лечится не прозрачностью, а порядком: силуэты собираются в МАСКУ (их объединение), и сквозь
// неё ОДИН раз заливается непрозрачный прямоугольник. Сколько бы теней ни пересеклось, заливка
// ложится ровно один раз — стандартный приём merged shadows (как в боевом движке).
//
// Из общей маски выпадают двое, и оба по одной причине — их форму она выразить не может:
//
//   КАРТИНКА. Тень фигуры — это она сама, только тёмная. Маска стенсильная, альфы не видит, и
//   снимок лёг бы в неё прямоугольником.
//   РЕЗ. Пока предмет уничтожают, маска эффекта его РЕЖЕТ. Объединение резать нечем: сложить
//   формы стенсиль умеет, вычесть — нет. Раньше рез просто ПОДМЕНЯЛ форму тени: у карты это сходило
//   с рук (полосы шреддера и так в её границах), а у круглой фишки тень на глазах становилась
//   прямоугольной.
//
// Оба случая рисуются своим спрайтом/фигурой с маской. Цена названа прямо: две ТАКИЕ тени,
// наехав друг на друга, потемнеют. Это редкий кадр (предмет в этот момент исчезает), и он честнее,
// чем тень не той формы.
export class ShadowLayer {
  readonly root = new Container();
  private readonly mask = new Graphics();
  private readonly fill = new Graphics();
  private readonly solo = new Container();
  private readonly pool: { sprite: Sprite; shape: Graphics; cut: Graphics }[] = [];

  constructor() {
    this.root.addChild(this.mask, this.fill, this.solo);
    this.fill.mask = this.mask;
  }

  /** Пересобрать тень уровня из силуэтов (каждый кадр — карты двигаются). */
  update(shapes: readonly ShadowShape[], w: number, h: number): void {
    this.mask.clear();
    let n = 0;
    for (const s of shapes) {
      if (!alone(s)) continue;
      this.paintAlone(this.entry(n++), s);
    }
    for (let i = n; i < this.pool.length; i++) this.hide(this.pool[i]!);

    for (const s of shapes) {
      if (alone(s)) continue;
      silhouette(this.mask, s);
    }
    // Габарит заливки — по самим силуэтам (+контент как пол), а НЕ фиксированный прямоугольник
    // w×h: карта в драге уходит за контент, и w×h обрезал бы её тень на кромке.
    this.fill.clear();
    const b = mergedFillBounds(shapes, w, h);
    if (b) this.fill.rect(b.x, b.y, b.w, b.h).fill({ color: SHADOW_COLOR, alpha: SHADOW_ALPHA });
  }

  /** Тень, которой не место в общей маске: своя форма плюс, если предмет режут, свой рез. */
  private paintAlone(e: { sprite: Sprite; shape: Graphics; cut: Graphics }, s: ShadowShape): void {
    const img = s.image;
    if (img) {
      e.shape.visible = false;
      e.sprite.visible = true;
      e.sprite.texture = img.texture as Texture;
      // Картинка ставится туда же, где нарисован предмет: центр его габарита относительно центра
      // тени, повёрнутый вместе с ней.
      const c = rotate((img.bx + img.bw / 2) * img.k, (img.by + img.bh / 2) * img.k, s.rot);
      e.sprite.position.set(s.x + c.x, s.y + c.y);
      e.sprite.rotation = s.rot;
      e.sprite.width = img.bw * img.k;
      e.sprite.height = img.bh * img.k;
    } else {
      e.sprite.visible = false;
      e.shape.visible = true;
      e.shape.clear();
      silhouette(e.shape, s, { color: SHADOW_COLOR, alpha: SHADOW_ALPHA });
    }
    const target = img ? e.sprite : e.shape;
    if (!s.poly) {
      target.mask = null;
      e.cut.visible = false;
      return;
    }
    e.cut.visible = true;
    e.cut.clear();
    for (const pts of maskPolys(s)) e.cut.poly(pts).fill({ color: 0xffffff });
    target.mask = e.cut;
  }

  private entry(i: number): { sprite: Sprite; shape: Graphics; cut: Graphics } {
    const have = this.pool[i];
    if (have) return have;
    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    sprite.tint = SHADOW_COLOR;
    sprite.alpha = SHADOW_ALPHA;
    const e = { sprite, shape: new Graphics(), cut: new Graphics() };
    this.solo.addChild(e.sprite, e.shape, e.cut);
    this.pool.push(e);
    return e;
  }

  private hide(e: { sprite: Sprite; shape: Graphics; cut: Graphics }): void {
    e.sprite.visible = false;
    e.shape.visible = false;
    e.cut.visible = false;
    e.sprite.mask = null;
    e.shape.mask = null;
  }

  /** Снести узлы: слой умирает вместе со сценой, а текстуры чужие — их не трогаем. */
  destroy(): void {
    for (const e of this.pool) {
      e.sprite.destroy();
      e.shape.destroy();
      e.cut.destroy();
    }
    this.pool.length = 0;
  }
}

/** Рисуется ли тень отдельно от общей маски. */
function alone(s: ShadowShape): boolean {
  return Boolean(s.image) || Boolean(s.poly);
}

/**
 * Габарит заливки слитой тени: объединение силуэтов (кроме «одиночек») с полом в прямоугольник
 * контента w×h. Заливка ОБЯЗАНА накрывать все силуэты — иначе тень карты, уведённой в драге за
 * контент, обрезается по краю w×h. r с запасом на поворот силуэта. null — сливать нечего.
 */
export function mergedFillBounds(
  shapes: readonly ShadowShape[],
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } | null {
  let minX = 0;
  let minY = 0;
  let maxX = w;
  let maxY = h;
  let any = false;
  for (const s of shapes) {
    if (alone(s)) continue;
    any = true;
    const r = Math.hypot(s.hw, s.hh) + 4;
    if (s.x - r < minX) minX = s.x - r;
    if (s.y - r < minY) minY = s.y - r;
    if (s.x + r > maxX) maxX = s.x + r;
    if (s.y + r > maxY) maxY = s.y + r;
  }
  return any ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}

function rotate(x: number, y: number, a: number): { x: number; y: number } {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Полигоны маски эффекта в координатах слоя: те же множители, что у самого предмета. */
function maskPolys(s: ShadowShape): number[][] {
  const kx = s.polyK ?? s.hw / (TEX_W / 2);
  const ky = s.polyKy ?? kx;
  return (s.poly ?? []).map((poly) => {
    const pts: number[] = [];
    for (let i = 0; i < poly.length; i += 2) {
      const p = rotate(poly[i]! * kx, poly[i + 1]! * ky, s.rot);
      pts.push(s.x + p.x, s.y + p.y);
    }
    return pts;
  });
}

/**
 * СОБСТВЕННАЯ форма тени: эллипс у круглого предмета, скруглённый прямоугольник у карты.
 *
 * Скругление берётся по РАДИУСУ САМОЙ КАРТЫ, а не «на глаз»: маске не нужны точные скругления, но
 * нужен ТОТ ЖЕ силуэт — иначе тень выдаёт, что она не от этой карты.
 */
function silhouette(g: Graphics, s: ShadowShape, style: { color: number; alpha?: number } = { color: 0xffffff }): void {
  if (s.round) {
    g.ellipse(s.x, s.y, s.hw, s.hh).fill(style);
    return;
  }
  const r = CARD_CORNER * (s.hw / (TEX_W / 2));
  const SEG = 4; // сегментов на угол: больше — незаметно, меньше — видны грани
  const corners: Array<[number, number, number]> = [
    [s.hw - r, -s.hh + r, -Math.PI / 2],
    [s.hw - r, s.hh - r, 0],
    [-s.hw + r, s.hh - r, Math.PI / 2],
    [-s.hw + r, -s.hh + r, Math.PI],
  ];
  const pts: number[] = [];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= SEG; k++) {
      const a = a0 + (Math.PI / 2) * (k / SEG);
      const p = rotate(cx + Math.cos(a) * r, cy + Math.sin(a) * r, s.rot);
      pts.push(s.x + p.x, s.y + p.y);
    }
  }
  g.poly(pts).fill(style);
}
