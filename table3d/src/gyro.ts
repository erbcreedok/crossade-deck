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

export function createGyro(changed: () => void): Gyro {
  let on = false;
  let last: Look | null = null;
  let off: Array<() => void> = [];

  const hear = (alpha: number, beta: number, gamma: number): void => {
    last = lookOf(deviceQuat(alpha, beta, gamma, screenAngle()));
    changed();
  };

  async function start(): Promise<string | null> {
    if (on) return null;
    on = true;
    last = null;
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
