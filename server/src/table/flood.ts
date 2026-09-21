// ЗАТОПЛЕНИЕ. Сколько сообщений одного вида человек может прислать за секунду.
//
// Честный экран сюда не упирается: мера каждого вида взята с запасом вдвое от того, что экран шлёт
// сам (палец в воздухе — не чаще `CARRY_EVERY_MS`, намерения — единицы в секунду даже у лассо). Упирается
// чужой клиент, который шлёт в цикле: каждое принятое или отказанное намерение — строка в журнале, и
// без меры один такой цикл растит базу и глушит комнату остальным.
//
// Лишнее молча выбрасывается. Отвечать на него отказом значило бы удвоить тот самый поток.

import { CARRY_EVERY_MS } from "./contract.js";

export const PER_SECOND = {
  intent: 30,
  carry: Math.ceil((1000 / CARRY_EVERY_MS) * 2),
  say: 5,
  eyes: 20,
  command: 5,
  mic: 10,
} as const;

export type Lane = keyof typeof PER_SECOND;

export class Flood {
  private seen = new Map<string, number[]>();

  /** Принять ли ещё одно сообщение этого вида от этого человека. */
  take(by: string, lane: Lane, now: number): boolean {
    const key = `${lane}\n${by}`;
    const recent = (this.seen.get(key) ?? []).filter((at) => now - at < 1000);
    const ok = recent.length < PER_SECOND[lane];
    if (ok) recent.push(now);
    this.seen.set(key, recent);
    return ok;
  }

  forget(by: string): void {
    for (const key of [...this.seen.keys()]) if (key.endsWith(`\n${by}`)) this.seen.delete(key);
  }
}
