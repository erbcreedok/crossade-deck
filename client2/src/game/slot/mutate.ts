import { dropTarget } from "./slot";
import { dropOf, reorderOn, type Group, type Leaf, type Slot, type Vec } from "./types";

// МУТАЦИИ дерева (движок держит одно дерево и меняет его на дропе, как раньше Field менял gridIds).

// Переставить ребёнка группы from→to. true если порядок изменился.
export function reorderChildren(g: Group, from: number, to: number): boolean {
  if (from === to || from < 0 || from >= g.children.length) return false;
  const [c] = g.children.splice(from, 1);
  g.children.splice(Math.max(0, Math.min(g.children.length, to)), 0, c!);
  return true;
}

// Вынуть лист с фигурой из его родителя (grow-политика: лист путешествует между группами). Мутирует.
export function detach(root: Slot, figure: string): Leaf | null {
  if (root.kind === "leaf") return null;
  for (let i = 0; i < root.children.length; i++) {
    const c = root.children[i]!;
    if (c.kind === "leaf" && c.figure === figure) {
      root.children.splice(i, 1);
      return c;
    }
    const deep = detach(c, figure);
    if (deep) return deep;
  }
  return null;
}

// Уронить фигуру в АБСОЛЮТНУЮ точку: глубочайшая дропзона под ней. Уже в этой группе и reorder →
// переставить по позиции; иначе перенести лист сюда (с учётом accept/cap). Мутирует дерево.
export function dropInto(root: Slot, figure: string, cp: Vec): { moved: boolean; reordered: boolean } {
  const target = dropTarget(root, cp);
  if (!target) return { moved: false, reordered: false };
  const g = target.group;
  const dz = dropOf(g); // dropTarget гарантирует, что это дропзона
  if (dz?.accept && !dz.accept(figure)) return { moved: false, reordered: false };

  const at = g.children.findIndex((c) => c.kind === "leaf" && c.figure === figure);
  if (at >= 0) {
    if (!reorderOn(g)) return { moved: false, reordered: false };
    return { moved: reorderChildren(g, at, target.index), reordered: true };
  }
  if (dz?.cap != null && g.children.length >= dz.cap) return { moved: false, reordered: false };
  const leaf = detach(root, figure);
  if (!leaf) return { moved: false, reordered: false };
  g.children.splice(Math.min(target.index, g.children.length), 0, leaf);
  return { moved: true, reordered: false };
}
