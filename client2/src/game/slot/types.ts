// Рекурсивная модель СЛОТОВ (Composite + Strategy). Слот — узел дерева: ЛИБО лист (держит 0/1
// фигуру), ЛИБО группа (упорядоченные дочерние слоты + раскладка). «Стопка / грид / поле / борд» —
// это один слот с разной Layout-стратегией и данными-ограничениями, а не разные классы. Чистая
// модель без Pixi. Правила игры (ход, легальность, счёт) — отдельный слой сверху, здесь их нет.

export interface Vec {
  x: number;
  y: number;
}
export interface Size {
  w: number;
  h: number;
}

// Раскладка группы — стратегия: ПРЯМАЯ (дети → позиции + габарит) и ОБРАТНАЯ (точка → индекс ребёнка).
// Именно замена стратегии даёт новый «тип контейнера»: 1D-стопка, 2D-грид, абсолют, потом кольцо/3D.
export interface Layout {
  place(childSizes: Size[]): { at: Vec[]; size: Size }; // at[i] — top-left ребёнка относительно top-left группы
  indexAt(cp: Vec, childSizes: Size[]): number | null; // cp локальна к top-left группы; null — мимо
}

// ——— СПОСОБНОСТИ (компоненты, Entity-Component) ———
// Каждая — самодостаточный конфиг, растущий НЕЗАВИСИМО и липнущий к любому слоту. Дорастить
// способность = править ТОЛЬКО её интерфейс, а не тип слота; новая способность = новый ключ в Caps.
// Операции (slot.ts/mutate.ts) — «системы», читающие эти компоненты.

export interface DropZone {
  // слот принимает дроп. Конфиг приёма растёт ЗДЕСЬ (accept/cap/pad/… — не в типе слота).
  accept?: (figure: string) => boolean;
  cap?: number; // макс. фигур/детей в этой зоне (undefined — без предела)
  pad?: number; // расширение области попадания вокруг содержимого (px), чтобы дроп у края ловился
}
export interface Reorderable {
  // детей можно переставлять по позиции дропа. Конфиг реордера растёт ЗДЕСЬ.
  enabled: boolean; // живой флаг (тоглер меняет)
}

// Набор способностей слота. Ключ = вид способности. Присутствие ключа = способность есть.
export interface Caps {
  drop?: DropZone;
  reorder?: Reorderable;
}

interface SlotBase {
  id: string;
  caps?: Caps; // способности налипают ЗДЕСЬ, на любой слот (и лист, и группу)
}

export type Slot = Leaf | Group;

export interface Leaf extends SlotBase {
  kind: "leaf";
  figure: string | null; // фигура (карта/фишка/пешка) или её отсутствие
  size: Size; // футпринт ячейки (даже пустой лист резервирует место)
}

export interface Group extends SlotBase {
  kind: "group";
  children: Slot[];
  layout: Layout;
}

// Аксессоры способностей — операции ходят через них, не лезут в поля напрямую.
export const dropOf = (s: Slot): DropZone | undefined => s.caps?.drop;
export const reorderOn = (s: Slot): boolean => s.caps?.reorder?.enabled ?? false;

// Конструкторы — для читаемого построения дерева (в т.ч. в тестах). caps — набор способностей.
export const leaf = (id: string, figure: string | null, size: Size, caps?: Caps): Leaf => ({ kind: "leaf", id, figure, size, ...(caps ? { caps } : {}) });
export const group = (id: string, layout: Layout, children: Slot[], caps?: Caps): Group => ({ kind: "group", id, layout, children, ...(caps ? { caps } : {}) });
