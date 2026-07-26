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

export type Slot = Leaf | Group;

export interface Leaf {
  kind: "leaf";
  id: string;
  figure: string | null; // фигура (карта/фишка/пешка) или её отсутствие
  size: Size; // футпринт ячейки (даже пустой лист резервирует место)
  accept?: (figure: string) => boolean;
  dropZone?: boolean;
}

export interface Group {
  kind: "group";
  id: string;
  children: Slot[];
  layout: Layout;
  reorder?: boolean; // можно ли переставлять детей по позиции дропа
  cap?: number; // макс. число детей (undefined — без предела)
  accept?: (figure: string) => boolean;
  dropZone?: boolean;
}

// Конструкторы — для читаемого построения дерева (в т.ч. в тестах).
export const leaf = (id: string, figure: string | null, size: Size, extra: Partial<Leaf> = {}): Leaf => ({ kind: "leaf", id, figure, size, ...extra });
export const group = (id: string, layout: Layout, children: Slot[], extra: Partial<Omit<Group, "kind" | "id" | "layout" | "children">> = {}): Group => ({ kind: "group", id, layout, children, ...extra });
