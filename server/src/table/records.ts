// ЗАПИСИ КОМНАТЫ — из журнала: кто в ней бывал, какие были посиделки и какие в них партии.
//
// Журнал пишет всё подряд (`chronicle.ts`); здесь он режется на то, что человек ищет глазами: «вчера
// вечером мы сыграли три партии». Режется по явным границам — `room.open`, `match.start`, `match.end`
// — и по тишине: встали из-за стола и вернулись через час — это уже другие посиделки.
//
// Чистая функция: журнал на вход, записи на выход. Ни базы, ни часов.

import type { Told } from "../db/eventsRepo.js";

/** Сколько тишины разрезает посиделки. */
export const SESSION_GAP_MS = 20 * 60 * 1000;

export interface RecordMatch {
  /** Номер события начала — по нему строится ссылка на запись партии. */
  from: number;
  /** Номер события конца; `null` — партия не доиграна. */
  to: number | null;
  at: number;
  endAt: number | null;
  dealer: string | null;
  /** Ключи игроков, как они сидели на раздаче. */
  players: string[];
  loser: string | null;
  /** Кто вышел, по порядку: первый — первый победитель. */
  out: string[];
}

export interface RecordSession {
  from: number;
  to: number;
  at: number;
  endAt: number;
  /** Кто входил в эти посиделки. */
  people: string[];
  matches: RecordMatch[];
}

export interface Records {
  /** Все, кто бывал в комнате: имя — последнее, каким входил. */
  people: { key: string; name: string; firstAt: number; lastAt: number }[];
  sessions: RecordSession[];
}

export function recordsOf(log: readonly Told[]): Records {
  const people = new Map<string, { key: string; name: string; firstAt: number; lastAt: number }>();
  const sessions: RecordSession[] = [];
  let session: RecordSession | null = null;
  let lastAt = -Infinity;
  let open: RecordMatch | null = null;

  for (const e of log) {
    const cut = e.kind === "room.open" || e.at - lastAt > SESSION_GAP_MS;
    if (session === null || cut) {
      session = { from: e.id, to: e.id, at: e.at, endAt: e.at, people: [], matches: [] };
      sessions.push(session);
      open = null;
    }
    session.to = e.id;
    session.endAt = e.at;
    lastAt = e.at;

    if (e.kind === "join" && e.who) {
      const name = (e.what as { name?: unknown } | undefined)?.name;
      const was = people.get(e.who);
      people.set(e.who, { key: e.who, name: typeof name === "string" ? name : (was?.name ?? e.who), firstAt: was?.firstAt ?? e.at, lastAt: e.at });
      if (!session.people.includes(e.who)) session.people.push(e.who);
    }
    if (e.kind === "match.start") {
      const players = ((e.what as { игроки?: { key: string }[] } | undefined)?.игроки ?? []).map((one) => one.key);
      open = { from: e.id, to: null, at: e.at, endAt: null, dealer: e.who ?? null, players, loser: null, out: [] };
      session.matches.push(open);
    }
    if (e.kind === "match.end" && open) {
      open.to = e.id;
      open.endAt = e.at;
      open.loser = e.who ?? null;
      open.out = ((e.what as { вышли?: string[] } | undefined)?.вышли ?? []).slice();
      open = null;
    }
  }
  return { people: [...people.values()], sessions };
}
