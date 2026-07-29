import { Container, Graphics, Text } from "pixi.js";
import { PIXEL_FONT } from "../engine/constants";
import { Button } from "./Button";

// Выбор из вариантов (сегментный переключатель): подпись + ряд текст-кнопок + золотая черта
// под активной. Отдельная переиспользуемая сущность (не про Борд — про «параметр-выбор»), по
// образцу Toggle (bool) / Stepper (number) — третий вид Param (choice) получает свой виджет,
// а не остаётся инлайновой отрисовкой (был playgroundEngine.ts::segToggle до этого рефакторинга).
// Кнопки сама не слушает — как все Button, ввод ведёт движок, поэтому отдаёт их через buttons().

export interface SegmentedOptions {
  label: string;
  options: string[];
  value: number; // индекс активного варианта
  onChange: (i: number) => void;
}

export class Segmented {
  readonly root = new Container();
  value: number;
  x = 0;
  y = 0;
  private w0 = 0;
  private h0 = 0;
  private readonly onChangeCb: (i: number) => void;
  private readonly cap: Text;
  private readonly opts: Button[];
  private readonly mark = new Graphics();

  constructor(o: SegmentedOptions) {
    this.value = o.value;
    this.onChangeCb = o.onChange;
    this.cap = new Text({ text: o.label, style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: 0x9aa89f } });
    this.cap.anchor.set(0, 0.5);
    this.opts = o.options.map((label, i) => new Button({ label, variant: "text", onClick: () => this.pick(i) }));
    this.root.addChild(this.cap, this.mark);
  }

  /** Кнопки вариантов — на регистрацию во ввод движка (как обычные Button). */
  buttons(): Button[] {
    return this.opts;
  }

  get w(): number {
    return this.w0;
  }
  get h(): number {
    return this.h0;
  }

  /** Разместить в АБСОЛЮТНЫХ координатах поверхности: подпись, затем варианты в ряд. */
  place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.h0 = this.opts[0]?.h ?? 0;
    const cy = y + this.h0 / 2;
    this.cap.position.set(x, cy);
    let cx = x + this.cap.width + 14;
    this.opts.forEach((b) => {
      b.place(cx + b.w / 2, cy);
      cx += b.w + 10;
    });
    this.w0 = cx - x - 10; // без хвостового зазора после последнего варианта
    this.drawMark();
  }

  private pick(i: number): void {
    if (i === this.value) return;
    this.value = i;
    this.drawMark();
    this.onChangeCb(i);
  }

  private drawMark(): void {
    const b = this.opts[this.value];
    this.mark.clear();
    if (!b) return;
    this.mark.roundRect(b.x - b.w / 2 + 4, b.y + b.h / 2 - 1, b.w - 8, 2, 1).fill({ color: 0xf2c14e });
  }
}
