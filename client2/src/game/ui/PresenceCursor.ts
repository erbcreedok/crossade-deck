import { Container, Graphics, Text } from "pixi.js";
import { PIXEL_FONT } from "../engine/constants";

// КУРСОР ПРИСУТСТВИЯ — атом: цветная точка с кольцом и (опц.) именем. Один компонент на все
// применения: чужие курсоры в live, СВОЙ курсор своим цветом (без имени — своё имя под пальцем
// шум), витрина в каталоге. Своих pointer-событий не слушает — place() двигает владелец.

export interface PresenceCursorOptions {
  color: number;
  /** Имя рядом с точкой. Не задано — только точка (свой курсор). */
  label?: string;
}

export class PresenceCursor {
  readonly root = new Container();
  private readonly g = new Graphics();
  private readonly text: Text | null;
  private color: number;

  constructor(opts: PresenceCursorOptions) {
    this.color = opts.color;
    this.root.addChild(this.g);
    this.text = opts.label ? new Text({ text: opts.label, style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: opts.color } }) : null;
    if (this.text) {
      this.text.position.set(12, 10);
      this.root.addChild(this.text);
    }
    this.paint();
  }

  setColor(color: number): void {
    if (color === this.color) return;
    this.color = color;
    if (this.text) this.text.style.fill = color;
    this.paint();
  }

  place(x: number, y: number): void {
    this.root.position.set(x, y);
  }

  private paint(): void {
    this.g.clear();
    this.g.circle(0, 0, 6).fill({ color: this.color, alpha: 0.9 });
    this.g.circle(0, 0, 10).stroke({ width: 2, color: this.color, alpha: 0.45 });
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
