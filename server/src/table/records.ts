// ЗАПИСИ КОМНАТЫ — из журнала: кто в ней бывал, какие были посиделки и какие в них партии.
//
// Журнал пишет всё подряд (`chronicle.ts`); здесь он режется на то, что человек ищет глазами: «вчера
// вечером мы сыграли три партии». Режется по явным границам — `room.open`, `match.start`, `match.end`
// — и по тишине: встали из-за стола и вернулись через час — это уже другие посиделки.
//
// Чистая функция: журнал на вход, записи на выход. Ни базы, ни часов.

/**
 * СОБЫТИЕ ЖУРНАЛА — ровно то, что записям нужно от строки `events`. Своим типом, а не типом
 * хранилища: записи читает и бот, а тянуть к нему базу сервера ради формы строки незачем.
 */
export interface RecordDeed {
  id: number;
  at: number;
  who?: string;
  kind: string;
  what?: unknown;
}

/**
 * ИЗ ЧЕГО ЗАПИСИ СОБИРАЮТСЯ: границы и люди, плюс ходы — по ним видно, что за столом была жизнь, а не
 * тишина. Дифы и события экранов сюда не берутся: их тысячи, а записей они не меняют.
 */
export const RECORD_KINDS = ["room.open", "join", "leave", "act", "match.start", "match.end", "match"] as const;

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
  /**
   * ГРАНИЦЫ ВОССТАНОВЛЕНЫ, А НЕ ЗАПИСАНЫ. Партии, сыгранные до того, как стол стал писать
   * `match.start`/`match.end`, узнаются по ходу партии (`match`: очередь появилась — пошла, очереди
   * не стало — кончилась). Кто проиграл, там не сказано: ход назван стулом, а не человеком. Игроки —
   * те, кто в ней ходил. Запись такой партии смотрят с открытия стола: свой первый кадр стол
   * пишет только тогда, и начинать с середины значило бы показать не тот стол.
   */
  guessed?: true;
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
  /** Имя и род стола, какими его открыли (`room.open`), — у закрытой комнаты другого имени уже нет. */
  title: string | null;
  kind: string | null;
  /** Все, кто бывал в комнате: имя — последнее, каким входил. */
  people: { key: string; name: string; firstAt: number; lastAt: number }[];
  sessions: RecordSession[];
}

export function recordsOf(log: readonly RecordDeed[]): Records {
  const people = new Map<string, { key: string; name: string; firstAt: number; lastAt: number }>();
  const sessions: RecordSession[] = [];
  let session: RecordSession | null = null;
  let lastAt = -Infinity;
  let open: RecordMatch | null = null;
  let title: string | null = null;
  let kind: string | null = null;
  const actors = new Set<string>();
  /** С какого события начинается жизнь стола — там лежит его первый кадр. */
  let life: number | null = null;

  for (const e of log) {
    if (e.kind === "room.open" || life === null) life = e.id;
    const cut = e.kind === "room.open" || e.at - lastAt > SESSION_GAP_MS;
    if (session === null || cut) {
      if (open?.guessed) open.players = [...actors];
      session = { from: e.id, to: e.id, at: e.at, endAt: e.at, people: [], matches: [] };
      sessions.push(session);
      open = null;
    }
    session.to = e.id;
    session.endAt = e.at;
    lastAt = e.at;

    if (e.kind === "room.open") {
      const was = e.what as { title?: unknown; kind?: unknown } | undefined;
      if (typeof was?.title === "string") title = was.title;
      if (typeof was?.kind === "string") kind = was.kind;
    }
    if (e.kind === "join" && e.who) {
      const name = (e.what as { name?: unknown } | undefined)?.name;
      const was = people.get(e.who);
      people.set(e.who, { key: e.who, name: typeof name === "string" ? name : (was?.name ?? e.who), firstAt: was?.firstAt ?? e.at, lastAt: e.at });
      if (!session.people.includes(e.who)) session.people.push(e.who);
    }
    if (e.kind === "act" && e.who && open?.guessed) actors.add(e.who);
    if (e.kind === "match") {
      const now = (e.what ?? {}) as { идёт?: unknown; ход?: unknown; вышли?: unknown };
      const going = now.идёт === true && typeof now.ход === "string";
      if (going && open === null && Array.isArray(now.вышли) && now.вышли.length === 0) {
        actors.clear();
        open = { from: life, to: null, at: e.at, endAt: null, dealer: null, players: [], loser: null, out: [], guessed: true };
        session.matches.push(open);
      } else if (!going && open?.guessed) {
        open.to = e.id;
        open.endAt = e.at;
        open.players = [...actors];
        open = null;
      }
    }
    if (e.kind === "match.start") {
      // Записанное начало вытесняет восстановленное: одна и та же партия не должна стать двумя.
      if (open?.guessed) session.matches.splice(session.matches.indexOf(open), 1);
      const players = ((e.what as { игроки?: { key: string }[] } | undefined)?.игроки ?? []).map((one) => one.key);
      open = { from: e.id, to: null, at: e.at, endAt: null, dealer: e.who ?? null, players, loser: null, out: [] };
      session.matches.push(open);
    }
    if (e.kind === "match.end" && open && !open.guessed) {
      open.to = e.id;
      open.endAt = e.at;
      open.loser = e.who ?? null;
      open.out = ((e.what as { вышли?: string[] } | undefined)?.вышли ?? []).slice();
      open = null;
    }
  }
  if (open?.guessed) open.players = [...actors];
  return { title, kind, people: [...people.values()], sessions };
}
