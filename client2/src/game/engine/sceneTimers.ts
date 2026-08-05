// ТАЙМЕРЫ СЦЕНЫ — коллаборатор SceneEngine: отложенные действия во времени ЖИЗНИ СЦЕНЫ (не
// настенном — иначе таймер пережил бы пересборку и выстрелил в пустоту) и очередь отложенных
// переворотов каскада. Шагаются в кадре — своего setTimeout у сцены нет и не нужно.

export class SceneTimers {
  private timers: { t: number; fn: () => void }[] = [];

  constructor(private readonly wake: () => void) {}

  /** Выполнить через `delay` секунд жизни сцены. */
  after(delay: number, fn: () => void): void {
    if (delay <= 0) return void fn();
    this.timers.push({ t: delay, fn });
    this.wake();
  }

  /** Шаг очереди. true — очередь не пуста (циклу нельзя спать). */
  step(dt: number): boolean {
    if (!this.timers.length) return false;
    const left: { t: number; fn: () => void }[] = [];
    for (const x of this.timers) {
      const t = x.t - dt;
      if (t <= 0) x.fn();
      else left.push({ t, fn: x.fn });
    }
    this.timers = left;
    return true;
  }
}

/** Очередь отложенных срабатываний по элементам (каскад переворотов: волна доходит с задержкой). */
export class DelayQueue<T> {
  private pending: { item: T; t: number }[] = [];

  constructor(private readonly fire: (item: T) => void) {}

  push(item: T, delay: number): void {
    if (delay <= 0) return void this.fire(item);
    this.pending.push({ item, t: delay });
  }

  /** Шаг очереди. true — очередь не пуста (циклу нельзя спать). */
  step(dt: number): boolean {
    if (!this.pending.length) return false;
    const left: { item: T; t: number }[] = [];
    for (const p of this.pending) {
      const t = p.t - dt;
      if (t <= 0) this.fire(p.item);
      else left.push({ item: p.item, t });
    }
    this.pending = left;
    return true;
  }
}
