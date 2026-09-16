// ЗНАКОМСТВО ГОЛОСОВ — сервер сводит двоих и уходит. Дальше речь идёт НАПРЯМУЮ между устройствами, мимо
// стола: сервер её не видит, не хранит и не пересылает.
//
// Здесь только три вида записок: предложение, ответ и «вот ещё один мой адрес». Сервер в них не заглядывает
// глубже размера — их читают браузеры. Наше дело — донести записку тому, кому она адресована, и не дать
// столу захлебнуться от чужого мусора.
//
// КТО КОМУ ЗВОНИТ ПЕРВЫМ — правило, а не удача. Если оба начнут разговор одновременно, согласование
// схлопнется (в WebRTC это зовут glare). Поэтому первым зовёт тот, чей ключ меньше по алфавиту: оба считают
// это одинаково и без переписки.

/** Записка длиннее — не от нашего клиента: настоящее предложение куда меньше. */
export const SIGNAL_MAX = 16_000;
/** Больше записок в секунду от человека не принимаем: кандидаты идут пачкой, но не лавиной. */
export const SIGNALS_PER_SEC = 40;

export type SignalKind = "offer" | "answer" | "ice" | "bye";

/** Клиент → сервер: записка тому, с кем сводимся. Сервер → ему: она же, с автором. */
export interface SignalOut {
  /** Ключ человека, которому записка. */
  to: string;
  kind: SignalKind;
  /** Тело записки как есть — его читает браузер на той стороне, не мы. */
  body: string;
}
export interface Signal extends SignalOut {
  from: string;
}

const KINDS: readonly SignalKind[] = ["offer", "answer", "ice", "bye"];

export function cleanSignal(raw: unknown): SignalOut | null {
  const out = (raw ?? {}) as Partial<SignalOut>;
  if (typeof out.to !== "string" || !out.to || out.to.length > 64) return null;
  if (typeof out.kind !== "string" || !KINDS.includes(out.kind as SignalKind)) return null;
  // «Пока» тела не имеет: это весть, а не предложение.
  const body = typeof out.body === "string" ? out.body : out.kind === "bye" ? "" : null;
  if (body === null || body.length > SIGNAL_MAX) return null;
  return { to: out.to, kind: out.kind as SignalKind, body };
}

/**
 * ЗВОНИТ ПЕРВЫМ ТОТ, ЧЕЙ КЛЮЧ МЕНЬШЕ. Правило нужно обоим и считается каждым у себя: иначе оба зовут разом
 * и согласование схлопывается.
 */
export const callsFirst = (me: string, other: string): boolean => me < other;

/** Сколько записок человек уже прислал за секунду — и можно ли ещё. */
export class Signals {
  private byWho = new Map<string, number[]>();

  take(by: string, now: number): boolean {
    const list = (this.byWho.get(by) ?? []).filter((t) => now - t < 1000);
    this.byWho.set(by, list);
    if (list.length >= SIGNALS_PER_SEC) return false;
    list.push(now);
    return true;
  }

  forget(by: string): void {
    this.byWho.delete(by);
  }
}
