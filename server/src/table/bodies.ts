// ТЕЛА ЗА СТОЛОМ — кто как сидит, куда тянется головой и что делает правой рукой. Мимо версий и истории
// стола, как палец в воздухе и глаза: живёт, пока человек в комнате, опоздавший получает последнее.
//
//   тело      — привязано к стулу; поза — сидит или стоит (`stance`). Стоя камера дальше от стола.
//               Правило стола «играть стоя» (`TableRules.stand`) заставляет стоять: сервер сам пишет
//               `stand`, что бы ни прислал клиент;
//   голова    — это камера: куда она смотрит на столе (`look`), насколько натянута шея (`stretch`: 0 —
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

/** Клиент → сервер: своё тело сейчас. */
export interface BodyOut {
  stance: Stance;
  model: Model;
  look: { x: number; y: number };
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

/**
 * ГОЛОВА ХОДИТ ПО СТОЛУ — от плеч к точке, куда смотрит его камера: в покое на `HEAD_SHARE` пути, натянул
 * шею — дальше, до `HEAD_SHARE + HEAD_LEAN`. Повёл камеру через стол — голова поехала через стол.
 */
export const HEAD_SHARE = 0.3, HEAD_LEAN = 0.5;
export function headOf(shoulders: Point, look: Point, stretch: number): Point {
  const share = HEAD_SHARE + HEAD_LEAN * Math.max(0, Math.min(1, stretch));
  return { x: shoulders.x + (look.x - shoulders.x) * share, y: shoulders.y + (look.y - shoulders.y) * share };
}

/** Куда смотрит голова — единичный вектор в осях стола из `yaw` (градусы от севера по часовой). */
export const gazeOf = (yaw: number): Point => ({ x: Math.sin((yaw * Math.PI) / 180), y: -Math.cos((yaw * Math.PI) / 180) });

/** ЛЕВАЯ РУКА с картами — у головы: чуть вперёд по взгляду и влево от него. */
export function leftHandOf(head: Point, yaw: number): Point {
  const f = gazeOf(yaw);
  // Слева от взгляда: при взгляде на север (0, −1) левее — запад (−1, 0).
  return { x: head.x + f.x * 1.1 + f.y * 0.9, y: head.y + f.y * 1.1 - f.x * 0.9 };
}

const REACH = 12;
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
  const look = point(b.look);
  const stretch = num(b.stretch, 0, 1);
  const yaw = num(b.yaw, -360, 360);
  if (!look || stretch === null || yaw === null) return null;
  const right = b.right === null || b.right === undefined ? null : point(b.right);
  if (b.right !== null && b.right !== undefined && !right) return null;
  // Незнакомый вид — первый: старый клиент вида не шлёт, новый вид старому не страшен.
  const model: Model = (MODELS as readonly unknown[]).includes(b.model) ? (b.model as Model) : "seat";
  return { stance: b.stance as Stance, model, look, stretch, yaw, right };
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
