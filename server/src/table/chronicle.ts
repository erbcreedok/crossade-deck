// ЛЕТОПИСЬ СТОЛА — то, через что комната рассказывает журналу о себе.
//
// Здесь всего две мысли, и обе про то, чтобы журнал не мешал игре:
//
// 1. ЗАПИСЬ НЕ ИМЕЕТ ПРАВА УРОНИТЬ СТОЛ. Диск полон, база заперта, подробности не сложились в JSON —
//    это беда журнала, а не партии. Любая осечка глотается здесь и больше никуда не идёт.
// 2. ЗАПИСЬ КОПИТСЯ И УХОДИТ ПАЧКОЙ. Ход за столом — это десяток событий подряд; бить в базу на
//    каждое значит платить за журнал ходом игры. Пачка уходит по таймеру и при закрытии комнаты.
//
// Что писать — решает комната. Летопись не знает ни про карты, ни про правила.

import { tellAll, type Deed } from "../db/eventsRepo.js";

/** Как часто пачка уходит в базу. Реже — дешевле, но дольше ждать записи при разборе на живую. */
export const FLUSH_MS = 2000;
/** Больше этого пачка не ждёт таймера: уходит сразу, чтобы память не росла на буйном столе. */
export const BATCH_MAX = 200;

type Write = (deeds: readonly Deed[]) => void;

export class Chronicle {
  private heap: Deed[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * @param room  какая комната рассказывает
   * @param write куда складывать; подменяется в прогонах
   * @param every через сколько пачка уходит сама
   */
  constructor(
    private readonly room: string,
    private readonly write: Write = tellAll,
    private readonly every: number = FLUSH_MS,
  ) {}

  /** Сколько событий ждёт отправки. Для прогонов. */
  get waiting(): number {
    return this.heap.length;
  }

  /** Рассказать о случившемся на столе. */
  tell(kind: string, who: string | undefined, what?: unknown, at = Date.now()): void {
    this.heap.push({ at, room: this.room, ...(who === undefined ? {} : { who }), side: "table", kind, what });
    if (this.heap.length >= BATCH_MAX) this.flush();
    else this.wake();
  }

  /** Принять пачку, рассказанную экраном игрока. Время берётся его, порядок — наш. */
  heard(deeds: readonly Omit<Deed, "room" | "side">[], who: string | undefined): void {
    for (const one of deeds) {
      this.heap.push({ ...one, room: this.room, ...(who === undefined ? {} : { who }), side: "screen" });
    }
    if (this.heap.length >= BATCH_MAX) this.flush();
    else this.wake();
  }

  private wake(): void {
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => this.flush(), this.every);
    // Журнал не держит процесс живым: если больше делать нечего, сервер вправе закончиться.
    this.timer.unref?.();
  }

  /** Отправить накопленное. Зовётся таймером, переполнением и закрытием комнаты. */
  flush(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.heap.length === 0) return;
    const going = this.heap;
    this.heap = [];
    try {
      this.write(going);
    } catch {
      // Беда журнала не становится бедой стола. Потерянная пачка — приемлемая цена за то, что
      // партия не встала; повторять её значит копить память ровно там, где уже что-то сломано.
    }
  }
}
