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

// Глубочайшая группа-дропзона под АБСОЛЮТНОЙ точкой + локальный индекс вставки. Спускаемся сквозь
// вложенные дропзоны (слот-дропзона, у которой дети тоже дропзоны). null — под точкой дропзоны нет.
export function dropTarget(root: Slot, cp: Vec, origin: Vec = { x: 0, y: 0 }): { group: Group; index: number } | null {
  if (root.kind === "leaf") return null;
  const sizes = root.children.map(measure);
  const { at } = root.layout.place(sizes);
  const local = { x: cp.x - origin.x, y: cp.y - origin.y };
  const idx = root.layout.indexAt(local, sizes);
  if (idx != null && idx >= 0 && idx < root.children.length) {
    const child = root.children[idx]!;
    if (child.kind === "group" && dropOf(child)) {
      const deeper = dropTarget(child, cp, { x: origin.x + at[idx]!.x, y: origin.y + at[idx]!.y });
      if (deeper) return deeper;
    }
  }
  return dropOf(root) ? { group: root, index: idx ?? root.children.length } : null;
}
