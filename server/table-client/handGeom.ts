// ГЕОМЕТРИЯ МОЕЙ РУКИ — где на стекле стоит каждая карта руки внизу экрана.
//
// Зависит только от размера стекла и позы руки (веер, ряд, стопка, спрятана), поэтому считается чистыми
// функциями: ни DOM, ни состояния экрана. Экран приносит размер и позу и получает места.

import type { Pose } from "./felt.js";
import { BAR, CARD, HAND_MAX_PX, HAND_PAD, HAND_ROOM, HUD_CARDS, HUD_FAN, HUD_GAP, HUD_HEIGHT_SHARE, HUD_MARGIN, HUD_UNIT_FRACTION, HUD_UNIT_MAX, TUCK_TIP, type Geom, type Slot } from "./screenConst.js";

/** Размер стекла в пикселях. */
export interface Glass {
  w: number;
  h: number;
}

/** ЕДИНИЦА HUD в пикселях — от неё считаются бар, рука и подписи. */
export const hudUnitOf = (g: Glass): number => {
  return Math.max(1, Math.round(Math.min(HUD_UNIT_MAX, Math.min(g.w, g.h) * HUD_UNIT_FRACTION, g.h * HUD_HEIGHT_SHARE)));
};
/** Во сколько пикселей укладывается полоса руки: на телефоне — весь кадр, на широком — контейнер по центру. */
export const handWideOf = (g: Glass): number => Math.min(g.w, HAND_MAX_PX);
/** Высота нижнего бара — в единицах HUD. */
export const barHeightU = (): number => BAR.size + 2 * BAR.pad;

/** ГДЕ СТОИТ КАЖДАЯ КАРТА РУКИ НА СТЕКЛЕ — на дуге, если веер, и в ряд, если нет. */
export function handPlan(pose: Pose, n: number, w: number, h: number, roomU: number): Slot[] {
  // СЖАТЫ — все карты стопкой за верхней: видна одна.
  if (pose.shrink) return Array.from({ length: n }, () => ({ x: 0, y: 0, angle: 0 }));
  const apart = HUD_FAN.apart * w;
  const mid = (n - 1) / 2;
  if (!pose.fan) {
    const step = n > 1 ? Math.min(apart, Math.max(0, roomU - 2 * (w / 2 + HUD_FAN.edge * w)) / (n - 1)) : 0;
    return Array.from({ length: n }, (_, i) => ({ x: (i - mid) * step, y: 0, angle: 0 }));
  }
  const R = HUD_FAN.radius * h;
  const deg = (rad: number) => (rad * 180) / Math.PI;
  const most = deg(2 * Math.asin(Math.min(1, apart / (2 * R))));
  let step = 0;
  if (n > 1) {
    // Край считается по УГЛУ наклонной карты, а не по её середине — три прохода сходятся.
    let reach = w / 2;
    for (let pass = 0; pass < 3; pass += 1) {
      const chord = Math.max(0, Math.min(1, (roomU - 2 * (reach + HUD_FAN.edge * w)) / (2 * R)));
      step = Math.min(most, deg(2 * Math.asin(chord)) / (n - 1));
      const outer = ((step * (n - 1)) / 2 / 180) * Math.PI;
      reach = (w / 2) * Math.cos(outer) + (h / 2) * Math.sin(outer);
    }
  }
  return Array.from({ length: n }, (_, i) => {
    const angle = (i - mid) * step;
    const rad = (angle * Math.PI) / 180;
    return { x: R * Math.sin(rad), y: R * (1 - Math.cos(rad)), angle };
  });
}

/** Полоса моей руки: единица, масштаб, места карт и где она стоит над баром. */
export function handBoxOf(g: Glass, pose: Pose, count: number) {
  const u = hudUnitOf(g);
  const room = handWideOf(g) / u - 2 * HUD_MARGIN;
  const scale = Math.min(1, room / (HUD_CARDS * CARD.w * (1 + HUD_GAP)));
  const wide = Math.max(1, handWideOf(g) / u / scale);
  const plan = handPlan(pose, count, CARD.w, CARD.h, wide);
  const drop = plan.reduce((m, p) => Math.max(m, p.y), 0);
  const high = CARD.h + drop + 2 * HAND_PAD + HAND_ROOM;
  const barTop = g.h - barHeightU() * u;
  const shown = pose.tuck ? TUCK_TIP : Math.max(0, (high - HAND_ROOM) * scale - BAR.tuck);
  const cardsBottom = barTop + BAR.tuck * u + (pose.tuck ? Math.max(0, (high - HAND_ROOM) * scale * u - TUCK_TIP * u) : 0);
  const mid = cardsBottom + (HAND_ROOM - high / 2) * scale * u;
  return { u, scale, wide, plan, barTop, mid, shown };
}

export function mineGeomOf(g: Glass, pose: Pose, count: number, which: string): Geom {
  const { u, scale, barTop, mid, plan } = handBoxOf(g, pose, count);
  return {
    which, mirror: false, w: CARD.w * scale * u, h: CARD.h * scale * u, barTop,
    slots: plan.map((p) => ({ x: g.w / 2 + p.x * scale * u, y: mid + p.y * scale * u, angle: p.angle })),
  };
}
