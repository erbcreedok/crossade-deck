// ЧИСТАЯ политика видимости меток — БЕЗ Pixi, только данные + функция. Вынесено из marker.ts
// (view) ради портируемости: `ShowPolicy` = enum-подобный литерал, `shouldShow` = switch. На
// Swift/Java ложится 1:1 (enum + switch), без замыканий-как-стратегии. Это же кусок будущего
// core↔canvas-шва (N2): политика — в core, рисование метки — в canvas.

/**
 * Словарь иконок якоря — ДАННЫЕ, а не функции рисования. Конфиг цели (напр. StackConfig) ссылается
 * на иконку по id, поэтому остаётся сериализуемым и переносимым; кто и чем её рисует, знает только
 * слой отрисовки (kit/markerIcons.ts). Открытый словарь: добавить иконку = строка тут + фабрика там.
 */
export type AnchorIconId = "anchor" | "ring" | "pin";
export const ANCHOR_ICON_IDS: readonly AnchorIconId[] = ["anchor", "ring", "pin"];

/** Состояние контейнера для меток: сколько элементов в родном слоте / всего живо. */
export interface MarkerState {
  atHome: number; // элементов, стоящих в своём слоте (не в драге)
  total: number; // всего живых элементов
}

/** Когда метка видна — ДАННЫЕ, не предикат-замыкание. */
export type ShowPolicy =
  | "always" // всегда
  | "atHome" // пока хоть что-то дома (дефолт драггера)
  | "away" // контейнер унесли (дома пусто, но элементы живы)
  | "empty" // все элементы уничтожены
  | "gone"; // ничего нет дома (унесли ИЛИ пусто)

/** Видна ли метка при данном состоянии. Чистая; switch → портируется как enum+switch. */
export function shouldShow(policy: ShowPolicy, s: MarkerState): boolean {
  switch (policy) {
    case "always":
      return true;
    case "atHome":
      return s.atHome > 0;
    case "away":
      return s.atHome === 0 && s.total > 0;
    case "empty":
      return s.total === 0;
    case "gone":
      return s.atHome === 0;
  }
}
