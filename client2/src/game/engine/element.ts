import type { Container } from "pixi.js";
import type { CardState, ShadowShape } from "../ui/Card";

// Контракт УПРАВЛЯЕМОГО ЭЛЕМЕНТА стола — то, от чего зависят системы движка (слои/тени/цикл/
// драг), ВМЕСТО конкретного Card. Реализовав его, любой элемент (карта, фишка, шахматная
// фигура) встаёт на то же место без правок систем. Разбит на способности (ISP): базовый
// TableElement + опциональные Draggable/Flippable/Burnable — элемент берёт нужные.

/** База: визуал, план (для слоёв), силуэт тени, участие в цикле. */
export interface TableElement {
  readonly id: string;
  readonly root: Container;
  state: CardState; // план — им levelOf раскладывает по слоям
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

/** Уничтожается «горением». */
export interface Burnable {
  burn(): void;
  readonly burning: boolean;
}
