import type { Container, Renderer, Texture } from "pixi.js";
import type { TableItem } from "./tableItem";
import { makeBuilt, type BuiltOptions } from "./builtKind";
import { drawChip, drawChessPiece, drawWidget } from "./pieceDraw";
import { ownShadowOf } from "./silhouetteExtract";
import { buildTextureDustPoints } from "../engine/censorSource";

// Реестр НЕ-карточных элементов ПО ТИПУ (задел registry элементов для BoardFactory: type→фабрика).
// Раньше создание фишек/фигур было раскидано по движку closures'ами `(root)=>drawChip/…` + дублями
// констант тени. Теперь один источник: спека типа → как рисовать (build) и силуэт тени (shadow).
// Новый тип элемента = добавить ветку сюда; движок/BoardFactory берут визуал по спеке, не рисуют сами.

export type PieceSpec =
  | { kind: "chip"; color: number; denom: string }
  | { kind: "chess"; dark: boolean; glyph: string }
  | { kind: "widget"; label: string; w: number; h: number };

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

/** Визуал элемента по типу. r — радиус (от размера карты/ячейки); у виджета — свои w/h. */
export function pieceVisual(spec: PieceSpec, r: number): PieceVisual {
  switch (spec.kind) {
    case "widget":
      // Плашка лежит — тень габаритом под ней (как у фишки), своей формы снимать нечего.
      return { build: (root) => drawWidget(root, spec.w, spec.h, spec.label), shadow: { rx: spec.w * 0.48, ry: spec.h * 0.4, dy: spec.h * 0.08 } };
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
  if (spec.kind === "widget") return `widget:${spec.label}:${spec.w}x${spec.h}`;
  return spec.kind === "chip" ? `chip:${spec.color}:${spec.denom}:${size}` : `chess:${spec.dark ? "dark" : "light"}:${spec.glyph}:${size}`;
}

/**
 * Собрать живой предмет по спеке: визуал из реестра плюс, если тип того требует, форма тени,
 * снятая с этого самого визуала.
 *
 * Собирается в ОДНОМ месте, а не у каждого движка: витрина и песочница создают предметы одинаково,
 * и «снять форму» — часть того, что значит создать предмет, а не отдельная забота вызывающего.
 */
export function buildPiece(id: string, spec: PieceSpec, r: number, renderer: Renderer | null | undefined, plan: Partial<BuiltOptions> = {}): TableItem {
  const v = pieceVisual(spec, r);
  // Снимок визуала один на всё: и форма тени, и источник пыли-цензуры. Второй снимок того же
  // предмета означал бы два разных «настоящих лица» у одной фигуры.
  const shot = v.ownShadow || plan.censored ? ownShadowOf(renderer, pieceKey(spec, r), v.build) : null;
  const own = v.ownShadow ? shot : null;
  const censorSeeds = plan.censored && shot && renderer ? dustOf(renderer, shot, r) : null;
  const foot = spec.kind === "widget" ? { w: spec.w, h: spec.h } : { w: r * 2, h: r * 2 };
  return makeBuilt(spec.kind, { id, ...foot, build: v.build, shadow: v.shadow, own, censorSeeds, ...plan });
}

/** Облако пыли по снимку предмета: сетка меряется ЕГО коробкой, а не карточной. */
function dustOf(renderer: Renderer, shot: { texture: Texture; bounds: { width: number; height: number } }, r: number): ReturnType<typeof buildTextureDustPoints> {
  const step = Math.max(2, Math.round((r * 2) / 22)); // ~22 клетки на предмет: как у карты по ширине
  // Вес РАВНОМЕРНЫЙ: у фигуры общий тон — она сама, и карточное взвешивание по непохожести
  // оставило бы пыль на одной обводке, ровно мимо того, что цензура обязана скрыть.
  return buildTextureDustPoints(renderer, shot.texture, {
    step,
    perCell: 2,
    size: { w: shot.bounds.width, h: shot.bounds.height },
    weight: () => 1,
  });
}
