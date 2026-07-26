import { Container, Text } from "pixi.js";
import { PIXEL_FONT } from "../engine/constants";
import { Button } from "./Button";

// Числовой контроллер: подпись + [−] значение [+]. Отдельная переиспользуемая сущность (не про Поле —
// про «поменять число в границах»). Ввод кнопок −/+ сама не слушает: их ведёт движок (как все Button),
// поэтому отдаёт их через buttons() на регистрацию. Тексты — в root; кнопки размещает в АБСОЛЮТНЫХ
// координатах (как обычные Button движка), чтобы hitTest в системе поверхности совпадал.

export interface StepperOptions {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function mkText(text: string, size: number, fill: number): Text {
  const t = new Text({ text, style: { fontFamily: PIXEL_FONT, fontSize: size, fill } });
  return t;
}

const VAL_SLOT = 30; // фикс. ширина слота значения (чтобы + не прыгал при смене цифры)

export class Stepper {
  readonly root = new Container();
  value: number;
  x = 0;
  y = 0;
  private w0 = 0;
  private h0 = 0;
  private readonly min: number;
  private readonly max: number;
  private readonly onChange: (v: number) => void;
  private readonly cap: Text;
  private readonly valText: Text;
  private readonly minus: Button;
  private readonly plus: Button;

  constructor(o: StepperOptions) {
    this.value = o.value;
    this.min = o.min;
    this.max = o.max;
    this.onChange = o.onChange;
    this.cap = mkText(o.label, 13, 0x9aa89f);
    this.cap.anchor.set(0, 0.5);
    this.valText = mkText(String(o.value), 20, 0xf2c14e);
    this.valText.anchor.set(0.5, 0.5);
    this.minus = new Button({ label: "−", variant: "text", size: "lg", onClick: () => this.bump(-1) });
    this.plus = new Button({ label: "+", variant: "text", size: "lg", onClick: () => this.bump(1) });
    this.root.addChild(this.cap, this.valText);
    this.refresh();
  }

  /** Кнопки −/+ — на регистрацию во ввод движка (как обычные Button). */
  buttons(): Button[] {
    return [this.minus, this.plus];
  }

  get w(): number {
    return this.w0;
  }
  get h(): number {
    return this.h0;
  }

  /** Разместить в АБСОЛЮТНЫХ координатах поверхности: подпись, [−], значение, [+] в ряд. */
  place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.h0 = this.plus.h;
    const cy = y + this.h0 / 2;
    this.cap.position.set(x, cy);
    let cx = x + this.cap.width + 12;
    this.minus.place(cx + this.minus.w / 2, cy);
    cx += this.minus.w + 6;
    this.valText.position.set(cx + VAL_SLOT / 2, cy);
    cx += VAL_SLOT + 6;
    this.plus.place(cx + this.plus.w / 2, cy);
    cx += this.plus.w;
    this.w0 = cx - x;
  }

  private bump(dir: number): void {
    const next = Math.max(this.min, Math.min(this.max, this.value + dir));
    if (next === this.value) return;
    this.value = next;
    this.refresh();
    this.onChange(next);
  }

  private refresh(): void {
    this.valText.text = String(this.value);
    this.minus.disabled = this.value <= this.min;
    this.plus.disabled = this.value >= this.max;
    this.minus.root.alpha = this.minus.disabled ? 0.35 : 1;
    this.plus.root.alpha = this.plus.disabled ? 0.35 : 1;
  }
}
