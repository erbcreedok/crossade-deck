// ПРИСУТСТВИЕ на общей борде — то, что видно, но НЕ является состоянием стола: кто какой элемент
// держит («кто первый схватил, тот и управляет» — админов в песочнице нет) и где чей курсор.
// In-memory хаб на витрину split-screen (родня boardTable): реальный сервер заменит ЭТОТ файл,
// подписчики (сцены) не изменятся. Правила чистые и наивные намеренно: лок живёт от grab до
// release, гонки решает порядок обращений (как и очередь сообщений Colyseus).

export interface PresenceCursor {
  x: number;
  y: number;
}

export interface PresenceView {
  /** el → кто держит (id участника). */
  held: Readonly<Record<string, string>>;
  /** участник → курсор в координатах КОНТЕНТА (борда у всех одна — координаты общие). */
  cursors: Readonly<Record<string, PresenceCursor>>;
}

export interface PresenceHub {
  /** Схватить элемент. false — уже держит кто-то другой (первый успел). */
  grab(who: string, el: string): boolean;
  release(who: string, el: string): void;
  /** Кто держит элемент (null — свободен). */
  heldBy(el: string): string | null;
  cursor(who: string, at: PresenceCursor | null): void;
  view(): PresenceView;
  onChange(cb: (v: PresenceView) => void): void;
}

export function createPresenceHub(): PresenceHub {
  const held: Record<string, string> = {};
  const cursors: Record<string, PresenceCursor> = {};
  const subs: ((v: PresenceView) => void)[] = [];

  const view = (): PresenceView => ({ held: { ...held }, cursors: { ...cursors } });
  const emit = (): void => {
    const v = view();
    for (const cb of subs) cb(v);
  };

  return {
    grab(who, el) {
      const owner = held[el];
      if (owner && owner !== who) return false;
      held[el] = who;
      emit();
      return true;
    },
    release(who, el) {
      if (held[el] !== who) return; // чужой лок не снимается — только свой
      delete held[el];
      emit();
    },
    heldBy: (el) => held[el] ?? null,
    cursor(who, at) {
      if (at) cursors[who] = at;
      else delete cursors[who];
      emit();
    },
    view,
    onChange(cb) {
      subs.push(cb);
    },
  };
}
