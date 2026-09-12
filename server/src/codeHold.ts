// КОД, ВЫДАННЫЙ ДО КОМНАТЫ, И ЕЩЁ НЕ ИСТРАЧЕННЫЙ.
//
// Комнату зовут кодом, и по стенду он должен быть В РУКАХ ДО нажатия «Создать»: его отправляют
// другу, ещё не сев за стол. Значит между «дай код» и «открой комнату» есть промежуток, в котором
// код уже занят, а комнаты ещё нет, — и если его не держать, второй человек в эту же секунду
// получит тот же код, и друг придёт не за тот стол.
//
// В ПАМЯТИ, а не в базе: бронь живёт минуты и переживать рестарт не должна — после него никто её
// уже не ждёт, а строка в базе осталась бы занимать код навсегда.

/** Сколько держится бронь. Дольше — это уже не «сейчас создам», а забытая вкладка. */
export const HOLD_MS = 10 * 60_000;

const held = new Map<string, number>();

function sweep(now: number): void {
  for (const [code, until] of held) if (until <= now) held.delete(code);
}

/** Занять код за тем, кто его только что получил. */
export function hold(code: string, now = Date.now()): void {
  sweep(now);
  held.set(code, now + HOLD_MS);
}

/** Держит ли кто-то этот код прямо сейчас. */
export function isHeld(code: string, now = Date.now()): boolean {
  sweep(now);
  return held.has(code);
}

/** Код истрачен (комната открыта) или брошен — бронь снимается. */
export function release(code: string): void {
  held.delete(code);
}

/** Только для тестов: забыть все брони. */
export function forgetHolds(): void {
  held.clear();
}
