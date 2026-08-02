import type { CrossadeState } from "./state";

// Дешёвая проверка «изменились ли ЗОНЫ между двумя снимками» — состав И порядок колоды, сброса,
// play-стопок и своей руки. Colyseus зовёт onStateChange на КАЖДЫЙ патч состояния (кто-то за
// столом нажал «готов» — это тоже патч), а пересборка дерева слотов и перекладка карт по домам
// нужна ТОЛЬКО когда зоны реально изменились; иначе сцена лишний раз дёргала бы карты (setTarget
// в ту же точку — не баг, но впустую) на каждое чужое телодвижение. HUD (счётчики/фаза/freeMode)
// читает снимок целиком и обновляется отдельно и всегда — эта функция только про геометрию доски.
//
// null prev (первый снимок после подключения) — всегда «не совпало»: рисовать ещё нечего.
export function sameZones(prev: CrossadeState | null, next: CrossadeState): boolean {
  if (!prev) return false;
  return (
    sameOrder(prev.deck, next.deck) &&
    sameOrder(prev.discard, next.discard) &&
    samePlay(prev.play, next.play) &&
    sameOrder(prev.selfHand, next.selfHand)
  );
}

/** Тот же порядок (не просто тот же состав — см. isPermutationOf в state.ts для состава). */
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function samePlay(a: readonly (readonly string[])[], b: readonly (readonly string[])[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!sameOrder(a[i]!, b[i]!)) return false;
  return true;
}
