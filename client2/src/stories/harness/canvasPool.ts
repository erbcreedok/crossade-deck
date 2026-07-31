// ЧИСТЫЙ пул ресурсов со счётчиком ссылок и вытеснением давних (LRU). Pixi сюда не заглядывает:
// создание/снос внедряются снаружи, поэтому логика тестируется в node (canvasPool.test.ts), а не
// «на глаз в браузере».
//
// Зачем вообще: браузер держит около 16 живых WebGL-контекстов. Наивный сторибук создаёт канвас
// на каждое монтирование стори и второй — на каждую переоценку модуля при HMR; через десяток
// переключений всё чернеет. Пул делает переключение стори переиспользованием, а не созданием.

export interface PoolOptions<K, V> {
  create(key: K): V;
  dispose(value: V): void;
  /** Сколько ОТПУЩЕННЫХ ресурсов держать про запас. Занятые не вытесняются никогда. */
  cap: number;
}

interface Entry<V> {
  value: V;
  refs: number;
  /** Порядковый номер последнего использования — им и определяется «самый давний». */
  used: number;
}

export interface PoolStats {
  /** Сколько ресурсов сейчас занято (refs > 0). */
  live: number;
  /** Сколько лежит отпущенными в кэше. */
  idle: number;
  /** Создано за всё время. Обход стори НЕ должен это увеличивать — по нему и ловится утечка. */
  created: number;
  disposed: number;
}

export class ResourcePool<K, V> {
  private readonly entries = new Map<K, Entry<V>>();
  private tick = 0;
  private createdCount = 0;
  private disposedCount = 0;

  constructor(private readonly opts: PoolOptions<K, V>) {}

  acquire(key: K): V {
    let e = this.entries.get(key);
    if (!e) {
      e = { value: this.opts.create(key), refs: 0, used: 0 };
      this.entries.set(key, e);
      this.createdCount++;
    }
    e.refs++;
    e.used = ++this.tick;
    return e.value;
  }

  release(key: K): void {
    const e = this.entries.get(key);
    if (!e) return;
    // Лишний release — не ошибка вызывающего: React в StrictMode гоняет размонтирование дважды.
    // Ниже нуля не опускаемся, иначе ресурс снесётся, пока им ещё пользуются.
    if (e.refs > 0) e.refs--;
    if (e.refs === 0) this.evict();
  }

  /** Снести всё разом. Это зовёт HMR (import.meta.hot.dispose) — иначе контексты накапливаются. */
  disposeAll(): void {
    for (const [key, e] of this.entries) {
      this.opts.dispose(e.value);
      this.disposedCount++;
      this.entries.delete(key);
    }
  }

  stats(): PoolStats {
    let live = 0;
    for (const e of this.entries.values()) if (e.refs > 0) live++;
    return { live, idle: this.entries.size - live, created: this.createdCount, disposed: this.disposedCount };
  }

  /** Пока отпущенных больше cap — сносим самый давний из них. Занятые не трогаем. */
  private evict(): void {
    for (;;) {
      const idle: [K, Entry<V>][] = [];
      for (const pair of this.entries) if (pair[1].refs === 0) idle.push(pair);
      if (idle.length <= this.opts.cap) return;
      let oldest = idle[0];
      for (const cur of idle) if (cur[1].used < oldest[1].used) oldest = cur;
      this.opts.dispose(oldest[1].value);
      this.disposedCount++;
      this.entries.delete(oldest[0]);
    }
  }
}
