import type { Container } from "pixi.js";
import { drawChip, drawChessPiece } from "./Piece";

// Реестр НЕ-карточных элементов ПО ТИПУ (задел registry элементов для BoardFactory: type→фабрика).
// Раньше создание фишек/фигур было раскидано по движку closures'ами `(root)=>drawChip/…` + дублями
// констант тени. Теперь один источник: спека типа → как рисовать (build) и силуэт тени (shadow).
// Новый тип элемента = добавить ветку сюда; движок/BoardFactory берут визуал по спеке, не рисуют сами.

export type PieceSpec =
  | { kind: "chip"; color: number; denom: string }
  | { kind: "chess"; dark: boolean; glyph: string };

export interface PieceVisual {
  build: (root: Container) => void; // рисует в ЛОКАЛЬНЫХ координатах (центр 0,0) — VIEW
  shadow: { rx: number; ry: number; dy: number }; // габарит тени: полуоси + сдвиг вниз
  /**
   * Насколько тень ПРИПЛЮСНУТА по вертикали (1 — копия предмета, 0.5 — вдвое ниже).
   *
   * Стоящая фигура — не лежащая карта: её тень падает на стол и укорачивается. Копия «за спиной»
   * читалась как продолжение самой фигуры, а не как тень.
   */
  flatten?: number;
}

/** Визуал элемента по типу. r — радиус (от размера карты/ячейки). */
export function pieceVisual(spec: PieceSpec, r: number): PieceVisual {
  switch (spec.kind) {
    case "chip":
      // Фишка лежит — тень почти круглая под ней.
      return { build: (root) => drawChip(root, r, spec.color, spec.denom), shadow: { rx: r * 0.98, ry: r * 0.86, dy: r * 0.12 } };
    case "chess":
      // Стоящая фигура — узкий овал у основания.
      // Габарит — по самой фигуре (им меряется «дальность» смещения), форму задаёт силуэт.
      // dy — сдвиг к ОСНОВАНИЮ: приплюснутый силуэт кладём подошвой туда, где фигура стоит.
      return { build: (root) => drawChessPiece(root, r * 2, spec.dark, spec.glyph), shadow: { rx: r * 0.62, ry: r * 1.25, dy: r * 0.62 }, flatten: 0.5 };
  }
}
