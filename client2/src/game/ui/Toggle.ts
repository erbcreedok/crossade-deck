import { Container, Text } from "pixi.js";
import { PIXEL_FONT } from "../engine/constants";
import { Button } from "./Button";

// Переключатель вкл/выкл: подпись + кнопка-состояние «вкл»/«выкл». Отдельная переиспользуемая
// сущность (не про Поле — про «булев параметр»). Клик кнопки ведёт движок (как все Button),
// поэтому отдаётся через buttons(); тексты — в root, кнопку размещаем в АБСОЛЮТНЫХ координатах.

export interface ToggleOptions {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export class Toggle {
  readonly root = new Container();
  value: boolean;
  x = 0;
  y = 0;
  private w0 = 0;
  private h0 = 0;
  private readonly onChange: (v: boolean) => void;
  private readonly cap: Text;
  private readonly btn: Button;

  constructor(o: ToggleOptions) {
    this.value = o.value;
    this.onChange = o.onChange;
    this.cap = new Text({ text: o.label, style: { fontFamily: PIXEL_FONT, fontSize: 13, fill: 0x9aa89f } });
    this.cap.anchor.set(0, 0.5);
    this.btn = new Button({ label: this.stateLabel(), variant: "secondary", size: "sm", onClick: () => this.flip() });
    this.root.addChild(this.cap);
    this.applyTint();
  }

  buttons(): Button[] {
    return [this.btn];
  }

  /** Центр кликабельной части (для e2e/наведения). */
  hitCenter(): { x: number; y: number } {
    return { x: this.btn.x, y: this.btn.y };
  }

  get w(): number {
    return this.w0;
  }
  get h(): number {
    return this.h0;
  }

  place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.h0 = this.btn.h;
    const cy = y + this.h0 / 2;
    this.cap.position.set(x, cy);
    const bx = x + this.cap.width + 12;
    this.btn.place(bx + this.btn.w / 2, cy);
    this.w0 = this.cap.width + 12 + this.btn.w;
  }

  private stateLabel(): string {
    return this.value ? "вкл" : "выкл";
  }

  private flip(): void {
    this.value = !this.value;
    this.btn.setLabel(this.stateLabel());
    this.applyTint();
    this.onChange(this.value);
  }

  // Вкл — ярче (акцент), выкл — приглушённо. Дёшево и читаемо без смены варианта кнопки.
  private applyTint(): void {
    this.btn.root.alpha = this.value ? 1 : 0.5;
  }
}
