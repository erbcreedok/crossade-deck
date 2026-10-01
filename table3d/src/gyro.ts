// ГИРО — телефон крутит взгляд моей головы: камера стоит на месте, у своего стула, а поворот телефона — это поворот головы.
//
// Ничего, кроме датчика: ни камеры телефона, ни стола в комнате (это дело полноценного AR). Датчик — Telegram
// (`WebApp.DeviceOrientation`, радианы), если мини-апп его даёт, иначе браузерный `deviceorientation` (градусы); на iOS браузерный
// даётся только после разрешения из жеста пальца — поэтому включать надо кнопкой.
//
// Отдаём СЫРОЙ взгляд — курс и наклон телефона в его мире; куда в сцене этот курс смотрит, решает сцена (она знает свой «домой»).

import * as THREE from "three";
import { deviceQuat } from "../../server/table-client/arLens.js";

interface TelegramOrientation {
  alpha?: number | null;
  beta?: number | null;
  gamma?: number | null;
  start?(o: { refresh_rate: number; need_absolute: boolean }): void;
  stop?(): void;
}
interface TelegramApp {
  DeviceOrientation?: TelegramOrientation;
  onEvent?(name: string, fn: () => void): void;
  offEvent?(name: string, fn: () => void): void;
}

export interface Look {
  /** Курс в осях сцены: 0 — на север стола (−z), по часовой, градусы. */
  yaw: number;
  /** Наклон: 0 — горизонт, вверх плюс, градусы. */
  pitch: number;
}

export interface Gyro {
  on(): boolean;
  /** Включить — из жеста пальца. Строка — что не вышло (датчик не разрешили). */
  start(): Promise<string | null>;
  stop(): void;
  /** Куда смотрит телефон; `null` — датчик ещё не сказал ни слова. */
  look(): Look | null;
}

const screenAngle = (): number => screen.orientation?.angle ?? (globalThis as { orientation?: number }).orientation ?? 0;
const DEG = 180 / Math.PI;

/** Курс и наклон из поворота телефона. Курс — по взгляду И по верху экрана вместе: у телефона, положенного экраном вверх, взгляд вертикален и курса у него нет. */
export function lookOf(q: [number, number, number, number]): Look {
  const quat = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
  return { yaw: Math.atan2(f.x + up.x, -(f.z + up.z)) * DEG, pitch: Math.asin(Math.max(-1, Math.min(1, f.y))) * DEG };
}

/**
 * ФИЛЬТР «ОДИН ЕВРО» — гладит шум датчика, не отставая на движении. Телефон лежит в руке и «дышит» долями градуса; сырой, этот шум
 * трясёт стол на видимое расстояние, потому что взгляд — как в бинокль. Пока взгляд почти стоит, срез низкий (шум режется), едва
 * поехал — срез растёт вместе со скоростью (взгляд не отстаёт).
 */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private at = 0;
  constructor(private minCutoff = 0.3, private beta = 0.02, private dCutoff = 0.5) {}
  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  /** Новое измерение `v` в момент `t` (секунды); возвращает сглаженное. */
  filter(v: number, t: number): number {
    if (this.x === null) { this.x = v; this.at = t; return v; }
    const dt = Math.max(1e-3, t - this.at);
    this.at = t;
    const rate = (v - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (rate - this.dx);
    this.x += OneEuro.alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt) * (v - this.x);
    return this.x;
  }
}

const wrapDeg = (a: number): number => ((a + 540) % 360) - 180;

export function createGyro(changed: () => void): Gyro {
  let on = false;
  let last: Look | null = null;
  let off: Array<() => void> = [];

  // Курс гладится «развёрнутым» (без скачка через ±180), наклон — как есть.
  let yawF = new OneEuro(), pitchF = new OneEuro(), unrolled = 0, rawPrev: number | null = null;
  const hear = (alpha: number, beta: number, gamma: number): void => {
    const raw = lookOf(deviceQuat(alpha, beta, gamma, screenAngle())), t = performance.now() / 1000;
    unrolled = rawPrev === null ? raw.yaw : unrolled + wrapDeg(raw.yaw - rawPrev);
    rawPrev = raw.yaw;
    last = { yaw: wrapDeg(yawF.filter(unrolled, t)), pitch: pitchF.filter(raw.pitch, t) };
    changed();
  };

  async function start(): Promise<string | null> {
    if (on) return null;
    on = true;
    last = null;
    yawF = new OneEuro(); pitchF = new OneEuro(); rawPrev = null;
    let note: string | null = null;
    // Разрешение на iOS — первым делом и без пауз до него: жест пальца живёт недолго.
    const perm = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent?.requestPermission;
    if (perm) {
      const answer = await perm().catch(() => "denied");
      if (answer !== "granted") note = "наклон не разрешили — взгляд не повернуть";
    }
    const tg = (globalThis as { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp;
    const tgo = tg?.DeviceOrientation;
    if (tgo?.start && tg?.onEvent) {
      const read = (): void => { if (tgo.beta != null) hear((tgo.alpha ?? 0) * DEG, tgo.beta * DEG, (tgo.gamma ?? 0) * DEG); };
      tg.onEvent("deviceOrientationChanged", read);
      tgo.start({ refresh_rate: 20, need_absolute: false });
      off.push(() => { tg.offEvent?.("deviceOrientationChanged", read); tgo.stop?.(); });
    }
    const onBrowser = (e: DeviceOrientationEvent): void => { if (e.beta != null) hear(e.alpha ?? 0, e.beta, e.gamma ?? 0); };
    addEventListener("deviceorientation", onBrowser);
    off.push(() => removeEventListener("deviceorientation", onBrowser));
    return note;
  }

  function stop(): void {
    on = false;
    for (const fn of off) fn();
    off = [];
    last = null;
  }

  return { on: () => on, start, stop, look: () => last };
}
