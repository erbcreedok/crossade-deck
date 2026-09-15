// ГЛАЗА ЗРИТЕЛЕЙ — кто у кого открыто окно стопки или окно стула. Мимо версий и истории стола, как палец в
// воздухе: состояние живёт, пока человек в комнате, и гаснет вместе с его присутствием.
//
// Клиент шлёт весь свой список открытых мест разом (`WatchOut`), сервер помнит, КОГДА каждое открылось, и
// рассылает всем полный список глаз: у зрителя порядок — кто открыл раньше, тот первый.

/** Место, на которое смотрят: стопка или стул. Одиночная карта не считается — она не окно. */
export type Spot = `pile:${string}` | `chair:${string}`;

export interface Eye {
  /** Чей глаз — ключ человека; цвет берётся из его `ink`. */
  by: string;
  spot: Spot;
  /** Когда это окно открылось: по нему глаза выстраиваются в очередь. */
  since: number;
}

/** Клиент → сервер: всё, что у него сейчас открыто. Пусто — ни на что не смотрит. */
export interface WatchOut {
  spots: string[];
}

const SPOTS_MAX = 24;

/** Разбор просьбы из сети: только известный вид места, без повторов и не больше горсти. */
export function cleanWatch(raw: unknown): Spot[] | null {
  const out = (raw ?? {}) as Partial<WatchOut>;
  if (!Array.isArray(out.spots)) return null;
  const seen = new Set<Spot>();
  for (const s of out.spots) {
    if (typeof s !== "string" || s.length > 80) continue;
    if (/^(pile|chair):.+$/.test(s)) seen.add(s as Spot);
    if (seen.size >= SPOTS_MAX) break;
  }
  return [...seen];
}

export class Eyes {
  /** Человек → место → когда открыл. */
  private looks = new Map<string, Map<Spot, number>>();

  /** Новый список открытых мест у человека. Вернёт `true`, если что-то поменялось. */
  look(by: string, spots: Spot[], now: number): boolean {
    const had = this.looks.get(by) ?? new Map<Spot, number>();
    const next = new Map<Spot, number>();
    // Место, которое было открыто и осталось, сохраняет своё время: очередь глаз не перетасовывается.
    for (const spot of spots) next.set(spot, had.get(spot) ?? now);
    const same = had.size === next.size && [...next].every(([spot, since]) => had.get(spot) === since);
    if (next.size === 0) this.looks.delete(by);
    else this.looks.set(by, next);
    return !same;
  }

  /** Человек ушёл из комнаты — его глаза гаснут. */
  forget(by: string): boolean {
    return this.looks.delete(by);
  }

  /** Все глаза, в порядке «кто открыл раньше». */
  all(): Eye[] {
    const out: Eye[] = [];
    for (const [by, spots] of this.looks) for (const [spot, since] of spots) out.push({ by, spot, since });
    return out.sort((a, b) => a.since - b.since || (a.by < b.by ? -1 : 1));
  }
}

/** Сколько глаз показывается на столе и в окне; остальные — знаком «+». */
export const EYES_ON_TABLE = 3;
export const EYES_IN_PANEL = 6;

/** Глаза одного места без своего: столько, сколько влезает, и есть ли ещё. */
export function eyesAt(eyes: Eye[], spot: Spot, me: string, limit: number): { eyes: Eye[]; more: boolean } {
  const mine = eyes.filter((e) => e.spot === spot && e.by !== me);
  return { eyes: mine.slice(0, limit), more: mine.length > limit };
}
