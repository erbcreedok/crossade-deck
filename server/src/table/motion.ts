// АНИМАЦИИ У ЗРИТЕЛЯ — скорость и «меньше анимаций». Только то, что рисуется на одном экране и никого не ждёт:
// переворот, реордер, перелёт карты. Шафл и раздача идут в такт серверу — у всех одинаково, их не ускорить.

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export interface MotionPrefs {
  speed: Speed;
  /** `null` — не выбрано: решает устройство (`autoReduce`). */
  reduce: boolean | null;
}

export const DEFAULT_MOTION: MotionPrefs = { speed: 1, reduce: null };

/** Ниже этого — экран в энергосбережении: iOS в нём держит кадры на 30 в секунду. */
export const LOW_POWER_FPS = 40;

/**
 * Меньше анимаций по умолчанию: система просит меньше движения; Android-клиент Telegram назвал устройство слабым
 * (`…; LOW)` в user agent); кадры идут медленнее `LOW_POWER_FPS` — iOS в режиме энергосбережения.
 */
export function autoReduce(device: { fps?: number; userAgent?: string; prefersReduced?: boolean }): boolean {
  if (device.prefersReduced) return true;
  if (device.userAgent && /Telegram-Android\/[^(]*\([^)]*;\s*LOW\)/i.test(device.userAgent)) return true;
  return device.fps !== undefined && device.fps < LOW_POWER_FPS;
}

export function readMotion(raw: unknown): MotionPrefs {
  const o = (raw ?? {}) as Partial<MotionPrefs>;
  return {
    speed: (SPEEDS as readonly number[]).includes(o.speed as number) ? (o.speed as Speed) : DEFAULT_MOTION.speed,
    reduce: typeof o.reduce === "boolean" ? o.reduce : null,
  };
}

/**
 * Длительность своей анимации: делится на скорость; при «меньше анимаций» — ноль.
 *
 * `least` — ПОЛ, ниже которого движение убирать нельзя. Он нужен там, где движение не украшение, а
 * единственный способ понять, что случилось: карты круга, меняющие места, без него просто подменяются
 * на экране, и человек теряет, где чья. Меньше анимаций — не значит «меньше понятно».
 */
export function motionMs(base: number, speed: Speed, reduce: boolean, least = 0): number {
  return reduce ? least : base / speed;
}
