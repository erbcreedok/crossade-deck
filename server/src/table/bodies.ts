// ТЕЛА ЗА СТОЛОМ — кто как сидит, куда тянется головой и что делает правой рукой. Мимо версий и истории
// стола, как палец в воздухе и глаза: живёт, пока человек в комнате, опоздавший получает последнее.
//
//   тело      — привязано к стулу; поза — сидит или стоит (`stance`). Стоя камера дальше от стола.
//               Правило стола «играть стоя» (`TableRules.stand`) заставляет стоять: сервер сам пишет
//               `stand`, что бы ни прислал клиент;
//   голова    — это камера: где глаз над столом (`eye`, с высотой), насколько натянута шея (`stretch`: 0 —
//               на месте, 1 — на пределе) и куда повёрнута (`yaw`, градусы от севера стола). По повороту
//               другие видят, куда смотрит веер в левой руке;
//   правая рука — только в деле: палец на столе (`right`), на компьютере — курсор. Без дела — `null`, и
//               её не рисуют.
//
// КАМЕРА — ЭТО ГОЛОВА. Высота головы над столом и есть отдаление камеры: сидя голова в покое на `up` выше
// плеч, стоя — выше вместе с плечами, и камера дальше. Приблизил — голова опускается к столу и тянется
// вперёд, но не ниже `HEAD.min` (карту и колоду ещё можно перетянуть); держать так можно недолго (`NECK`),
// потом камера сама возвращается. Повернул камеру на другую сторону стола — туда уходит голова с картами,
// тело остаётся на стуле: тело — это стул.

import type { TableRules } from "./contract.js";
import { seatPoint, TABLE_RADIUS } from "./ring.js";

export type Stance = "sit" | "stand";
export const STANCES: readonly Stance[] = ["sit", "stand"];

/**
 * ВИД АВАТАРА — выбирает сам человек, видят все:
 *   seat  стул, кружок-аватар (он же голова) и карты — первый, по умолчанию;
 *   king  спрайты: тело и голова короля треф, руки-хваты (`scripts/bakeSprites.mjs`).
 */
export const MODELS = ["seat", "king"] as const;
export type Model = (typeof MODELS)[number];

/** Точка над столом: `x, y` — на сукне, `h` — высота над ним; всё в единицах стола (ширинах карты). */
export interface Point3 {
  x: number;
  y: number;
  h: number;
}

/** Клиент → сервер: своё тело сейчас. */
export interface BodyOut {
  stance: Stance;
  model: Model;
  /**
   * ГДЕ ГЛАЗ — место камеры этого человека над столом. Голова тянется к нему от плеч на длину шеи: смотрит
   * со своего стула — голова над стулом; навис над серединой — голова наклонилась туда. В AR это сам телефон.
   */
  eye: Point3;
  stretch: number;
  yaw: number;
  /** Взгляд вверх-вниз, градусы (вниз — минус): рука с картами стоит в кадре головы, и остальные видят её там же. Старый клиент не шлёт. */
  pitch?: number;
  /** Куда голова смотрит на самом деле, градусы; `yaw` держат в пределах своей стороны стола, чтобы голова не считалась ушедшей. Старый клиент не шлёт. */
  gaze?: number;
  /** Загиб веера в руке, 0…1 (0 — плоский): остальные видят карты по дуге, как их держат пальцами. Старый клиент не шлёт. */
  curl?: number;
  /** Высота руки в кадре головы относительно обычной, единицы стола (вниз — минус): ниже руку опустили — остальные видят её ниже и карты прямее. Старый клиент не шлёт. */
  handY?: number;
  right: { x: number; y: number } | null;
}

/** Сервер → всем: чьё тело. */
export interface Body extends BodyOut {
  by: string;
}

/** Как часто экран шлёт своё тело, пока оно двигается. */
export const BODY_EVERY_MS = 100;

/**
 * ШЕЯ — одна на все клиенты.
 *
 *   zoom      во сколько раз камера ближе позы, когда шея на пределе (`stretch` = 1);
 *   free      натяг, который держится сколько угодно;
 *   holdMs    сколько держится натяг на пределе; у самого `free` — втрое дольше, между — линейно;
 *   backMs    за сколько камера возвращается к позе, когда время вышло;
 *   restMs    сколько после возврата шея отдыхает: натянуть её снова нельзя.
 */
