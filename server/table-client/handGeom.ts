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

/**
 * ПОЗА ПОД ПАЛЬЦЕМ — две оси вместо трёх кнопок (ручка на углу руки).
 *   `wide`  0 — стопкой (сжата), 1 — широко;
 *   `lift`  0 — спрятана, 0.5 — веер, 1 — выровнена в ряд. У узкой руки веера нет: 0 — спрятана, выше — показана.
 * Под пальцем оси плавные, отпустил — поза садится в ближайшую ступень (`snapPose`): по сети идёт та же
 * поза из трёх флажков, что и от кнопок, и остальные видят её как раньше.
 */
export interface PoseBlend {
  wide: number;
  lift: number;
}

/** Ступень, на которой стоит поза. */
export const blendOf = (p: Pose): PoseBlend => ({ wide: p.shrink ? 0 : 1, lift: p.tuck ? 0 : p.shrink || !p.fan ? 1 : 0.5 });

/** Ближайшая ступень. Веер, пока спрятана или сжата, остаётся прежним — вернётся, когда рука встанет широко. */
export function snapPose(b: PoseBlend, was: Pose): Pose {
  const wide = b.wide >= 0.5;
  const lift = wide ? (b.lift < 0.25 ? 0 : b.lift < 0.75 ? 0.5 : 1) : b.lift < 0.5 ? 0 : 1;
  return { fan: wide && lift > 0 ? lift === 0.5 : was.fan, shrink: !wide, tuck: lift === 0 };
}

/** Насколько рука ушла вниз: 1 — спрятана, 0 — стоит. */
export const tuckOf = (b: PoseBlend): number => Math.max(0, Math.min(1, 1 - b.lift / 0.5));

/** Места карт между ступенями: стопка ↔ (ряд ↔ веер) по двум осям. `fanBelow` — веер ли под спрятанной рукой. */
export function handPlanBlend(b: PoseBlend, fanBelow: boolean, n: number, w: number, h: number, roomU: number): Slot[] {
  const fanAmt = b.lift >= 0.5 ? Math.max(0, Math.min(1, 2 * (1 - b.lift))) : fanBelow ? 1 : 0;
  const wide = Math.max(0, Math.min(1, b.wide));
  const fan = handPlan({ fan: true, shrink: false, tuck: false }, n, w, h, roomU);
  const row = handPlan({ fan: false, shrink: false, tuck: false }, n, w, h, roomU);
  return fan.map((f, i) => {
    const r = row[i]!;
    const x = r.x + (f.x - r.x) * fanAmt, y = r.y + (f.y - r.y) * fanAmt, angle = r.angle + (f.angle - r.angle) * fanAmt;
    return { x: x * wide, y: y * wide, angle: angle * wide };
  });
}

/**
 * Полоса моей руки: единица, масштаб, места карт и где она стоит над баром. `blend` — поза под пальцем;
 * `lift` — на сколько пикселей поднят пол руки (системный отступ снизу, клавиатура). Единица от подъёма
 * не зависит: бар над отступом той же высоты, что и без него.
 */
export function handBoxOf(g: Glass, pose: Pose, count: number, blend?: PoseBlend, lift = 0) {
  const u = hudUnitOf(g);
  const room = handWideOf(g) / u - 2 * HUD_MARGIN;
  const scale = Math.min(1, room / (HUD_CARDS * CARD.w * (1 + HUD_GAP)));
  const wide = Math.max(1, handWideOf(g) / u / scale);
  const plan = blend ? handPlanBlend(blend, pose.fan, count, CARD.w, CARD.h, wide) : handPlan(pose, count, CARD.w, CARD.h, wide);
  const drop = plan.reduce((m, p) => Math.max(m, p.y), 0);
  const high = CARD.h + drop + 2 * HAND_PAD + HAND_ROOM;
  const barTop = g.h - lift - barHeightU() * u;
  const t = blend ? tuckOf(blend) : pose.tuck ? 1 : 0;
  const up = Math.max(0, (high - HAND_ROOM) * scale - BAR.tuck);
  const shown = up + (TUCK_TIP - up) * t;
  const cardsBottom = barTop + BAR.tuck * u + t * Math.max(0, (high - HAND_ROOM) * scale * u - TUCK_TIP * u);
  const mid = cardsBottom + (HAND_ROOM - high / 2) * scale * u;
  return { u, scale, wide, plan, barTop, mid, shown };
}

export function mineGeomOf(g: Glass, pose: Pose, count: number, which: string, blend?: PoseBlend, lift = 0): Geom {
  const { u, scale, barTop, mid, plan } = handBoxOf(g, pose, count, blend, lift);
  return {
    which, mirror: false, w: CARD.w * scale * u, h: CARD.h * scale * u, barTop,
    slots: plan.map((p) => ({ x: g.w / 2 + p.x * scale * u, y: mid + p.y * scale * u, angle: p.angle })),
  };
}
