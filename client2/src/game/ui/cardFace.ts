import { Graphics, type Texture } from "pixi.js";
import { TEX_H, TEX_W } from "../engine/constants";
import type { CardBackId } from "../cardBack";
import type { FaceStyle } from "../engine/cardTextures";
import type { CardTextureCache } from "./CardTextureCache";

// ЛИЦО КАРТЫ — выбор текстуры и статичные украшения (надрыв, замок). Чистые функции над
// описанием лица: карта отдаёт СВОИ поля (значение, рубашку, маскировку), сюда — какой пиксель
// показать. Ключ и текстура не могут разъехаться: ветки перечислены в одном порядке и по одним
// условиям в faceKeyOf и plainFaceTexOf.

export interface FaceLook {
  tex: CardTextureCache;
  card: string; // значение (ранг+масть); "" — придержано
  back: CardBackId;
  faceStyle: FaceStyle;
  fourColor: boolean;
  custom: string; // id кастом-лица (реестр CUSTOM_FACES); "" — обычная числовая карта
  masked: boolean; // показывать МАСКУ вместо лица (значения нет или оно секретно)
}

/** Ключ лица — ровно те параметры, от которых лицо зависит. Им же ключуется облако пыли. */
export function faceKeyOf(l: FaceLook, faceUp: boolean): string {
  if (!faceUp) return `back:${l.back}`;
  if (l.masked) return "hidden";
  if (l.custom && l.tex.customFace(l.custom)) return `custom:${l.custom}`;
  return `face:${l.card}|${l.fourColor ? 1 : 0}|${l.faceStyle}`;
}

/** Лицо БЕЗ учёта цензуры — то, что карта показала бы, не будь на ней пыли. Из него же строится
 *  облако пыли: смазывать надо именно это. */
export function plainFaceTexOf(l: FaceLook, faceUp: boolean): Texture {
  if (!faceUp) return l.tex.back(l.back);
  if (l.masked) return l.tex.hiddenFace(); // значения нет/оно секретно → статичный фак
  if (l.custom) {
    const t = l.tex.customFace(l.custom);
    if (t) return t; // неизвестный id → падаем на обычное число
  }
  return l.tex.face(l.card, l.fourColor, l.faceStyle);
}

/**
 * Что реально печатается в спрайт. Под живой пылью (`dustShown`) — ЧИСТАЯ подложка, а не лицо:
 * иначе видно и то, и другое сразу, и цензура перестаёт быть цензурой. Подложка подменяется ровно
 * тогда, когда пыль реально будет нарисована — перевёрнутая зацензуренная карта показывает
 * рубашку, а не пустую пластину.
 */
export function faceTexOf(l: FaceLook, faceUp: boolean, dustShown: boolean): Texture {
  if (dustShown) return l.tex.hiddenBg();
  return plainFaceTexOf(l, faceUp);
}

/** Надрыв «порванной» карты: зигзаг светлой бумаги с тёмной прожилкой по центру. */
export function buildTear(): Graphics {
  const g = new Graphics();
  const steps = 9;
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = -TEX_H / 2 + (TEX_H * i) / steps;
    pts.push((i % 2 ? -1 : 1) * 12, y);
  }
  g.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  g.stroke({ width: 10, color: 0xefe6d0 });
  g.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  g.stroke({ width: 3, color: 0x3a2f1f });
  return g;
}

/** Замочек недоступного флипа — в правом верхнем углу пластины. */
export function buildLock(): Graphics {
  const g = new Graphics();
  const x = TEX_W / 2 - 30;
  const y = -TEX_H / 2 + 36;
  g.arc(x, y - 6, 9, Math.PI, 0).stroke({ width: 4, color: 0x1e1e1e });
  g.roundRect(x - 14, y - 6, 28, 22, 4).fill({ color: 0x1e1e1e });
  g.circle(x, y + 3, 3).fill({ color: 0xd0c090 });
  return g;
}
