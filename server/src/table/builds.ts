// НОЧНЫЕ СБОРКИ — снимки клиента стола на маке: `data/builds/<номер>/` с деревом репозитория на момент тега
// `night/b<номер>`. `?build=<номер>` собирает стол из снимка, без него — из живого дерева.
//
// Сервер при этом ВСЕГДА последний: снимок — только клиент. Фича, тронувшая сервер, в старой сборке ведёт себя
// не как в ту ночь, и в списке помечена звёздочкой.

/** Номер сборки из адреса: только целое положительное, иначе ничего. */
export function readBuild(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[0-9]{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

/** Снимки по убыванию: свежий сверху. */
export function sortBuilds(names: string[]): number[] {
  return names
    .map((n) => readBuild(n))
    .filter((n): n is number => n !== null)
    .sort((a, b) => b - a);
}
