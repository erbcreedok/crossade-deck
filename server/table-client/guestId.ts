// ПОСТОЯННЫЙ ID ГОСТЯ — один браузер под одним именем всегда приходит под одним ключом, поэтому перезагрузка страницы возвращает его на тот же стул (`Table.join`
// ищет стул по `last`), а не заводит нового человека и новый стул на каждую загрузку.

const ID = /^[A-Za-z0-9_-]{16,64}$/;
const fresh = (): string => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);

/** Id этого браузера под этим именем. Нет памяти (приватное окно) — id только на эту загрузку. */
export function guestIdFor(name: string): string {
  const key = `crossade.guestId:${name}`;
  try {
    const had = localStorage.getItem(key);
    if (had && ID.test(had)) return had;
    const made = fresh();
    localStorage.setItem(key, made);
    return made;
  } catch {
    return fresh();
  }
}
