// ТРЯСКА ПАЛЬЦЕМ: считает взмахи (смены направления не меньше `amp` пикселей) и говорит, когда их хватило. Чистая — время приходит снаружи, поэтому проверяется таблицей.
//
// Первая тряска — `turns` взмахов за `ms` мс; если с прошлой прошло не больше `nextMs`, хватает `nextTurns` (быстрая следующая). `turns` = 0 — тряска выключена.

import type { ShakeKnobs } from "./contract.js";

export class ShakeTracker {
  /** Крайняя точка текущего взмаха и его направление (вектор от прошлой крайней точки). */
  private ext: { x: number; y: number } | null = null;
  private dir: { x: number; y: number } | null = null;
  private turns: number[] = [];
  private lastFire = 0;

  reset(): void {
    this.ext = null;
    this.dir = null;
    this.turns = [];
    this.lastFire = 0;
  }

  /**
   * Палец оказался в точке (x, y) в момент `now`. `true` — тряска состоялась.
   * Взмах — разворот движения пальца ЦЕЛИКОМ (не по осям): одна резкая смена направления — один взмах, а не два.
   */
  feed(x: number, y: number, now: number, k: ShakeKnobs): boolean {
    if (!this.ext) { this.ext = { x, y }; return false; }
    if (!this.dir) {
      const dx = x - this.ext.x, dy = y - this.ext.y;
      if (Math.hypot(dx, dy) >= 3) { this.dir = { x: dx, y: dy }; this.ext = { x, y }; }
      return false;
    }
    const dx = x - this.ext.x, dy = y - this.ext.y, along = dx * this.dir.x + dy * this.dir.y;
    if (along > 0) { this.dir = { x: dx, y: dy }; this.ext = { x, y }; }
    else if (Math.hypot(dx, dy) >= k.amp) { this.dir = { x: dx, y: dy }; this.ext = { x, y }; this.turns.push(now); }
    return this.check(now, k);
  }

  /** Встряхнули телефон (рывок сильнее порога) — это тоже взмах. */
  jolt(now: number, k: ShakeKnobs): boolean {
    this.turns.push(now);
    return this.check(now, k);
  }

  /** Тряска не нужна (нечего ронять): накопленное забыть. */
  clear(): void { this.turns = []; }

  private check(now: number, k: ShakeKnobs): boolean {
    if (k.turns === 0) { this.turns = []; return false; }
    this.turns = this.turns.filter((t) => now - t <= k.ms);
    const quick = this.lastFire > 0 && now - this.lastFire <= k.nextMs;
    if (this.turns.length < (quick ? k.nextTurns : k.turns)) return false;
    this.turns = [];
    this.lastFire = now;
    return true;
  }
}
