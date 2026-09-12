// КОД, ВЫДАННЫЙ ДО КОМНАТЫ, И ЕЩЁ НЕ ИСТРАЧЕННЫЙ.
//
// Комнату зовут кодом, и по стенду он должен быть В РУКАХ ДО нажатия «Создать»: его отправляют
// другу, ещё не сев за стол. Значит между «дай код» и «открой комнату» есть промежуток, в котором
// код уже занят, а комнаты ещё нет, — и если его не держать, второй человек в эту же секунду
// получит тот же код, и друг придёт не за тот стол.
//
// ВМЕСТЕ С КОДОМ МОЖНО ПРИДЕРЖАТЬ И ОБЕЩАНИЕ СТОЛА — какая игра, чей он, вечный ли. Это нужно
// приглашению из чужой переписки: бот отвечает на набранное `@CrossaderBot chess` карточкой, а
// комнату поднимает ПЕРВЫЙ ВОШЕДШИЙ. Заводить её на каждый набранный запрос значит плодить пустые
// столы на каждую букву.
//
// В ПАМЯТИ, а не в базе: бронь живёт минуты и переживать рестарт не должна — после него никто её
// уже не ждёт, а строка в базе осталась бы занимать код навсегда.

import type { Admission, Mode, Visibility } from "./db/roomsRepo.js";

/** Сколько держится бронь. Дольше — это уже не «сейчас создам», а забытая вкладка. */
export const HOLD_MS = 10 * 60_000;

/** ОБЕЩАННЫЙ СТОЛ: всё, что нужно знать, чтобы поднять его, когда по коду наконец придут. */
export interface Promised {
  readonly game: string;
  readonly chairs?: number;
  readonly capacity?: number;
  readonly newcomer?: "admin" | "player" | "spectator";
  readonly ownerAccount?: string;
  readonly visibility?: Visibility;
  readonly admission?: Admission;
  readonly mode?: Mode;
  readonly forever?: boolean;
}

interface Held {
  readonly until: number;
  readonly promised?: Promised;
}

const held = new Map<string, Held>();

function sweep(now: number): void {
  for (const [code, one] of held) if (one.until <= now) held.delete(code);
}

/** Занять код за тем, кто его только что получил, — и, если сказано, за обещанным столом. */
export function hold(code: string, promised?: Promised, now = Date.now()): void {
  sweep(now);
  held.set(code, { until: now + HOLD_MS, ...(promised ? { promised } : {}) });
}

/** Держит ли кто-то этот код прямо сейчас. */
export function isHeld(code: string, now = Date.now()): boolean {
  sweep(now);
  return held.has(code);
}

/** Какой стол обещан за этим кодом — если обещан. Просто бронь стола не обещает. */
export function promiseOf(code: string, now = Date.now()): Promised | undefined {
  sweep(now);
  return held.get(code)?.promised;
}

/** Код истрачен (комната открыта) или брошен — бронь снимается. */
export function release(code: string): void {
  held.delete(code);
}

/** Только для тестов: забыть все брони. */
export function forgetHolds(): void {
  held.clear();
}
