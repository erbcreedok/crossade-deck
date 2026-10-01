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
  /** Куда смотрит телефон СЕЙЧАС (шаг фильтра — по кадру, зовут раз за кадр); `null` — датчик ещё не сказал ни слова. */
  look(): Look | null;
  /** Откуда слова и как часто — строкой для настроек (диагностика на телефоне, где консоли нет). */
  info(): string;
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

/**
 * ОДИН ИСТОЧНИК, А НЕ ДВА. В Telegram у телефона два датчика сразу — его собственный (`DeviceOrientation`) и браузерный, — и
 * нулевой курс у них разный: если кормить фильтр обоими вперемешку, курс скачет между двумя нулями, и стол трясётся на приличное
 * расстояние. Берём БРАУЗЕРНЫЙ, если он заговорил за `BROWSER_WAIT_MS` (он есть и в обычном браузере, и в приложении), иначе — Telegram.
 */
const BROWSER_WAIT_MS = 600;

export function createGyro(changed: () => void): Gyro {
  let on = false;
  let off: Array<() => void> = [];
  let source: "browser" | "tg" | null = null;
  let startedAt = 0;
  let raw: Look | null = null;
  let yawF = new OneEuro(), pitchF = new OneEuro();
  let rawPrev: number | null = null, unrolled = 0;
  let count = 0, since = 0, hz = 0;

  const hear = (src: "browser" | "tg", alpha: number, beta: number, gamma: number): void => {
    const now = performance.now();
    if (source === null) {
      // Браузерный — сразу; Telegram — только если браузерный молчит.
      if (src === "tg" && now - startedAt < BROWSER_WAIT_MS) return;
      source = src;
    }
    if (src !== source) return;
    const l = lookOf(deviceQuat(alpha, beta, gamma, screenAngle()));
    unrolled = rawPrev === null ? l.yaw : unrolled + wrapDeg(l.yaw - rawPrev);
    rawPrev = l.yaw;
    raw = { yaw: unrolled, pitch: l.pitch };
    count += 1;
    if (now - since >= 1000) { hz = Math.round((count * 1000) / (now - since)); count = 0; since = now; }
    changed();
  };

  async function start(): Promise<string | null> {
    if (on) return null;
    on = true;
    source = null; raw = null; rawPrev = null; startedAt = performance.now(); since = startedAt; count = 0; hz = 0;
    yawF = new OneEuro(); pitchF = new OneEuro();
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
      const read = (): void => { if (tgo.beta != null) hear("tg", (tgo.alpha ?? 0) * DEG, tgo.beta * DEG, (tgo.gamma ?? 0) * DEG); };
      tg.onEvent("deviceOrientationChanged", read);
      tgo.start({ refresh_rate: 20, need_absolute: false });
      off.push(() => { tg.offEvent?.("deviceOrientationChanged", read); tgo.stop?.(); });
    }
    const onBrowser = (e: DeviceOrientationEvent): void => { if (e.beta != null) hear("browser", e.alpha ?? 0, e.beta, e.gamma ?? 0); };
    addEventListener("deviceorientation", onBrowser);
    off.push(() => removeEventListener("deviceorientation", onBrowser));
    startedAt = performance.now();
    return note;
  }

  function stop(): void {
    on = false;
    for (const fn of off) fn();
    off = [];
    raw = null;
    source = null;
  }

  // Фильтр шагает по КАДРУ, а не по слову датчика: у Telegram слова приходят пачками и с разным интервалом, и фильтр, считавший по ним
  // время, принимал разрыв между пачками за скорость и пропускал шум.
  function look(): Look | null {
    if (!raw) return null;
    const t = performance.now() / 1000;
    return { yaw: wrapDeg(yawF.filter(raw.yaw, t)), pitch: pitchF.filter(raw.pitch, t) };
  }

  const info = (): string => (!on ? "" : source === null ? "гиро: датчик молчит" : `гиро: ${source === "tg" ? "Telegram" : "браузер"}, ${hz} Гц`);

  return { on: () => on, start, stop, look, info };
}
