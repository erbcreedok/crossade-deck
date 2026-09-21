// СВЕЖ ЛИ МОЙ СТОЛ. Клиент сам замечает, что отстал от сервера, и сам просит стол целиком (`sync`) —
// человеку для этого не нужно перезагружать страницу.
//
// Раньше отставание было видно только по СЛЕДУЮЩЕМУ патчу (`needsSync`): потерялось что-то, и стол
// затих — клиент оставался со старым снимком навсегда. Теперь сервер раз в `PULSE_EVERY_MS` называет
// свою версию (`MSG.pulse`), и этого хватает, чтобы заметить отставание в тишине.
//
// Чистая логика: ни сети, ни таймеров — время приходит снаружи. Кто держит соединение, тот раз в
// секунду спрашивает `due` и, если пора, шлёт `sync` и говорит `asked`.

/** Как часто сервер называет версию стола. */
export const PULSE_EVERY_MS = 4000;
/** Пульс впереди меня: столько ждём сам патч — он мог просто ещё не долететь. */
export const PULSE_GRACE_MS = 1500;
/** Просил стол целиком и не получил: просим снова. */
export const SYNC_WAIT_MS = 3000;

export interface Pulse {
  v: number;
}

export class Freshness {
  private behindSince: number | null = null;
  private askedAt: number | null = null;

  /** Сервер назвал свою версию. */
  pulse(serverV: number, myV: number, now: number): void {
    if (serverV > myV) this.behindSince ??= now;
    else this.behindSince = null;
  }

  /** Пришёл патч вне очереди — отстал наверняка, ждать нечего. */
  gap(now: number): void {
    this.behindSince = now - PULSE_GRACE_MS;
  }

  /** Вкладка вернулась из фона или связь поднялась заново: что было, пока нас не было, неизвестно. */
  doubt(now: number): void {
    this.gap(now);
  }

  asked(now: number): void {
    this.askedAt = now;
  }

  /** Пришёл стол целиком. */
  welcomed(): void {
    this.behindSince = null;
    this.askedAt = null;
  }

  /** Пора ли просить стол целиком. */
  due(now: number): boolean {
    if (this.askedAt !== null) return now - this.askedAt >= SYNC_WAIT_MS;
    return this.behindSince !== null && now - this.behindSince >= PULSE_GRACE_MS;
  }
}
