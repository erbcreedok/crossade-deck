// МОДЕЛИ КАМЕРЫ — как игрок смотрит на стол. Ввод (мышь, клавиши, палец, потом гироскоп) превращается в четыре
// намерения — повернуть взгляд, приблизить, вернуть домой и повернуть стол (компас); всё остальное знает только состояние.
//
//   orbit  камера летает по сфере вокруг середины стола (`OrbitControls`) — как было;
//   head   камера — голова (по умолчанию): сидит у плеч стула, взгляд крутится на месте (yaw, pitch), приближение — наклон
//          к столу (шея тянется, держать долго нельзя: `NECK`), поэтому стоя голова выше, а приблизить можно ненадолго.
//          Отдельно — оптика: поле зрения уже, тело не двигается (платная, для сильных экранов);
//   top    вид сверху, как у 2D-стола: камера над серединой, поворот — повернуть стол, приближение — ниже к столу. Та же
//          шея: стоя камера выше, приблизить можно ненадолго (`NECK`), и остальные видят тело так же, как в `head`.

import { HEAD, NECK, NECK_LEN, type Point3 } from "../../server/src/table/bodies.js";

export type CamMode = "head" | "top" | "orbit";
export const CAM_MODES: readonly CamMode[] = ["head", "top", "orbit"];
export const CAM_LABEL: Record<CamMode, string> = { head: "голова", top: "сверху", orbit: "орбита" };

export const CAM = {
  /** Предел взгляда вверх-вниз, градусы (вниз — минус). */
  pitch: { min: -85, max: 15 },
  /** Поле зрения по вертикали: обычное, самое узкое (оптический зум) и в каких пределах игрок выбирает обычное в настройках. */
  fov: { base: 75, min: 20, view: { min: 65, max: 85 } },
  /** Единиц стола посадки на пиксель двух пальцев вверх-вниз. */
  seat: 0.012,
  /** Градусов взгляда на пиксель пальца или мыши. */
  look: 0.25,
  /** Шаг стрелок на клавиатуре, градусы. */
  key: 4,
  /** Насколько колесо и щипок приближают. */
  wheel: 0.0015,
  scroll: 0.004,
  /** Доля предела бокового сдвига головы на пиксель, на который сошлись два пальца вбок. */
  side: 0.004,
} as const;

/** Угол к диапазону `-180…180`. */
export const wrap = (a: number): number => ((((a + 180) % 360) + 360) % 360) - 180;

/** Насколько голова откидывается назад и вбок. `reach` — единиц стола назад от покоя при `lean = −1`, `up` — насколько при этом выше; `max` — на сколько градусов по кругу сдвигается голова при `side = ±1`. */
export const BACK = { reach: 3, up: 0.9, max: 40 } as const;

/**
 * Где голова, когда шея наклонена на `lean` и сдвинута на `side`.
 *
 *   lean  от −1 до 1: 0 — в покое; больше нуля — к середине стола и ниже; меньше — назад, от стола, и чуть выше. Голова идёт по
 *         радиусу (по линии «плечи — середина стола»);
 *   side  от −1 до 1: голова идёт по кругу вокруг середины стола, на том же расстоянии от неё, не дальше `BACK.max` градусов.
 */
