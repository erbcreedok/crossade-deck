// Изолированное МУЛЬТИВЫДЕЛЕНИЕ, замкнутое на контейнер (GRID-DESIGN.md, «Мультиселект»). scope =
// id контейнера, в котором стартовало выделение; тоггл принимает фигуру ТОЛЬКО этого контейнера —
// «нельзя выделять фигуры вне неё». Порядок выноса — компаратор (дефолт = порядок выделения).
// Чистые функции над данными (транзиентное UI-состояние, не игровая правда).

export interface Selection {
  scope: string | null; // контейнер активного выделения (null = не в режиме)
  ids: string[]; // выделенные, в порядке добавления
}

export const EMPTY: Selection = { scope: null, ids: [] };

/** Войти в режим выделения для контейнера. */
export function begin(scope: string): Selection {
  return { scope, ids: [] };
}

export function active(sel: Selection): boolean {
  return sel.scope !== null;
}

export function has(sel: Selection, id: string): boolean {
  return sel.ids.includes(id);
}

/** Тоггл фигуры. owner — контейнер фигуры; если он не совпал со scope (или мы не в режиме) — no-op. */
export function toggle(sel: Selection, id: string, owner: string): Selection {
  if (sel.scope === null || owner !== sel.scope) return sel; // изоляция: чужой контейнер / не в режиме
  const ids = has(sel, id) ? sel.ids.filter((x) => x !== id) : [...sel.ids, id];
  return { ...sel, ids };
}

/** Выйти из режима / сбросить выделение. */
export function clear(): Selection {
  return EMPTY;
}

/** Порядок выноса набора: без компаратора — как выделяли; с ним — сорт (напр. по номиналу). */
export function ordered(sel: Selection, cmp?: (a: string, b: string) => number): string[] {
  return cmp ? [...sel.ids].sort(cmp) : [...sel.ids];
}
