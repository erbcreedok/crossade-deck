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
// Шея считается на своём экране (`NECK`): приблизил камеру ближе позы — голова тянется к столу; держать
// так можно недолго, потом камера сама возвращается.

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
export const NECK = { zoom: 1.6, free: 0.3, holdMs: 2000, backMs: 500, restMs: 1000 } as const;

/** Во сколько раз камера дальше от стола стоя, чем сидя: зум позы. */
export const STANCE_ZOOM: Record<Stance, number> = { sit: 1, stand: 0.72 };

/** Сколько можно держать такой натяг, мс. До `free` — бесконечно. */
export function holdFor(stretch: number): number {
  if (stretch <= NECK.free) return Infinity;
  const over = Math.min(1, (stretch - NECK.free) / (1 - NECK.free));
  return NECK.holdMs * (1 + (1 - over) * 2);
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

/** Плечи с высотой. */
export const shoulders3 = (angle: number, stance: Stance): Point3 => ({ ...shouldersOf(angle), h: SHOULDER_H[stance] });

/**
 * ГОЛОВА — от плеч к глазу, но не дальше шеи: глаз может висеть высоко над серединой стола, а голова
 * остаётся у тела и только наклоняется туда, откуда человек смотрит. Ниже сукна голова не опускается.
 */
export function headOf(s: Point3, eye: Point3, stretch: number): Point3 {
  const dx = eye.x - s.x, dy = eye.y - s.y, dh = eye.h - s.h;
  const len = NECK_LEN.rest + NECK_LEN.reach * Math.max(0, Math.min(1, stretch));
  if (Math.hypot(dx, dy, dh) <= len && dh <= NECK_LEN.up) return { x: eye.x, y: eye.y, h: Math.max(0.5, eye.h) };
  const flat = Math.hypot(dx, dy);
  const v = Math.max(0.5 - s.h, Math.min(NECK_LEN.up, dh, len));
  const along = Math.min(flat, Math.sqrt(Math.max(0, len * len - v * v)));
  const f = flat < 1e-6 ? 0 : along / flat;
  return { x: s.x + dx * f, y: s.y + dy * f, h: s.h + v };
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
  // Незнакомый вид — первый: старый клиент вида не шлёт, новый вид старому не страшен.
  const model: Model = (MODELS as readonly unknown[]).includes(b.model) ? (b.model as Model) : "seat";
  return { stance: b.stance as Stance, model, eye: { ...eye, h: eyeH }, stretch, yaw, right };
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
