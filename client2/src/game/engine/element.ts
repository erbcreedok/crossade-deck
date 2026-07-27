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
