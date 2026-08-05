// ПОЛИТИКА ДРОП-ЗОНЫ — данные о том, КАК зона ловит груз (Caps-канон: конфиг способности, не код).
// Правила владельца (песочница): в колоду снепается ТОЛЬКО карта и только не сильно наклонённая
// (сильно — можно, но лишь пальцем); центр стола ловит по ЦЕНТРУ карты (край, заехавший на круг,
// не перебивает внешний круг); свободные стопки — по пальцу, как лежали. Чистая геометрия.

export interface Pt {
  x: number;
  y: number;
}

export interface DropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DropPolicy {
  /** Что считается попаданием: нахлёст фигуры (дефолт) / центр фигуры внутри зоны / только палец. */
  hit?: "overlap" | "center" | "finger";
  /** Форма области для hit "center": у круга считается вписанный круг, не квадрат бокса. */
  shape?: "rect" | "circle";
  /** Зона принимает только этот ВИД груза ("card"): фишку в колоду не засунуть вообще. */
  only?: string;
  /** Порог наклона груза (°): сильнее — хит деградирует до "finger" (впихнуть можно, снепа нет). */
  maxTilt?: number;
  /** Визуальный магнит: пока зона — цель, груз ведётся пружиной к её центру. */
  magnet?: boolean;
}

/** Груз над зонами: прямоугольник фигуры, палец, вид и наклон (положение на столе, не полёт). */
export interface DropProbe {
  rect: DropRect;
  finger: Pt;
  kind?: string;
  tiltDeg?: number;
}

/** Площадь пересечения прямоугольников. 0 — не пересекаются. */
export function rectOverlap(a: DropRect, b: DropRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function containsPt(r: DropRect, p: Pt): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Отклонение наклона от «ровно» (0..90°): перевёрнутая на 180° карта — ровная, рубашка симметрична. */
export function tiltDev(deg: number): number {
  const m = ((deg % 180) + 180) % 180;
  return Math.min(m, 180 - m);
}

function insideShape(box: DropRect, shape: DropPolicy["shape"], p: Pt): boolean {
  if (!containsPt(box, p)) return false;
  if (shape !== "circle") return true;
  const r = Math.min(box.w, box.h) / 2;
  return (p.x - (box.x + box.w / 2)) ** 2 + (p.y - (box.y + box.h / 2)) ** 2 <= r * r;
}

/**
 * Очки попадания груза в зону по её политике; null — мимо (или груз не того вида). Валюта очков
 * одна на все политики — площадь нахлёста (+0.5 за палец внутри), чтобы зоны с разными правилами
 * честно соревновались между собой; политика меняет только УСЛОВИЕ попадания.
 */
export function zoneHitScore(policy: DropPolicy | undefined, box: DropRect, probe: DropProbe): number | null {
  if (policy?.only && probe.kind !== policy.only) return null;
  const fingerIn = insideShape(box, policy?.shape, probe.finger);
  let hit = policy?.hit ?? "overlap";
  if (hit !== "finger" && policy?.maxTilt !== undefined && tiltDev(probe.tiltDeg ?? 0) > policy.maxTilt) hit = "finger";
  const caught =
    hit === "overlap"
      ? rectOverlap(box, probe.rect) > 0 || fingerIn
      : hit === "center"
        ? insideShape(box, policy?.shape, { x: probe.rect.x + probe.rect.w / 2, y: probe.rect.y + probe.rect.h / 2 }) || fingerIn
        : fingerIn;
  if (!caught) return null;
  return rectOverlap(box, probe.rect) + (fingerIn ? 0.5 : 0);
}
