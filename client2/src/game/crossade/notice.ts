// НАДПИСИ СЕТЕВОГО СТОЛА — два коллаборатора хрома, оба самогасящиеся: сцене не нужно ни держать
// таймер, ни помнить, что было показано.
//
//   • SceneNotice — короткий отказ сервера (action_rejected): что произошло, читается и исчезает;
//   • SceneShout — клич «ГОУ!» на весь стол: событие, а не сообщение, поэтому крупно и по центру.
//
// Гаснут через api.after: общего cancel у таймеров сцены нет, поэтому повторный показ не отменяет
// прежний таймер — он просто застаёт надпись уже видимой и гасит её. Для надписи это ровно то, что
// нужно (последняя живёт свои секунды), заводить token, как у ожидания хода, тут не за чем.

import { Text } from "pixi.js";
import type { Container } from "pixi.js";
import { PIXEL_FONT, SHOUT_TEXT, SHOUT_COLORS } from "../engine/constants";

/** Двери движка, нужные надписи: слой хрома и пробуждение цикла (текст сам себя не перерисует).
 *  SceneApi подходит сюда сам — форма совпадает структурно, переходник не нужен. */
export interface NoticeDeps {
  chromeAdd(c: Container): void;
  wake(): void;
  after(sec: number, fn: () => void): void;
}

const NOTICE_S = 2;
const SHOUT_S = 1.4;

export class SceneNotice {
  private readonly label: Text;

  constructor(private readonly deps: NoticeDeps) {
    this.label = new Text({ text: "", style: { fontFamily: PIXEL_FONT, fontSize: 18, fill: 0xe0483f, align: "center" } });
    this.label.anchor.set(0.5, 0);
    this.label.visible = false;
    deps.chromeAdd(this.label);
  }

  show(text: string): void {
    this.label.text = text;
    this.label.visible = true;
    this.deps.wake();
    this.deps.after(NOTICE_S, () => {
      this.label.visible = false;
      this.deps.wake();
    });
  }

  /** Верхний центр надписи в координатах хрома (экран). */
  place(x: number, y: number): void {
    this.label.position.set(x, y);
  }

  /** Что видно СЕЙЧАС — для дев-хуков: погашенная надпись текст всё ещё помнит. */
  shown(): string {
    return this.label.visible ? this.label.text : "";
  }
}

export class SceneShout {
  private readonly label: Text;

  constructor(private readonly deps: NoticeDeps) {
    this.label = new Text({
      text: SHOUT_TEXT,
      style: { fontFamily: PIXEL_FONT, fontSize: 56, fill: SHOUT_COLORS.fill, align: "center" },
    });
    this.label.anchor.set(0.5);
    this.label.visible = false;
    deps.chromeAdd(this.label);
  }

  show(): void {
    this.label.visible = true;
    this.deps.wake();
    this.deps.after(SHOUT_S, () => {
      this.label.visible = false;
      this.deps.wake();
    });
  }

  /** Центр клича — середина экрана (см. layoutChrome сцены). */
  place(x: number, y: number): void {
    this.label.position.set(x, y);
  }
}
