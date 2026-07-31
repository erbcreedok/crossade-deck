import { Container, Text } from "pixi.js";
import type { CardTextureCache } from "../ui/CardTextureCache";
import type { CardOptions } from "../ui/Card";
import type { Button } from "../ui/Button";
import type { DropZone } from "../ui/DropZone";
import type { DragPayload } from "../engine/drag";
import type { TableElement } from "../engine/element";
import type { Configurable } from "../ui/controls";
import type { Toggle } from "../ui/Toggle";
import type { Stepper } from "../ui/Stepper";
import type { Segmented } from "../ui/Segmented";
import { PIXEL_FONT } from "../engine/constants";

// ОБЩИЙ ЗНАМЕНАТЕЛЬ ДВУХ ХОЗЯЕВ СЕКЦИИ: песочницы (/playground) и витрины каталога (KitScene).
//
// Зачем он есть. Секции стенда — «Кнопки», «Дропзоны», «Фишки и фигуры» и прочие — жили методами
// PlaygroundEngine и адресовали его приватные поля. Показать их же в сторибуке можно было двумя
// способами: скопировать билдер в стори (тогда каталог начинает врать при первой же правке
// песочницы — это ДВЕ разные реализации одного экрана) либо дать обоим движкам ОДИН контракт и
// вынести билдер над ним. Второй способ и реализован здесь: секция — свободная функция
// (ctx, at) => {bottom, width}, а «куда именно лёг узел» знает хозяин.
//
// Контракт намеренно узкий и растёт ПО ФАКТУ переезда секции, а не заранее. Всё, что тут есть,
// понадобилось хотя бы одной уже перенесённой секции; ничего «про запас» здесь быть не должно —
// иначе это снова «весь движок», только под другим именем.

export interface Pt {
  x: number;
  y: number;
}

/** Что секция сообщает хозяину о занятом месте: нижняя граница и ширина содержимого. */
export interface SectionSize {
  bottom: number;
  width: number;
}

/** Слой стола, в который просится узел. Карты и тени в этот выбор не входят — их кладёт движок. */
export type DecorLayer = "surface" | "verb";

export interface SectionContext {
  /** Общий кэш текстур карт (переживает пересборку содержимого). */
  readonly tex: CardTextureCache;
  /** Масштаб карты относительно исходной текстуры. */
  readonly baseScale: number;
  /** Размер карты в координатах контента — единица измерения всей раскладки стенда. */
  readonly cardW: number;
  readonly cardH: number;

  /** Подпись: создать, положить в слой и вернуть (секции меряют её ширину). */
  label(text: string, x: number, y: number, size: number, fill: number, wrap?: number, anchorX?: number, layer?: DecorLayer): Text;
  /** Недрагабельный визуал: рамка, подложка, декор. */
  decor(node: Container, layer?: DecorLayer): void;
  /**
   * Карта секции. Хозяин сам решает, родить её сейчас (витрина) или отложенно из спека
   * (песочница копит спеки и спавнит карты ПОСЛЕ мебели). Секция про это знать не должна.
   */
  card(opts: CardOptions, home: Pt, depth?: number, bobPhase?: number): void;
  /** Кнопка: рисуется в стол, ввод роутит движок. at не задан — значит вызывающий уже её поставил. */
  button(b: Button, at?: Pt): Button;
  /** Дроп-зона с приёмом по СПОСОБНОСТЯМ груза (см. sceneEngine.registerZone). */
  zone(z: DropZone, onDrop: (p: DragPayload) => void, accepts: (p: DragPayload) => boolean, textFor?: (p: DragPayload) => { armed: string; hot: string }): DropZone;
  /** Есть ли грузу что подглядывать — зона «ПОДГЛЯДЕТЬ» меняет от этого свою подпись. */
  needsPeek(el: TableElement): boolean;
  /**
   * Канвасные виджеты параметров из Configurable (ui/controls.ts): number → Stepper, bool → Toggle,
   * choice → Segmented. Второй модели «что можно крутить» в проекте нет — из тех же params()
   * строится и панель сторибука (stories/harness/paramArgs.ts), поэтому разъехаться им негде.
   *
   * onChange не задан — просто будим цикл. Задан — хозяин обязан сам разбудить: раскладку после
   * правки параметра пересчитывает вызывающий (у Поля это переезд карт по новым домам).
   */
  controls(cfg: Configurable, at: Pt, onChange?: () => void): ControlsResult;
  /** Разбудить цикл после правки, сделанной секцией вне кадра. */
  wake(): void;
}

/** Что вернул attachControls: низ блока и сами виджеты (секции меряют их ширину, e2e — центры). */
export interface ControlsResult {
  bottom: number;
  toggles: Toggle[];
  segments: Segmented[];
  steppers: Stepper[];
}

/** Секция стенда: расставить содержимое от точки at и сказать, сколько места заняла. */
export type Section = (ctx: SectionContext, at: Pt) => SectionSize;

/**
 * Подпись стенда — ОДНА реализация на оба движка.
 *
 * Ужимание по ширине здесь не украшение: длинное слово без пробелов (напр. «удерживаемая») перенос
 * не ловит и вылезает за свою ячейку на соседа. Ужимаем масштабом вокруг якоря, чтобы центровка
 * под элементом сохранилась.
 */
export function makeLabel(text: string, x: number, y: number, size: number, fill: number, wrap?: number, anchorX = 0.5): Text {
  const t = new Text({
    text,
    style: { fontFamily: PIXEL_FONT, fontSize: size, fill, align: "center", wordWrap: wrap !== undefined, wordWrapWidth: wrap ?? 0 },
  });
  t.anchor.set(anchorX, 0);
  t.position.set(x, y);
  if (wrap !== undefined && t.width > wrap) t.scale.set(wrap / t.width);
  return t;
}
