import { add, insert, remove, type Container } from "./container";

// Board = поле слотов: ключ слота ("r,c" или любой стабильный id) → Container. Чистые иммутабельные
// переходы над Record (сериализуется под server-sync). Геометрия слотов — ОТДЕЛЬНЫЙ layout-модуль;
// здесь только логика «что в каком слоте».
//
// onEmpty — СТРУКТУРНЫЙ дефолт опустевшего слота: `collapse` (слот исчезает) | `keep` (остаётся
// пустой контейнер-«сумка»). Кастомные исходы (refill из колоды и пр.) — Action слоем выше, не тут.

export interface Board {
  slots: Record<string, Container>;
  onEmpty?: "collapse" | "keep";
}

/** Фабрика контейнера для НОВОГО слота (makeContainer knob). Дефолт — голый контейнер. */
export type MakeContainer = (ids: string[]) => Container;
const bareContainer: MakeContainer = (ids) => ({ members: ids });

export function at(b: Board, key: string): Container | undefined {
  return b.slots[key];
}

export function isEmpty(b: Board, key: string): boolean {
  const c = b.slots[key];
  return !c || c.members.length === 0;
}

export function occupiedKeys(b: Board): string[] {
  return Object.keys(b.slots).filter((k) => b.slots[k]!.members.length > 0);
}

/** Поставить контейнер в слот (создать/заменить). Иммутабельно. */
export function place(b: Board, key: string, container: Container): Board {
  return { ...b, slots: { ...b.slots, [key]: container } };
}

/** Удалить слот целиком. Иммутабельно. */
function clearSlot(b: Board, key: string): Board {
  const slots = { ...b.slots };
  delete slots[key];
  return { ...b, slots };
}

/** Убрать членов из слота; если опустел — применить onEmpty (collapse удаляет, keep оставляет пустой). */
export function removeFrom(b: Board, key: string, ids: string[]): Board {
  const c = b.slots[key];
  if (!c) return b;
  const next = remove(c, ids);
  if (next.members.length === 0 && (b.onEmpty ?? "collapse") === "collapse") return clearSlot(b, key);
  return place(b, key, next);
}

/** Перенести членов из одного слота в другой: remove(source)+add(target). В пустой/новый слот
 *  контейнер рождается через mk (makeContainer). Приём (canAccept) проверяет резолвер ДО move. */
export function move(b: Board, fromKey: string, toKey: string, ids: string[], mk: MakeContainer = bareContainer): Board {
  const nb = removeFrom(b, fromKey, ids);
  const tgt = at(nb, toKey);
  const container = tgt ? add(tgt, ids) : mk(ids);
  return place(nb, toKey, container);
}

/** Реордер внутри слота: вынуть ids и вставить на позицию at (insert-at). Иммутабельно. */
export function reorder(b: Board, key: string, ids: string[], atIndex: number): Board {
  const c = b.slots[key];
  if (!c) return b;
  return place(b, key, insert(remove(c, ids), ids, atIndex));
}
