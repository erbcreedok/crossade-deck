import type { Container } from "pixi.js";
import type { CardBody } from "../CardBody";
import type { CardState, ShadowShape } from "../ui/Card";

// Контракт УПРАВЛЯЕМОГО ЭЛЕМЕНТА стола — то, от чего зависят системы движка (слои/тени/цикл/
// драг), ВМЕСТО конкретного Card. Реализовав его, любой элемент (карта, фишка, шахматная
// фигура) встаёт на то же место без правок систем. Разбит на способности (ISP): базовый
// TableElement + опциональные Draggable/Flippable/Burnable — элемент берёт нужные.

/** База: визуал, план (для слоёв), силуэт тени, участие в цикле. */
export interface TableElement {
  readonly id: string;
  /**
   * Открытый словарь идентичности-ДАННЫХ (SELECTION-DESIGN §2): `card, suit:♦, rank:7, color:red`,
   * игра домешивает свои (`role:trump`). Предикаты (tagQuery) читают эти строки — движок ВЫЧИСЛЯЕТ,
   * не перечисляет. Отдельная ось от способностей (Peekable/Flippable — ISP-интерфейсы ниже).
   */
  readonly tags: ReadonlySet<string>;
  readonly root: Container;
  readonly body: CardBody; // пружинное тело: позиция/полёт (px/py/setTarget)
  state: CardState; // план — им levelOf раскладывает по слоям
  setState(s: CardState): void; // сменить план (масштаб/тень едут пружиной)
  readonly shadowRect: ShadowShape | null;
  readonly resting: boolean; // осел ли (для сна цикла)
  readonly dead: boolean; // пора убрать из сцены
  step(dt: number): void;
  sync(): void;
}

/** Можно ли тащить; иначе — «стоп»-кивок. */
export interface Draggable {
  readonly draggable: boolean;
  blockNudge(): void;
}

/** Переворачивается. */
export interface Flippable {
  requestFlip(): boolean;
}

/**
 * Скрытость — РЕЖИМ секретности: прячет значение реальной карты (у неё есть истинная
 * идентичность), включается/снимается ИЗВНЕ (хендлеры игры/сервера: раздал закрытым →
 * по прилёте reveal). Видимое в скрытом виде — маскирующая заглушка, не настоящее лицо.
 */
export interface Concealable {
  readonly concealed: boolean;
  setConcealed(v: boolean): void;
}

/**
 * «Подглядеть» — временно раскрыть скрытую/лежащую рубашкой карту, потом вернуть КАК БЫЛО. ЧТО
 * именно скрывает элемент (лицо, пыль-цензура, будущий конверт…) знает он сам: peekReveal раскрывает
 * и возвращает функцию-undo, восстанавливающую прежний вид. reveal и restore — ОДНА пара в одном
 * месте, поэтому разъехаться не могут (движок не прописывает поэлементно «перевернул → переверни
 * назад»); новая ось скрытия добавляется только тут, движок не трогаем.
 */
export interface Peekable {
  readonly canPeek: boolean; // есть ли что раскрывать — ЧИСТЫЙ предикат (armed-текст зоны читает его без мутаций)
  peekReveal(): (() => void) | null; // раскрыть сейчас; вернуть undo «как было». null — раскрывать нечего (canPeek === false)
}

/**
 * Значение (ранг/масть/кастом) отделено от КЛЮЧА (id) и может быть ПРИДЕРЖАНО: карта живёт с
 * ключом, но без значения (клиент его не знает — чужая скрытая карта), пока сервер/игра не
 * раскроют его через setValue. `hasValue === false` → значения нет, карта маскируется.
 */
export interface Valued {
  readonly hasValue: boolean;
  setValue(v: string): void;
}

/** Уничтожается «горением». */
export interface Burnable {
  burn(): void;
  readonly burning: boolean;
}

/** Способность СВЕТИТЬСЯ выделением (лок присутствия, будущий отбор набора). Свечение — атом в
 *  root'е элемента (ui/selection.makeGlow): едет с ним само, как собственная тень. */
export interface Glowable {
  /** figure — части фигуры (контент-единицы относительно центра элемента; прямоугольник или
   *  СОБСТВЕННЫЙ силуэт-снимок): один контур на целую стопку по СОЮЗУ форм (erase-пасс, как
   *  маска теней). Без figure — собственная форма элемента. */
  setGlow(color: number | null, figure?: readonly import("../ui/selection").GlowShape[]): void;
}