export function headAt(sh: Point3, lean: number, side = 0): Point3 {
  const r = Math.hypot(sh.x, sh.y) || 1, inward = { x: -sh.x / r, y: -sh.y / r };
  const t = Math.max(-1, Math.min(1, lean));
  const up0 = NECK_LEN.up, d0 = Math.sqrt(Math.max(0, NECK_LEN.rest * NECK_LEN.rest - up0 * up0));
  let h: number, d: number;
  if (t >= 0) {
    h = sh.h + up0 + (HEAD.min - (sh.h + up0)) * t;
    const len = NECK_LEN.rest + NECK_LEN.reach * t, up = h - sh.h;
    d = Math.sqrt(Math.max(0, len * len - up * up));
  } else {
    const u = -t;
    h = sh.h + up0 + BACK.up * u;
    d = d0 - (d0 + BACK.reach) * u;
  }
  const at = { x: sh.x + inward.x * d, y: sh.y + inward.y * d };
  const a = (Math.max(-1, Math.min(1, side)) * BACK.max * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  return { x: at.x * c - at.y * sn, y: at.x * sn + at.y * c, h };
}

/** Взгляд из `from` в середину стола: угол вниз, градусы. */
export const pitchToCentre = (from: Point3): number => (-Math.atan2(from.h, Math.hypot(from.x, from.y) || 1) * 180) / Math.PI;

/** Шея: сколько держится натяг, сколько камера ещё возвращается и сколько шея отдыхает, мс. */
export interface Neck {
  held: number;
  back: number;
  rest: number;
}
export const neckNew = (): Neck => ({ held: 0, back: 0, rest: 0 });

/**
 * Шаг шеи за `dt` мс. Натяг дольше `NECK.free` держится `NECK.holdMs`, потом камера сама возвращается за `NECK.backMs`,
 * и `NECK.restMs` шея отдыхает: снова натянуть её нельзя. Возвращает новый наклон.
 */
export function neckStep(n: Neck, lean: number, dt: number): number {
  if (n.rest > 0) {
    n.rest = Math.max(0, n.rest - dt);
    return Math.min(lean, NECK.free);
  }
  if (n.back > 0) {
    n.back = Math.max(0, n.back - dt);
    const next = Math.max(0, lean - (dt / NECK.backMs));
    if (next <= NECK.free || n.back === 0) { n.back = 0; n.held = 0; n.rest = NECK.restMs; return Math.min(next, NECK.free); }
    return next;
  }
  if (lean <= NECK.free) { n.held = 0; return lean; }
  n.held += dt;
  if (n.held >= NECK.holdMs) n.back = NECK.backMs;
  return lean;
}

/** Насколько поле зрения сверху берёт стол, единиц стола от середины до края кадра по короткой стороне. */
export const TOP = { reach: 7.6, fov: 50 } as const;

/** Высота камеры сверху в покое: стол с кромкой влезает по короткой стороне кадра (`aspect` — ширина к высоте). */
export function topHeight(aspect: number, fovDeg: number, restScale: number): number {
  const half = Math.tan((fovDeg * Math.PI) / 360) * Math.min(1, Math.max(0.2, aspect));
  return (TOP.reach / half) * restScale;
}

/**
 * РАЗДВИЖКА КАРТ ПОД ВЕРХНИМ ГРИПОМ — вокруг грипа карты раздвинуты так, чтобы были видны номинал и масть, пока они не стоят и так свободно.
 *   `xs` — места карт по ширине руки (в ширинах карты), `f` — где грип (там же), `gap` — расстояние между соседними картами у грипа,
 *   `core` — сколько промежутков по обе стороны от грипа раздвинуты полностью, `fall` — на скольких промежутках раздвижка потом сходит на нет.
 * Считается по номерам карт, а не по расстоянию: густая стопка раскрывается в несколько карт вокруг грипа, а не на весь экран.
 * Крайние карты руки остаются на своих местах (ширина руки та же): места не хватает — остальные промежутки сжимаются.
 * Между картами, которым и так хватает места, ничего не меняется.
 */
/** `returnMs` — за сколько грип, отпущенный в стороне, плавно возвращается на место, а карты встают на обычные расстояния. */
export const PEEK = { gap: 0.42, core: 2.5, fall: 2, min: 10, returnMs: 5000 } as const;
/** Тесно ли картам: в среднем промежуток меньше `gap` (с запасом на сжатие краёв дуги). */
export const peekTight = (xs: readonly number[], gap: number = PEEK.gap): boolean => xs.length > 1 && (xs[xs.length - 1]! - xs[0]!) / (xs.length - 1) < gap * 0.92;
export function peekShift(xs: readonly number[], f: number | null, gap: number = PEEK.gap, core: number = PEEK.core, fall: number = PEEK.fall): number[] {
  const none = xs.map(() => 0);
  if (f === null || !peekTight(xs, gap)) return none;
  const n = xs.length;
  let at = 0;
  while (at < n - 2 && xs[at + 1]! < f) at += 1;
  const span = xs[at + 1]! - xs[at]!, jf = Math.max(0, Math.min(n - 1, at + (span > 1e-9 ? (f - xs[at]!) / span : 0)));
  const weight: number[] = [], space = Array.from({ length: n - 1 }, (_, i) => {
    const s = xs[i + 1]! - xs[i]!, w = Math.max(0, Math.min(1, 1 - Math.max(0, Math.abs(i + 0.5 - jf) - core) / fall));
    weight.push(w);
    return s + (Math.max(gap, s) - s) * w;
  });
  const whole = xs[n - 1]! - xs[0]!;
  let full = 0, rest = 0;
  space.forEach((v, i) => { if (weight[i]! >= 1) full += v; else rest += v; });
  // Крайние карты стоят на местах (ширина руки та же): полностью раздвинутые промежутки держат `gap`, пока хватает ширины, а остальные сжимаются;
  // не хватает — раздвинутым достаётся не больше 85% ширины руки, остальным остаток.
  const room = full < whole * 0.85 ? full : whole * 0.85, kFull = full > 0 ? room / full : 0, kRest = rest > 1e-9 ? (whole - room) / rest : 0;
  const out = [xs[0]!];
  for (let i = 0; i < n - 1; i += 1) out.push(out[i]! + space[i]! * (weight[i]! >= 1 ? kFull : kRest));
  return out.map((x, i) => x - xs[i]!);
}
