// Логический АТОМ поля слотов: контейнер = упорядоченный список членов по id (снизу→вверх, верх =
// последний) + правила приёма. Чистые функции над данными (иммутабельны) — модель сериализуется
// под будущий server-sync и тестируется без Pixi. ООП-визуал (Card/Piece) живёт отдельным слоем.
//
// Соответствие дизайну (GRID-DESIGN.md): «Container — атом; стек = стопка = слот-содержимое».
// `accepts` — предикат (вид 2 «правила»); `maxSize`/`locked` — структурные ограничения.

export interface Container {
  members: string[]; // id членов, снизу→вверх; верх = последний
  maxSize?: number; // потолок стопки
  locked?: boolean; // нельзя брать/добавлять
  accepts?: (id: string) => boolean; // что принимает (по id)
}

/** Можно ли принять члена: не заблокирован, не полон, проходит accepts. Резолвер зовёт ДО add. */
export function canAccept(c: Container, id: string): boolean {
  if (c.locked) return false;
  if (c.maxSize !== undefined && c.members.length >= c.maxSize) return false;
  return c.accepts ? c.accepts(id) : true;
}

/** Верхний член (или undefined у пустого). */
export function topId(c: Container): string | undefined {
  return c.members[c.members.length - 1];
}

export function size(c: Container): number {
  return c.members.length;
}

export function has(c: Container, id: string): boolean {
  return c.members.includes(id);
}

/** Положить ПОВЕРХ (в конец). Иммутабельно; проверку приёма делает резолвер (не add). */
export function add(c: Container, ids: string[]): Container {
  return { ...c, members: [...c.members, ...ids] };
}

/** Вставить на позицию j (реордер / insert-at). Иммутабельно. */
export function insert(c: Container, ids: string[], at: number): Container {
  const members = [...c.members];
  members.splice(at, 0, ...ids);
  return { ...c, members };
}

/** Убрать по id (порядок сохранён; отсутствующие игнорятся). Иммутабельно. */
export function remove(c: Container, ids: string[]): Container {
  const drop = new Set(ids);
  return { ...c, members: c.members.filter((m) => !drop.has(m)) };
}

/** Саб-ран: хвост от index до верха (солитёрный «хвост»/`grab: run`). */
export function runFrom(c: Container, index: number): string[] {
  return c.members.slice(index);
}
