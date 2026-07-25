import type { CardTargets } from "../CardBody";

/** Минимум, что пулу нужно от визуала: пружинное тело умеет прыгнуть и лететь к цели. */
export interface SpringBody {
  snapTo(t: CardTargets): void;
  setTarget(t: CardTargets): void;
}

// Единый пул ЭЛЕМЕНТОВ стола по идентичности (обобщение Пути 2, было TablePool). Один визуал
// на id, боксы — лишь якоря покоя; переход между боксами = setTarget на ТОМ ЖЕ визуале →
// бесшовный перелёт без пересоздания. Плоский список слотов {id, box, within} задаёт раскладку.
//
// Пул НЕ знает про Pixi и НЕ знает, что элемент — карта: ему нужен только `body` (пружина).
// Создание визуала, якорь по живой раскладке и уход из видимости — колбэки движка. Поэтому
// пул платформо-агностичен и тестируется без WebGL, а элементом может быть карта/фишка/фигура.

export interface Slot {
  id: string;
  box: string; // "deck" | "hand" | "discard" | "play:N" | ...
  within: number; // порядок внутри бокса
}

/** Переезд элемента: из какого бокса в какой (from === to — реордер внутри бокса). */
export interface Move {
  id: string;
  from: string;
  to: string;
}

export interface ApplyResult {
  entered: string[]; // впервые появились
  moved: Move[]; // сменили слот; from→to решает перелёт/переворот на границе
  left: string[]; // ушли из видимости
}

export interface ElementPoolOptions<V> {
  /** Создать визуал+тело для нового элемента (текстуру/слой знает движок). */
  create: (id: string) => V;
  /** Место покоя слота (движок знает живую раскладку). */
  anchor: (slot: Slot) => CardTargets;
  /** Откуда НОВЫЙ элемент стартует до полёта. По умолчанию — его же anchor. */
  spawnAnchor?: (slot: Slot) => CardTargets;
  /** Только что созданному: z-порядок/текстура/видимость. */
  onEnter?: (v: V, slot: Slot) => void;
  /** Переехавшему: обновить z/текстуру под новый слот. */
  onPlace?: (v: V, slot: Slot) => void;
  /** Ушёл из видимости: ретайр — анимация ухода/уничтожение. */
  onLeave?: (v: V, id: string) => void;
}

export class ElementPool<V extends { body: SpringBody }> {
  private byId = new Map<string, V>();
  /** Текущая раскладка: слот на каждый видимый элемент. */
  slots: Slot[] = [];

  constructor(private readonly o: ElementPoolOptions<V>) {}

  get size(): number {
    return this.byId.size;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): V | undefined {
    return this.byId.get(id);
  }

  all(): V[] {
    return [...this.byId.values()];
  }

  /** Элементы бокса в порядке within. */
  inBox(box: string): V[] {
    return this.slots
      .filter((s) => s.box === box)
      .sort((a, b) => a.within - b.within)
      .map((s) => this.byId.get(s.id))
      .filter((v): v is V => !!v);
  }

  /**
   * Привести пул к новой раскладке. Реюз по идентичности: существующий элемент СОХРАНЯЕТ визуал
   * и летит пружиной из старого места в новое (в т.ч. в другой бокс). Новые появляются у
   * spawnAnchor и летят к слоту; исчезнувшие уходят через onLeave. Дубли id схлопываются в один
   * (последний слот побеждает) — состав стола есть множество уникальных id.
   */
  apply(next: readonly Slot[]): ApplyResult {
    const entered: string[] = [];
    const moved: Move[] = [];
    const left: string[] = [];
    const wanted = new Set(next.map((s) => s.id));
    const prevBox = new Map(this.slots.map((s) => [s.id, s.box]));

    for (const [id, v] of this.byId) {
      if (!wanted.has(id)) {
        this.byId.delete(id);
        this.o.onLeave?.(v, id);
        left.push(id);
      }
    }

    for (const slot of next) {
      let v = this.byId.get(slot.id);
      if (!v) {
        v = this.o.create(slot.id);
        this.byId.set(slot.id, v);
        v.body.snapTo(this.o.spawnAnchor?.(slot) ?? this.o.anchor(slot));
        this.o.onEnter?.(v, slot);
        v.body.setTarget(this.o.anchor(slot));
        entered.push(slot.id);
      } else {
        this.o.onPlace?.(v, slot);
        v.body.setTarget(this.o.anchor(slot));
        moved.push({ id: slot.id, from: prevBox.get(slot.id) ?? slot.box, to: slot.box });
      }
    }

    this.slots = next.map((s) => ({ ...s }));
    return { entered, moved, left };
  }

  /** Отпустить всё (движок уже уничтожил сцену целиком). */
  clear(): void {
    this.byId.clear();
    this.slots = [];
  }
}
