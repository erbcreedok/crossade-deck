// АНИМАЦИИ НА ЭТОМ УСТРОЙСТВЕ — личная скорость и «меньше анимаций» (`src/table/motion.ts`). Одни на экран: стол и
// разговор читают отсюда. Пока «меньше анимаций» не выбрано, решает устройство: вскоре после старта меряются кадры.

import { autoReduce, motionMs, readMotion, type MotionPrefs, type Speed } from "../src/table/motion.js";

const KEY = "crossade.table.motion";
const PROBE_AFTER_MS = 1500;
const PROBE_MS = 1000;

export interface Motion {
  speed: Speed;
  /** Как сейчас: выбранное или автоматическое. */
  readonly reduce: boolean;
  /** Выбрано ли руками. */
  readonly chosen: boolean;
  setSpeed(speed: Speed): void;
  setReduce(on: boolean): void;
  ms(base: number, least?: number): number;
  onChange(fn: () => void): void;
}

let one: Motion | null = null;

export function tableMotion(): Motion {
  if (one) return one;
  let prefs: MotionPrefs;
  try {
    prefs = readMotion(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    prefs = readMotion(null);
  }
  const listeners: (() => void)[] = [];
  const prefersReduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let auto = autoReduce({ userAgent: globalThis.navigator?.userAgent, prefersReduced });
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Нет хранилища — живёт, пока открыт экран.
    }
    mark();
    for (const fn of listeners) fn();
  };
  const mark = () => {
    if (motion.reduce) document.documentElement.dataset.reduceMotion = "";
    else delete document.documentElement.dataset.reduceMotion;
  };
  const motion: Motion = {
    get speed() {
      return prefs.speed;
    },
    set speed(s) {
      prefs.speed = s;
    },
    get reduce() {
      return prefs.reduce ?? auto;
    },
    get chosen() {
      return prefs.reduce !== null;
    },
    setSpeed(speed) {
      prefs.speed = speed;
      save();
    },
    setReduce(on) {
      prefs.reduce = on;
      save();
    },
    ms: (base, least) => motionMs(base, prefs.speed, motion.reduce, least),
    onChange: (fn) => void listeners.push(fn),
  };
  // КАДРЫ В СЕКУНДУ — энергосбережение iOS держит их на 30. Меряется не на старте (загрузка роняет кадры у всех),
  // и по медиане промежутков: разовый рывок её не сдвигает, ровные 33 мс — сдвигают.
  if (typeof requestAnimationFrame === "function") {
    setTimeout(() => {
      const gaps: number[] = [];
      let last = -1;
      const t0 = performance.now();
      const tick = (t: number) => {
        if (last >= 0) gaps.push(t - last);
        last = t;
        if (t - t0 < PROBE_MS) return void requestAnimationFrame(tick);
        gaps.sort((x, y) => x - y);
        const median = gaps[Math.floor(gaps.length / 2)] ?? 16;
        const was = motion.reduce;
        auto = autoReduce({ fps: 1000 / median, userAgent: globalThis.navigator?.userAgent, prefersReduced });
        mark();
        if (motion.reduce !== was) for (const fn of listeners) fn();
      };
      requestAnimationFrame(tick);
    }, PROBE_AFTER_MS);
  }
  mark();
  return (one = motion);
}
