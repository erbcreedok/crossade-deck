import type { Burnable, Concealable, Flippable, TableElement } from "./element";

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
  flipGroup(els: readonly TableElement[]): void; // перевернуть пачку целиком (реверс + синхронный флип)
  startPeek(els: readonly TableElement[]): boolean; // «поглядеть»: снять скрытность на время; false = нечего было (уже видно), карта(ы) не поглощены (см. freeDeskEngine)
}

export interface DragPayload {
  readonly lead: TableElement; // представитель (для edge-scroll и т.п.)
  move(cp: Pt): void; // вести за пальцем
  release(): void; // вернуть на места
  readonly consumed: boolean; // элемент(ы) «поглощены» (горят/поглядели) — возвращать не надо
  flip?(): void; // если поддерживает переворот
  burn?(): void; // если поддерживает сжигание
  peek?(): void; // если поддерживает скрытность («поглядеть» — только карты, см. Concealable)
}

function asFlippable(el: TableElement): Flippable | null {
  return "requestFlip" in el ? (el as unknown as Flippable) : null;
}
function asBurnable(el: TableElement): Burnable | null {
  return "burn" in el ? (el as unknown as Burnable) : null;
}
function asConcealable(el: TableElement): Concealable | null {
  return "setConcealed" in el ? (el as unknown as Concealable) : null;
}

/** Драг одной карты/элемента. Способности flip/burn делегируются, если элемент их реализует. */
export class SingleDrag implements DragPayload {
  readonly lead: TableElement;
  private readonly off: Pt;
  private readonly b: Burnable | null;
  private peeked = false; // «поглядели» — как и burning, «поглощено», домой в release() не возвращаем
  flip?: () => void;
  burn?: () => void;
  peek?: () => void;

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
    if (asConcealable(el))
      this.peek = () => {
        this.peeked = ctx.startPeek([el]); // false, если карте уже нечего было подглядывать
      };
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
    return (this.b?.burning ?? false) || this.peeked;
  }
}

/** Драг пачки: элементы едут группой с заданными сдвигами (форма/сжатие задаёт движок). Способности
 *  группы (flip всей стопки, burn) — задел на следующий шаг, пока не заданы (дроп в зону = возврат). */
export class GroupDrag implements DragPayload {
  readonly lead: TableElement;
  private peeked = false;
  flip?: () => void; // переворот всей пачки — делегируется движку (реверс + синхронный флип)
  burn?: () => void; // сжечь пачку — жжём каждый элемент (каждый своей анимацией)
  peek?: () => void; // «поглядеть» всей пачкой — только если ВСЕ элементы Concealable (см. asConcealable)

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
    if (els.every((el) => asFlippable(el))) this.flip = () => ctx.flipGroup(els);
    if (els.every((el) => asBurnable(el))) this.burn = () => els.forEach((el) => asBurnable(el)?.burn());
    if (els.every((el) => asConcealable(el)))
      this.peek = () => {
        this.peeked = ctx.startPeek(els); // false, если ни одной карте не было нужды подглядывать
      };
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
    return this.els.some((el) => asBurnable(el)?.burning) || this.peeked;
  }
}
