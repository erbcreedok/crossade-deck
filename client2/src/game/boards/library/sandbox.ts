import type { BoardSpec } from "../spec";
import { deck36 } from "./decks";

// ПЕСОЧНИЦА — собирается по шагам. Шаг 1: ОДНА зона — серый бокс, в центре закрытая колода (36).
// Колода таскается целиком как блок; бросить её можно ТОЛЬКО в этот бокс — при дропе мимо колода
// летит назад, откуда её подняли. Бокс никак не подсвечивается. Из колоды пока ничего не тянется.
export function sandboxBoard(): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "sandbox",
    title: "",
    elements: cards,
    zones: [
      {
        id: "deck",
        title: "",
        layout: { kind: "free" },
        cell: { w: 640, h: 1000 }, // серый бокс — область, в пределах которой живёт колода (крупный)
        policy: { onOccupied: "merge" },
        setup: { 0: ids },
        focusable: true, // дабл-тап по пустому боксу наводит камеру на него (на колоду — нет)
      },
      {
        // Квадратный грид В ЦЕНТРЕ бокса: карты кладутся В РЯД по индексу (без x/y), заполняется
        // рядами и растёт вниз. Пока просто дроп-зона — из колоды карты ещё не тянутся.
        id: "table",
        title: "",
        layout: { kind: "flow", cols: { min: 3, max: 3 }, rows: { min: 3 }, grow: "down", center: true },
        frame: "dashed", // стиль дроп-зоны
        policy: { onOccupied: "merge" },
        focusable: true, // дабл-тап по гриду наводит камеру на него
      },
    ],
    seats: { count: { fixed: 1 }, show: "none", swap: false },
    actions: [],
  };
}
