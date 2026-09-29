// АДРЕС СТРАНИЦЫ ХОЗЯИНА — всё, что выбрано, живёт в якоре ссылки рядом с ключом (`#key=…&tab=parts&part=king:head…`):
// обновил страницу или переслал ссылку себе — открыто то же самое. Якорь не уходит ни в сеть, ни в журналы стола.
//
// Правка выбора (`put`) переписывает текущую запись истории; переход на другую страницу внутри вкладки — спрайт
// (`go`) — новая запись, чтобы «назад» возвращал к прежней. Любой переход назад-вперёд будит подписчиков (`onRoute`).

type Value = string | number | boolean | null | undefined;

const read = (): URLSearchParams => new URLSearchParams(location.hash.slice(1));

/** Значение из адреса — или запасное. */
export function route(name: string): string | null {
  return read().get(name);
}
export const routeNum = (name: string, or: number): number => { const v = Number(route(name)); return route(name) !== null && Number.isFinite(v) ? v : or; };
export const routeOne = <T extends string>(name: string, allowed: readonly T[], or: T): T => { const v = route(name); return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : or; };

function write(patch: Record<string, Value>, push: boolean): void {
  const q = read();
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "" || v === false) q.delete(k);
    else q.set(k, v === true ? "1" : String(v));
  }
  const url = `${location.pathname}${location.search}#${q.toString()}`;
  if (url === `${location.pathname}${location.search}${location.hash}`) return;
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

/** Запомнить выбор в адресе (без новой записи истории). Пустое значение — убрать из адреса. */
export const put = (patch: Record<string, Value>): void => write(patch, false);
/** Перейти: новая запись истории — «назад» вернёт. */
export const go = (patch: Record<string, Value>): void => write(patch, true);

const heard = new Set<() => void>();
/** Позовут, когда адрес сменился переходом назад-вперёд. */
export function onRoute(fn: () => void): void {
  heard.add(fn);
}
addEventListener("popstate", () => { for (const fn of heard) fn(); });
