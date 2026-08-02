import type { Container, Renderer } from "pixi.js";
import { drawChip, drawChessPiece, Piece, type PieceOptions } from "./Piece";
import { ownShapeOf } from "./silhouetteExtract";

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
   * Снимать ли форму тени С САМОГО ВИЗУАЛА (ui/silhouetteExtract.ts).
   *
   * Стоит у всего, чья форма НЕ описывается габаритом: у коня тень коня, у ферзя — ферзя, а если
   * завтра на столе окажется машина, у неё будет тень машины, и ничего для этого дописывать не
   * придётся. Лежащей фишке это не нужно — эллипс и есть её форма.
   */
  ownShadow?: boolean;
}

/** Визуал элемента по типу. r — радиус (от размера карты/ячейки). */
export function pieceVisual(spec: PieceSpec, r: number): PieceVisual {
  switch (spec.kind) {
    case "chip":
      // Фишка лежит — тень почти круглая под ней.
      return { build: (root) => drawChip(root, r, spec.color, spec.denom), shadow: { rx: r * 0.98, ry: r * 0.86, dy: r * 0.12 } };
    case "chess":
      // Тень фигуры — её собственная форма, снятая с этого же визуала: у коня конь, у ферзя ферзь.
      // Дальше она живёт по ОБЩЕМУ закону стола (ui/shadow.ts) — то же смещение, тот же свет, что
      // у карты и у фишки. Своего «низкого солнца сбоку» у фигуры нет: свет на столе один, и
      // растянутая вбок тень рядом с картой, у которой тень под ней, читается как чужая.
      // Габарит рядом — на случай, когда снять форму нечем (нет рендерера): лучше пятно у ног,
      // чем предмет без тени.
      return {
        build: (root) => drawChessPiece(root, r * 2, spec.dark, spec.glyph),
        shadow: { rx: r * 0.6, ry: r * 0.26, dy: r * 0.92 },
        ownShadow: true,
      };
  }
}

/** Вид предмета одной строкой: тип, его отличия и размер. Ключ кэша снятых форм. */
export function pieceKey(spec: PieceSpec, r: number): string {
  const size = Math.round(r * 100) / 100;
  return spec.kind === "chip" ? `chip:${spec.color}:${spec.denom}:${size}` : `chess:${spec.dark ? "dark" : "light"}:${spec.glyph}:${size}`;
}

/**
 * Собрать живой предмет по спеке: визуал из реестра плюс, если тип того требует, форма тени,
 * снятая с этого самого визуала.
 *
 * Собирается в ОДНОМ месте, а не у каждого движка: витрина и песочница создают предметы одинаково,
 * и «снять форму» — часть того, что значит создать предмет, а не отдельная забота вызывающего.
 */
export function buildPiece(id: string, spec: PieceSpec, r: number, renderer: Renderer | null | undefined, plan: Partial<PieceOptions> = {}): Piece {
  const v = pieceVisual(spec, r);
  const own = v.ownShadow ? ownShapeOf(renderer, pieceKey(spec, r), v.build) : null;
  return new Piece({ id, w: r * 2, h: r * 2, build: v.build, shadow: v.shadow, silhouette: own?.poly ?? null, ...plan });
}
