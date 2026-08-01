import { Container, Graphics, Text } from "pixi.js";
import type { CardTextureCache } from "../ui/CardTextureCache";
import type { PieceSpec } from "../ui/pieceKinds";
import type { Marker, MarkerHost, ShowPolicy } from "../engine/marker";
import type { CardOptions, Pose } from "../ui/Card";
import type { Command } from "../engine/command";
import type { Button } from "../ui/Button";
import type { DropZone } from "../ui/DropZone";
import type { DragPayload } from "../engine/drag";
import type { TableElement } from "../engine/element";
import type { Configurable } from "../ui/controls";
import type { Toggle } from "../ui/Toggle";
import type { Stepper } from "../ui/Stepper";
import type { Segmented } from "../ui/Segmented";
import { PIXEL_FONT } from "../engine/constants";
import { fitText } from "../ui/boxFit";
import type { AnimPreset } from "../anim/presets";

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
  /** Поворот дома, рад. Нужен раскладкам, где карта не только СДВИНУТА, но и НАКЛОНЕНА (веер).
   *  Не задан — 0, то есть все прежние вызовы значат ровно то же, что значили. */
  rot?: number;
}

/**
 * Как фишка СТОИТ на столе: поза покоя и дыхание. Объектом, а не двумя хвостовыми аргументами, —
 * у карты это тоже объект (`CardOptions`), и порядок позиционных флагов помнить незачем.
 */
export interface PiecePlan {
  pose?: Pose;
  /** Дышит ли. Не задано — по позе: поднятая дышит, лежащая нет (ui/elevation.ts). */
  idle?: boolean;
}

/** Что секция сообщает хозяину о занятом месте: нижняя граница и ширина содержимого. */
export interface SectionSize {
  bottom: number;
  width: number;
}

/** Слой стола, в который просится узел. Карты и тени в этот выбор не входят — их кладёт движок. */
export type DecorLayer = "surface" | "verb";

/** Как выглядит и когда видна метка-якорь. Драггер (грип) у стенда один на всех — см. markerIcons. */
export interface MarkerLook {
  draw: (g: Graphics) => void;
  show: ShowPolicy;
}

/**
 * Созданная пара меток и host цели. Хозяину нужны и метки (его e2e-хуки читают координаты грипа),
 * и host — чтобы цель можно было захватить не только за метку (напр. режим «тащить всю стопку»).
 */
export interface MarkerPair {
  dragger: Marker;
  anchor: Marker;
  host: MarkerHost;
}

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
  /**
   * Не-карточный элемент стола: фишка, шахматная фигура. Визуал берётся из реестра по спеке
   * (ui/pieceKinds.ts), дальше он живёт ровно как карта — тот же драг, тени, слои, метки.
   * r — радиус; габарит элемента r*2.
   */
  piece(id: string, home: Pt, spec: PieceSpec, r: number, depth?: number, plan?: PiecePlan): void;
  /** Метки на ОДИНОЧНЫЙ элемент по id: грип едет с ним, якорь стоит дома по своей политике. */
  solo(id: string, slot: Pt, anchor: MarkerLook, label?: string): MarkerPair;
  /** Метки на ГРУППУ по id: за грип тянется вся пачка целиком (GroupDrag). */
  pile(ids: readonly string[], slot: Pt, anchor: MarkerLook): MarkerPair;
  /**
   * Карта, которой двигает API, а не палец: разделы вроде «Управления» показывают ПОРТ КОМАНД
   * (сервер/консоль/скрытая логика), и подставлять там драгабельную карту значило бы показывать
   * другой сценарий. В хит-тест драга такая карта не попадает.
   */
  apiCard(opts: CardOptions, home: Pt): void;
  /**
   * Исполнить команду управления доской — единая дверь всех драйверов (engine/command.ts,
   * CONTROL-DESIGN.md). Секция «Управление» демонстрирует именно её, а не прямые сеттеры: обход
   * этой двери и есть то, чего в игре быть не должно.
   */
  dispatch(cmd: Command): void;
  /** Кнопка: рисуется в стол, ввод роутит движок. at не задан — значит вызывающий уже её поставил. */
  button(b: Button, at?: Pt): Button;
  /** Дроп-зона с приёмом по СПОСОБНОСТЯМ груза (см. sceneEngine.registerZone). */
  zone(z: DropZone, onDrop: (p: DragPayload) => void, accepts: (p: DragPayload) => boolean, textFor?: (p: DragPayload) => { armed: string; hot: string }): DropZone;
  /** Есть ли грузу что подглядывать — зона «ПОДГЛЯДЕТЬ» меняет от этого свою подпись. */
  needsPeek(el: TableElement): boolean;
  /**
   * Живой элемент по id. Нужен секциям, которые ДЁРГАЮТ элемент напрямую там, где порта команд не
   * хватает: «сжечь» — не команда доски, а собственная анимация элемента; рычаги пыли крутят поле
   * частиц внутри карты. Всё, что выражается командой, обязано идти через dispatch.
   */
  element(id: string): TableElement | undefined;
  /**
   * Канвасные виджеты параметров из Configurable (ui/controls.ts): number → Stepper, bool → Toggle,
   * choice → Segmented. Второй модели «что можно крутить» в проекте нет — из тех же params()
   * строится и панель сторибука (stories/harness/paramArgs.ts), поэтому разъехаться им негде.
   *
   * onChange не задан — просто будим цикл. Задан — хозяин обязан сам разбудить: раскладку после
   * правки параметра пересчитывает вызывающий (у Поля это переезд карт по новым домам).
   */
  controls(cfg: Configurable, at: Pt, onChange?: () => void): ControlsResult;
  /**
   * Перевернуть ПАЧКУ по id. Отдельно от `dispatch({t:"flip"})` намеренно: тот переворачивает ОДИН
   * элемент, а у пачки переворот — своя операция с расписанием и, возможно, реверсом порядка
   * (anim/flipSchedule.ts). Свести их в одну команду значило бы спрятать это различие.
   */
  flipStack(ids: readonly string[]): void;
  /**
   * Назначить фил анимаций КОНКРЕТНЫМ элементам. Без этого пресет был бы свойством всей сцены, и
   * две стопки на одном столе не могли бы вести себя по-разному — а именно этого от пресетов и
   * ждут: колода складывается сухо, сброс вальяжно, оба на одном экране.
   */
  setAnimPreset(ids: readonly string[], preset: AnimPreset): void;
  /** Проиграть появление заново — у ЖИВЫХ элементов. Мёртвых (сгоревших) в реестре уже нет. */
  appear(ids: readonly string[]): void;
  /**
   * Выполнить через `delay` секунд жизни сцены. Именно сцены, а не setTimeout: своё время
   * переживёт пересборку и выстрелит в уже несуществующие элементы.
   */
  after(delay: number, fn: () => void): void;
  /** Сколько летит элемент при команде move — по стилю его пресета. Сценариям нужен этот момент. */
  moveDuration(id: string): number;
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
  // Ужимаем ТЕМ ЖЕ правилом, что кнопка и шильдик (ui/boxFit.ts): «влезло» должно значить одно и
  // то же во всём столе, иначе подписи ужимаются по трём слегка разным формулам.
  if (wrap !== undefined) t.scale.set(fitText({ box: { w: wrap, h: t.height }, text: { w: t.width, h: t.height }, axis: "horizontal" }));
  return t;
}
