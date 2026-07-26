import { dropOf, type Group, type Size, type Slot, type Vec } from "./types";

// Чистые ЧТЕНИЯ по дереву слотов. Вся геометрия ВЫТЕКАЕТ из дерева рекурсивно — per-container кода
// «где чей дом» нет, движок берёт homeOf и ставит spring-таргет одинаково для стопки/грида/поля.

// Габарит слота: лист → его размер; группа → размер из её раскладки (рекурсивно снизу вверх).
export function measure(s: Slot): Size {
  return s.kind === "leaf" ? s.size : s.layout.place(s.children.map(measure)).size;
}

// Все id фигур в поддереве (для раздачи домов/хит-тестов).
export function figures(s: Slot): string[] {
  return s.kind === "leaf" ? (s.figure ? [s.figure] : []) : s.children.flatMap(figures);
}

export function has(s: Slot, figure: string): boolean {
  return s.kind === "leaf" ? s.figure === figure : s.children.some((c) => has(c, figure));
}

// Абсолютный ЦЕНТР листа с фигурой (origin — top-left поддерева). Смещения копятся по пути корень→лист.
export function homeOf(s: Slot, figure: string, origin: Vec = { x: 0, y: 0 }): Vec | null {
  if (s.kind === "leaf") return s.figure === figure ? { x: origin.x + s.size.w / 2, y: origin.y + s.size.h / 2 } : null;
  const { at } = s.layout.place(s.children.map(measure));
  for (let i = 0; i < s.children.length; i++) {
    if (has(s.children[i]!, figure)) return homeOf(s.children[i]!, figure, { x: origin.x + at[i]!.x, y: origin.y + at[i]!.y });
  }
  return null;
}

// Путь индексов корень→лист с фигурой ([] если сам корень-лист держит её; null если нет).
export function pathTo(s: Slot, figure: string): number[] | null {
  if (s.kind === "leaf") return s.figure === figure ? [] : null;
  for (let i = 0; i < s.children.length; i++) {
    const sub = pathTo(s.children[i]!, figure);
    if (sub) return [i, ...sub];
  }
  return null;
}

const within = (cp: Vec, tl: Vec, s: Size): boolean => cp.x >= tl.x && cp.x <= tl.x + s.w && cp.y >= tl.y && cp.y <= tl.y + s.h;

// Глубочайшая группа-дропзона под АБСОЛЮТНОЙ точкой + локальный индекс вставки. Два разных вопроса,
// нарочно раздельно: (1) В КАКОГО ребёнка-дропзону спуститься — по накрытию его области, расширенной
// его же DropZone.pad; (2) КУДА вставить внутри выбранной группы — её собственной layout.indexAt.
// Спускаемся сквозь вложенные дропзоны (слот-дропзона, у которой дети тоже дропзоны).
export function dropTarget(root: Slot, cp: Vec, origin: Vec = { x: 0, y: 0 }): { group: Group; index: number } | null {
  if (root.kind === "leaf") return null;
  const sizes = root.children.map(measure);
  const { at } = root.layout.place(sizes);
  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i]!;
    const dz = child.kind === "group" ? dropOf(child) : undefined;
    if (child.kind === "group" && dz) {
      const co = { x: origin.x + at[i]!.x, y: origin.y + at[i]!.y };
      const pad = dz.pad ?? 0;
      const cs = measure(child);
      if (within(cp, { x: co.x - pad, y: co.y - pad }, { w: cs.w + 2 * pad, h: cs.h + 2 * pad })) {
        const deeper = dropTarget(child, cp, co);
        if (deeper) return deeper;
      }
    }
  }
  if (!dropOf(root)) return null;
  const idx = root.layout.indexAt({ x: cp.x - origin.x, y: cp.y - origin.y }, sizes);
  return { group: root, index: idx ?? root.children.length };
}