export const NECK = { free: 0.05, holdMs: 2000, backMs: 500, restMs: 1000 } as const;

/** Сколько можно держать такой натяг, мс: чуть нагнулся — сколько угодно, дальше — `holdMs`. */
export function holdFor(stretch: number): number {
  return stretch <= NECK.free ? Infinity : NECK.holdMs;
}

// ── ГДЕ ТЕЛО НА СТОЛЕ — одна геометрия на все клиенты: веб рисует сверху, Unity — в объёме. ─────────

type Point = { x: number; y: number };

/** Плечи — за кромкой, у своего стула. */
export const SHOULDERS = TABLE_RADIUS + 1;
export const shouldersOf = (angle: number): Point => seatPoint(angle, SHOULDERS);

/** Высота плеч над сукном: сидя и стоя. */
export const SHOULDER_H: Record<Stance, number> = { sit: 4, stand: 7 };
/**
 * ШЕЯ В ОБЪЁМЕ — от плеч к голове: в покое `rest`, натянутая — до `rest + reach`; выше плеч голова
 * поднимается не больше чем на `up`. Глаз камеры бывает высоко над столом, но живой человек, нависая над
 * столом, тянется вперёд, а не вверх: остаток шеи уходит к месту взгляда.
 */
export const NECK_LEN = { rest: 2.5, reach: 3.5, up: 2 } as const;

/**
 * ГОЛОВА НАД СТОЛОМ: ниже `min` не опускается — ближе камера не подъезжает; `lift` — на какой доле высоты
 * головы висит карта в руке: нагнулся к столу — и карта ниже.
 */
export const HEAD = { min: 3, lift: 0.3 } as const;

/** Голова в покое: на `up` выше плеч позы. */
export const restHead = (stance: Stance): number => SHOULDER_H[stance] + NECK_LEN.up;

/** Во сколько раз камера дальше от стола стоя, чем сидя: во столько же выше голова. */
export const STANCE_ZOOM: Record<Stance, number> = { sit: 1, stand: restHead("sit") / restHead("stand") };

/** Отклонение поворота камеры от своего места, после которого голова уходит на ту сторону стола, градусы. */
export const AWAY_DEG = 14;

/** Плечи с высотой. */
export const shoulders3 = (angle: number, stance: Stance): Point3 => ({ ...shouldersOf(angle), h: SHOULDER_H[stance] });

/**
 * С КАКОЙ СТОРОНЫ СТОЛА СМОТРИТ КАМЕРА — угол места (как у стула, `seatPoint`) под нижним краем экрана.
 * На своём месте камера повёрнута так, что свой стул внизу: сторона камеры — это сам стул.
 */
export const sideOf = (yaw: number): number => -yaw;

/** Разница двух углов места, градусы, 0…180. */
const apart = (a: number, b: number): number => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/** Голова ушла от тела: камера повёрнута на другую сторону стола дальше `AWAY_DEG`. */
export function awayOf(s: Point3, yaw: number): boolean {
  const seat = (Math.atan2(s.x, s.y) * 180) / Math.PI;
  return apart(sideOf(yaw), seat) > AWAY_DEG;
}

/**
 * ГОЛОВА. Высота — от камеры (`eye.h` — высота головы): не выше покоя позы, не ниже `HEAD.min`. Вперёд, к
 * тому, на что человек смотрит (`eye.x, eye.y`), — на длину шеи: в покое она короткая, нагнулся — длиннее
 * (`stretch` или сама глубина нагиба, что больше), но не дальше самой точки взгляда. С `yaw` голова считается
 * от той стороны стола, куда повёрнута камера: тело на стуле, голова с картами — там.
 */
export function headOf(s: Point3, eye: Point3, stretch: number, yaw?: number): Point3 {
  let from = s;
  if (yaw !== undefined && awayOf(s, yaw)) {
    const r = Math.hypot(s.x, s.y), a = (sideOf(yaw) * Math.PI) / 180;
    from = { x: Math.sin(a) * r, y: Math.cos(a) * r, h: s.h };
  }
  const rest = from.h + NECK_LEN.up;
  const h = Math.max(HEAD.min, Math.min(rest, eye.h));
  const bent = Math.max(0, Math.min(1, Math.max(stretch, (rest - h) / Math.max(1e-6, rest - HEAD.min))));
  const len = NECK_LEN.rest + NECK_LEN.reach * bent;
  const up = h - from.h;
  const dx = eye.x - from.x, dy = eye.y - from.y, flat = Math.hypot(dx, dy);
  const along = Math.min(flat, Math.sqrt(Math.max(0, len * len - up * up)));
  const f = flat < 1e-6 ? 0 : along / flat;
  return { x: from.x + dx * f, y: from.y + dy * f, h };
}

