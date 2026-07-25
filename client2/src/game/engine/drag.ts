import type { Burnable, Flippable, TableElement } from "./element";

// Груз драга — ЧТО тащим: одну карту или пачку. Работает с абстракцией TableElement + её
// способностями (Flippable/Burnable), а НЕ с Card. Поэтому те же payload/зоны обслуживают карты,
// фишки, шахматные фигуры — новый элемент лишь реализует интерфейс, новых хендлеров не пишем.
//
// Движок-специфичное (поднять в слой драга, вернуть домой) — в DragContext, чтобы payload не знал
// про слои/дома конкретной сцены.

interface Pt {
  x: number;
  y: number;
}

export interface DragContext {
  raise(el: TableElement): void; // поднять в слой драга (план drag, z-порядок)
  returnHome(el: TableElement): void; // вернуть на исходное место (пружиной)
}

export interface DragPayload {
  readonly lead: TableElement; // представитель (для edge-scroll и т.п.)
  move(cp: Pt): void; // вести за пальцем
  release(): void; // вернуть на места
  readonly consumed: boolean; // элемент(ы) «поглощены» (горят) — возвращать не надо
  flip?(): void; // если поддерживает переворот
  burn?(): void; // если поддерживает сжигание
}

function asFlippable(el: TableElement): Flippable | null {
  return "requestFlip" in el ? (el as unknown as Flippable) : null;
}
function asBurnable(el: TableElement): Burnable | null {
  return "burn" in el ? (el as unknown as Burnable) : null;
}

/** Драг одной карты/элемента. Способности flip/burn делегируются, если элемент их реализует. */
export class SingleDrag implements DragPayload {
  readonly lead: TableElement;
  private readonly off: Pt;
  private readonly b: Burnable | null;
  flip?: () => void;
  burn?: () => void;

  constructor(
    private readonly el: TableElement,
    private readonly ctx: DragContext,
    cp: Pt,
  ) {
    this.lead = el;
    this.b = asBurnable(el);
    const f = asFlippable(el);
    if (f) this.flip = () => f.requestFlip();
    if (this.b) this.burn = () => this.b!.burn();
    ctx.raise(el);
    this.off = { x: el.body.px - cp.x, y: el.body.py - cp.y };
  }

  move(cp: Pt): void {
    this.el.body.setTarget({ x: cp.x + this.off.x, y: cp.y + this.off.y, rot: 0 });
  }
  release(): void {
    this.ctx.returnHome(this.el);
  }
  get consumed(): boolean {
    return this.b?.burning ?? false;
  }
}

/** Драг пачки: элементы едут группой с заданными сдвигами (форма/сжатие задаёт движок). Способности
 *  группы (flip всей стопки, burn) — задел на следующий шаг, пока не заданы (дроп в зону = возврат). */
export class GroupDrag implements DragPayload {
  readonly lead: TableElement;

  constructor(
    private readonly els: readonly TableElement[],
    private readonly offsets: readonly { dx: number; dy: number }[],
    private readonly ctx: DragContext,
  ) {
    this.lead = els[els.length - 1]!; // верхняя — представитель
    els.forEach((el, i) => {
      ctx.raise(el);
      el.root.zIndex = 1e6 + i; // вся пачка поверх всех, порядок сохранён
    });
  }

  move(cp: Pt): void {
    this.els.forEach((el, i) => {
      const o = this.offsets[i]!;
      el.body.setTarget({ x: cp.x + o.dx, y: cp.y + o.dy, rot: 0 });
    });
  }
  release(): void {
    for (const el of this.els) this.ctx.returnHome(el);
  }
  get consumed(): boolean {
    return false;
  }
}
