// ЧТО С БОТАМИ ПРЯМО СЕЙЧАС — кто на каком мозге, кто думает и сколько, кто сколько раз сорвался.
//
// Журнал отвечает на это ЗАДНИМ ЧИСЛОМ: по нему видно, что ход был, но не видно, что бот думает
// вот в эту секунду. За столом это разные вопросы: «почему он не ходит» спрашивают, пока он молчит,
// а не после.
//
// Чистый модуль: входят числа, выходит сводка. Комната только заполняет её.

/** Что стол помнит про одного бота сверх его стула. */
export interface BotTrack {
  /** Сколько ходов сделал за эту жизнь комнаты. */
  moves: number;
  /** Сколько раз мозг сорвался — упал, не уложился, ответил не из списка. */
  failed: number;
  /** Последний ход словами. */
  lastSays?: string;
  /** Сколько думал над последним ходом, мс. */
  lastMs?: number;
  /** Чем кончилась последняя мысль, если сорвалась. */
  lastWhy?: string;
  /** Когда начал думать, если думает прямо сейчас. */
  since?: number;
}

/** Один бот наружу — так его видит и страница, и тот, кто разбирает жалобу. */
export interface BotSeen {
  key: string;
  name: string;
  chair: string;
  /** Чем думает: `greedy`, `claude`, `flash`, `outside`… */
  brain: string;
  profile: string;
  /** Своя пауза этого характера, мс. */
  waitMs: number;
  /** Его ли сейчас очередь. */
  turn: boolean;
  /** Думает прямо сейчас — и сколько уже, мс. */
  thinkingMs: number | null;
  moves: number;
  failed: number;
  lastSays?: string;
  lastMs?: number;
  lastWhy?: string;
}

/** Стол глазами наблюдателя за ботами. */
export interface BotsSeen {
  /** Чей сейчас ход — ключ. Партии нет — `null`. */
  turn: string | null;
  /** Идёт команда стола: боты ждут её конца. */
  busy: boolean;
  /** Кто-то держит карту — боты не лезут под руку. */
  handsOn: boolean;
  /** Сколько стол уже молчит, мс. По этому видно, кто вот-вот пойдёт. */
  quietMs: number;
  bots: BotSeen[];
}

/** Сводка по одному боту. Здесь только счёт времени — кто он и чем думает, знает комната. */
export function botSeen(
  one: { key: string; name: string; chair: string; brain: string; profile: string; waitMs: number; turn: boolean },
  track: BotTrack | undefined,
  now: number,
): BotSeen {
  const since = track?.since;
  return {
    ...one,
    thinkingMs: since === undefined ? null : Math.max(0, now - since),
    moves: track?.moves ?? 0,
    failed: track?.failed ?? 0,
    ...(track?.lastSays === undefined ? {} : { lastSays: track.lastSays }),
    ...(track?.lastMs === undefined ? {} : { lastMs: track.lastMs }),
    ...(track?.lastWhy === undefined ? {} : { lastWhy: track.lastWhy }),
  };
}
