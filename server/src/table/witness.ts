// ЧТО ПРИСЛАЛ ЭКРАН — и почему этому нельзя верить на слово.
//
// Рассказ экрана приходит из браузера, то есть из места, которое я не контролирую. Он ничего не меняет
// за столом, и это главная защита: даже полностью выдуманная пачка портит только журнал её автора.
//
// Но объём — уже мой вопрос. Открытая вкладка может слать по событию на кадр, и журнал утонет раньше,
// чем кто-нибудь это заметит. Поэтому здесь два предела: сколько событий берётся из одной пачки и
// сколько пачек в секунду берётся у одного человека. Лишнее выбрасывается молча — отказывать
// рассказчику незачем, он всё равно ничего не ждёт в ответ.

import type { Seen, Witnessed } from "./contract.js";

/** Больше этого из одной пачки не берём. */
export const SEEN_MAX = 60;
/** Длиннее этого вид события не бывает — это ярлык, а не текст. */
export const KIND_MAX = 40;
/** Пачек в секунду с одного человека. Экран шлёт раз в несколько секунд, так что запас огромный. */
export const BATCHES_PER_SEC = 4;

/**
 * ВРЕМЯ МОЖЕТ ПРИЕХАТЬ BIGINT. Часы экрана — это миллисекунды с 1970 года, число под полтора
 * триллиона, и упаковщик сообщений Colyseus честно кодирует его как 64-битное целое, а распаковывает
 * уже `bigint`. Простая проверка «это число» такой рассказ считает мусором и выбрасывает ЦЕЛИКОМ и
 * МОЛЧА — ровно то, что здесь однажды и случилось: сервер писал свою правду, а экран не писал ничего.
 */
const msOf = (raw: unknown): number | null => {
  const ms = typeof raw === "bigint" ? Number(raw) : raw;
  return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
};

const seenOf = (raw: unknown): Seen | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const one = raw as Partial<Seen>;
  const at = msOf(one.at);
  if (at === null || typeof one.kind !== "string" || one.kind.length === 0 || one.kind.length > KIND_MAX) return null;
  return { at, kind: one.kind, ...(one.what === undefined ? {} : { what: one.what }) };
};

/** Взять из присланного то, что похоже на рассказ. `null` — брать нечего. */
export function cleanWitnessed(raw: unknown): Witnessed | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { seen } = raw as Partial<Witnessed>;
  if (!Array.isArray(seen)) return null;
  const good = seen.map(seenOf).filter((one): one is Seen => one !== null).slice(0, SEEN_MAX);
  return good.length === 0 ? null : { seen: good };
}

/** Сколько пачек человек прислал за последнюю секунду. Та же мера, что у речи и записок. */
export class Witnesses {
  private seen = new Map<string, number[]>();

  take(by: string, now: number): boolean {
    const recent = (this.seen.get(by) ?? []).filter((at) => now - at < 1000);
    if (recent.length >= BATCHES_PER_SEC) {
      this.seen.set(by, recent);
      return false;
    }
    this.seen.set(by, [...recent, now]);
    return true;
  }

  forget(by: string): void {
    this.seen.delete(by);
  }
}
