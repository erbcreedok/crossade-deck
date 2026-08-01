import { anim, type SpringConfig } from "./anim/config";
import { liftPixels, moveStyle, pointOnPath, type MoveStyle, type MoveStyleRef } from "./anim/moveStyles";
import { stepSpring, isSettled, type SpringState } from "./physics/spring";

export interface CardTargets {
  x?: number;
  y?: number;
  rot?: number;
  scale?: number;
}

// Одна карта как физический объект движка (НЕ React-нода, НЕ Pixi-нода).
// Держит по пружине на каждый визуальный канал; спрайт лишь читает px/py/rotation/scaleVal.
// Именно это делает полёт «непрерывным с физикой», а не переходом из ноды в ноду.
export class CardBody {
  private cx: SpringState;
  private cy: SpringState;
  private crot: SpringState;
  private cscale: SpringState;

  private tx: number;
  private ty: number;
  private trot: number;
  private tscale: number;

  // Сила инерционного крена (juice). 1 — полный, 0 — выключен (умеренный/выкл режим).
  tiltScale = 1;

  /**
   * Пружины тела. По умолчанию — общий конфиг стола (`anim/config.ts`), то есть прежнее поведение
   * для всех, кто про пресеты не знает. Пресет анимации перекрывает их поканально: «сухо и быстро»
   * это в первую очередь жёсткие пружины, а не короткие длительности.
   */
  springs: { pos: SpringConfig; rot: SpringConfig; scale: SpringConfig } = {
    pos: anim.posSpring,
    rot: anim.rotSpring,
    scale: anim.scaleSpring,
  };

  constructor(x = 0, y = 0, rot = 0, scale = 1) {
    this.cx = { pos: x, vel: 0 };
    this.cy = { pos: y, vel: 0 };
    this.crot = { pos: rot, vel: 0 };
    this.cscale = { pos: scale, vel: 0 };
    this.tx = x;
    this.ty = y;
    this.trot = rot;
    this.tscale = scale;
  }

  // Задать цель (частично) — карта плавно полетит туда через пружины.
  setTarget(t: CardTargets): void {
    if (t.x !== undefined) this.tx = t.x;
    if (t.y !== undefined) this.ty = t.y;
    if (t.rot !== undefined) this.trot = t.rot;
    if (t.scale !== undefined) this.tscale = t.scale;
  }

  // Телепорт: и текущее, и целевое сразу (расстановка при инициализации/ресайзе).
  snapTo(t: CardTargets): void {
    if (t.x !== undefined) { this.cx = { pos: t.x, vel: 0 }; this.tx = t.x; }
    if (t.y !== undefined) { this.cy = { pos: t.y, vel: 0 }; this.ty = t.y; }
    if (t.rot !== undefined) { this.crot = { pos: t.rot, vel: 0 }; this.trot = t.rot; }
    if (t.scale !== undefined) { this.cscale = { pos: t.scale, vel: 0 }; this.tscale = t.scale; }
  }

  /**
   * Полёт ПО РАСПИСАНИЮ стиля (anim/moveStyles.ts) вместо пружины. Живёт в теле, а не в карте:
   * так его бесплатно получают и фишка, и фигура — летают они одинаково, различаясь лишь тем,
   * что нарисовано.
   */
  private trip: { from: { x: number; y: number }; to: { x: number; y: number }; t: number; dur: number; style: MoveStyle } | null = null;

  /** Летит ли по расписанию. Пока летит, цикл засыпать не имеет права. */
  get travelling(): boolean {
    return this.trip !== null;
  }

  /**
   * ВЫСОТА полёта, px. Не координата: место на столе задаётся прямой, а это подъём над ней.
   * Элемент переводит её в подъём картинки и в поведение тени (ui/elevation.ts).
   */
  liftPx = 0;

  /**
   * Отправить в точку выбранным стилем. `spring` (и любой стиль без расписания) отдаёт движение
   * пружинам — то есть ведёт себя ровно как прежний setTarget, и это по-прежнему дефолт стола.
   */
  travelTo(to: { x: number; y: number }, style: MoveStyleRef, speed = 1): void {
    const st = moveStyle(style);
    if (!st.frame || st.dur <= 0) {
      this.trip = null;
      this.setTarget({ x: to.x, y: to.y });
      return;
    }
    this.trip = { from: { x: this.cx.pos, y: this.cy.pos }, to: { ...to }, t: 0, dur: Math.max(0.001, st.dur / (speed > 0 ? speed : 1)), style: st };
    this.tx = to.x;
    this.ty = to.y;
  }

  // Шаг физики. snap=true (анимации выключены) → мгновенно в цели.
  step(dt: number, snap = false): void {
    if (this.trip) {
      this.trip.t += dt;
      const p = Math.min(1, this.trip.t / this.trip.dur);
      const f = this.trip.style.frame!(p);
      const pt = pointOnPath(this.trip.from, this.trip.to, f);
      this.liftPx = liftPixels(this.trip.from, this.trip.to, f);
      // Позицию ведёт расписание, поэтому пружины позиции синхронизируем НАСИЛЬНО: иначе, когда
      // полёт кончится, они дёрнут элемент со своей накопленной скоростью.
      this.cx = { pos: pt.x, vel: 0 };
      this.cy = { pos: pt.y, vel: 0 };
      this.trot = f.rot;
      this.tscale = f.scale;
      if (p >= 1) {
        this.trip = null;
        this.trot = 0;
        this.tscale = 1;
        this.liftPx = 0;
      }
    }
    this.cx = stepSpring(this.cx, this.tx, this.springs.pos, dt, snap);
    this.cy = stepSpring(this.cy, this.ty, this.springs.pos, dt, snap);
    this.crot = stepSpring(this.crot, this.trot, this.springs.rot, dt, snap);
    this.cscale = stepSpring(this.cscale, this.tscale, this.springs.scale, dt, snap);
  }

  // Все каналы осели у своих целей — карта «в покое». Движок по этому усыпляет рендер-цикл.
  isResting(): boolean {
    return (
      isSettled(this.cx, this.tx) &&
      isSettled(this.cy, this.ty) &&
      isSettled(this.crot, this.trot) &&
      isSettled(this.cscale, this.tscale)
    );
  }

  get px(): number { return this.cx.pos; }
  get py(): number { return this.cy.pos; }
  get scaleVal(): number { return this.cscale.pos; }

  // Визуальный угол = базовый (пружина) + крен от горизонтальной скорости (инерция).
  get rotation(): number {
    const tilt = clamp(this.cx.vel * anim.tilt.factor * this.tiltScale, -anim.tilt.max, anim.tilt.max);
    return this.crot.pos + tilt;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
