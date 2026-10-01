// ЗАДЕРЖКА СЕТИ ДЛЯ СТЕНДА — `&lag=300`: намерения и команды уходят на стол через столько мс, как по медленной связи.
// Так на стенде (стол в этой же вкладке) видно всё, что экран рисует «после ответа»: на быстром локальном столе ответ
// приходит раньше следующего кадра, и скачок «карта вернулась на место, потом полетела» не виден.

import type { TableStore } from "./store.js";

export function slowed<S extends TableStore>(store: S, ms: number): S {
  if (!(ms > 0)) return store;
  return new Proxy(store, {
    get: (target, key) => (key === "send" || key === "command" ? (x: never) => void setTimeout(() => (target[key] as (x: never) => void)(x), ms) : Reflect.get(target, key)),
  });
}

/** Задержка из адреса страницы (`&lag=`), мс; нет — ноль. */
export const lagFromUrl = (search: string): number => Number(new URLSearchParams(search).get("lag")) || 0;