/** Куда смотрит голова — единичный вектор в осях стола из `yaw` (градусы от севера по часовой). */
export const gazeOf = (yaw: number): Point => ({ x: Math.sin((yaw * Math.PI) / 180), y: -Math.cos((yaw * Math.PI) / 180) });

/** ЛЕВАЯ РУКА с картами — у головы: чуть вперёд по взгляду, влево от него и ниже лица. */
export function leftHandOf(head: Point3, yaw: number): Point3 {
  const f = gazeOf(yaw);
  // Слева от взгляда: при взгляде на север (0, −1) левее — запад (−1, 0).
  return { x: head.x + f.x * 1.1 + f.y * 0.9, y: head.y + f.y * 1.1 - f.x * 0.9, h: Math.max(0.4, head.h - 1.2) };
}

/** Дальше этого от середины стола точка тела не бывает: глаз может быть за спиной сидящего и высоко. */
const REACH = 40;
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
const point = (v: unknown): { x: number; y: number } | null => {
  const p = v as { x?: unknown; y?: unknown } | null;
  const x = num(p?.x, -REACH, REACH), y = num(p?.y, -REACH, REACH);
  return x === null || y === null ? null : { x, y };
};

/** Разбор из сети: всё или ничего. Правая рука без дела — `null`, а не мусор. */
export function cleanBody(raw: unknown): BodyOut | null {
  const b = (raw ?? {}) as Partial<Record<keyof BodyOut, unknown>>;
  if (!(STANCES as readonly unknown[]).includes(b.stance)) return null;
  const eye = point(b.eye);
  const eyeH = num((b.eye as { h?: unknown } | null)?.h, 0, 60);
  const stretch = num(b.stretch, 0, 1);
  const yaw = num(b.yaw, -360, 360);
  if (!eye || eyeH === null || stretch === null || yaw === null) return null;
  const right = b.right === null || b.right === undefined ? null : point(b.right);
  if (b.right !== null && b.right !== undefined && !right) return null;
  const pitch = b.pitch === undefined ? undefined : num(b.pitch, -90, 90);
  if (pitch === null) return null;
  const gaze = b.gaze === undefined ? undefined : num(b.gaze, -360, 360);
  if (gaze === null) return null;
  const curl = b.curl === undefined ? undefined : num(b.curl, 0, 1);
  if (curl === null) return null;
  const handY = b.handY === undefined ? undefined : num(b.handY, -3, 3);
  if (handY === null) return null;
  // Незнакомый вид — первый: старый клиент вида не шлёт, новый вид старому не страшен.
  const model: Model = (MODELS as readonly unknown[]).includes(b.model) ? (b.model as Model) : "seat";
  return { stance: b.stance as Stance, model, eye: { ...eye, h: eyeH }, stretch, yaw, ...(pitch === undefined ? {} : { pitch }), ...(gaze === undefined ? {} : { gaze }), ...(curl === undefined ? {} : { curl }), ...(handY === undefined ? {} : { handY }), right };
}

export class Bodies {
  private all = new Map<string, Body>();

  /** Тело человека сейчас; правило «играть стоя» ставит его на ноги. */
  set(by: string, out: BodyOut, rules: Pick<TableRules, "stand">): Body {
    const body: Body = { ...out, stance: rules.stand ? "stand" : out.stance, by };
    this.all.set(by, body);
    return body;
  }

  forget(by: string): boolean {
    return this.all.delete(by);
  }

  /** Правило поменялось — все, кто сидел, встали (или остались, как были). */
  restand(rules: Pick<TableRules, "stand">): Body[] {
    if (!rules.stand) return [];
    const changed: Body[] = [];
    for (const [by, body] of this.all) {
      if (body.stance === "stand") continue;
      const up = { ...body, stance: "stand" as const };
      this.all.set(by, up);
      changed.push(up);
    }
    return changed;
  }

  list(): Body[] {
    return [...this.all.values()];
  }
}
