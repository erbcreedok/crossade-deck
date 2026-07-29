import { Container, Graphics, Text } from "pixi.js";
import { PIXEL_FONT } from "../engine/constants";

// Кнопка на канвасе — по канонам сторибука: варианты (primary/secondary/danger/ghost),
// размеры (sm/md/lg), состояния (покой/ховер/нажатие/недоступна) и упругая анимация нажатия.
// Событий сама не слушает: ввод ведёт движок (hitTest + hover/press/click) — так драг/пан и
// кнопки не спорят за один pointer (как у карт).

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "text";
export type ButtonSize = "sm" | "md" | "lg";
type State = "rest" | "hover" | "pressed";

export interface ButtonOptions {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onClick?: () => void;
}

const SIZES: Record<ButtonSize, { w: number; h: number; radius: number; font: number }> = {
  sm: { w: 92, h: 36, radius: 8, font: 17 },
  md: { w: 124, h: 46, radius: 10, font: 21 },
  lg: { w: 168, h: 58, radius: 12, font: 26 },
};

const VARIANTS: Record<ButtonVariant, { fill: number; text: number; border: number }> = {
  primary: { fill: 0xf2c14e, text: 0x2b1d0a, border: 0xc79a2e },
  secondary: { fill: 0x39463d, text: 0xcdb98f, border: 0x5f7a6d },
  danger: { fill: 0xe0483f, text: 0xfff1ef, border: 0xa8362f },
  ghost: { fill: 0xf2c14e, text: 0xf2c14e, border: 0xf2c14e },
  text: { fill: 0x000000, text: 0xf2c14e, border: 0x000000 }, // без фона/обводки — только текст
};

function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

export class Button {
  readonly root = new Container();
  x = 0;
  y = 0;

  readonly variant: ButtonVariant;
  readonly size: ButtonSize;
  disabled: boolean;

  private readonly bg = new Graphics();
  private readonly label: Text;
  private readonly onClick?: () => void;
  private state: State = "rest";
  private active = false; // «залипшее» вкл-состояние тоглер-кнопки (напр. режим выделения включён) — держится независимо от ховера/нажатия
  private press = 0; // 0..1 — сглаженное «нажатие» (масштаб/сдвиг вниз)
  private pressTarget = 0;
  private customW = 0; // текст-кнопка меряется по тексту, а не по SIZES
  private customH = 0;

  constructor(opts: ButtonOptions) {
    this.variant = opts.variant ?? "primary";
    this.size = opts.size ?? "md";
    this.disabled = opts.disabled ?? false;
    this.onClick = opts.onClick;

    this.root.addChild(this.bg);
    this.label = new Text({ text: opts.label, style: { fontFamily: PIXEL_FONT, fontSize: SIZES[this.size].font, fill: VARIANTS[this.variant].text } });
    this.label.anchor.set(0.5);
    this.root.addChild(this.label);
    if (this.variant === "text") {
      this.customW = this.label.width + 22;
      this.customH = this.label.height + 12;
    }
    if (this.disabled) this.root.alpha = 0.45;
    this.draw();
  }

  get w(): number {
    return this.customW || SIZES[this.size].w;
  }
  get h(): number {
    return this.customH || SIZES[this.size].h;
  }

  place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.root.position.set(x, y);
  }

  /** Сменить подпись на лету (для тоглеров «вкл/выкл» и т.п.). Текст-кнопка пересчитывает размер. */
  setLabel(text: string): void {
    this.label.text = text;
    if (this.variant === "text") {
      this.customW = this.label.width + 22;
      this.customH = this.label.height + 12;
    }
    this.draw();
  }

  /** Переключить disabled ПОСЛЕ монтирования (напр. невалидная связка рычагов, issue #71) и сразу перекрасить. */
  setDisabled(on: boolean): void {
    if (on === this.disabled) return;
    this.disabled = on;
    this.draw();
  }

  hitTest(cx: number, cy: number): boolean {
    return !this.disabled && Math.abs(cx - this.x) <= this.w / 2 && Math.abs(cy - this.y) <= this.h / 2;
  }

  hover(on: boolean): void {
    if (this.disabled || this.state === "pressed") return;
    this.setState(on ? "hover" : "rest");
  }

  setPressed(on: boolean): void {
    if (this.disabled) return;
    this.setState(on ? "pressed" : "hover");
    this.pressTarget = on ? 1 : 0;
  }

  /** Залипшее вкл/выкл для тоглер-кнопки (не ховер): аффорданс «режим включён» — ярче фон, золотая обводка. */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.draw();
  }

  get isActive(): boolean {
    return this.active;
  }

  click(): void {
    if (!this.disabled) this.onClick?.();
  }

  step(dt: number): void {
    this.press += (this.pressTarget - this.press) * Math.min(1, dt * 18);
  }

  get resting(): boolean {
    return Math.abs(this.press - this.pressTarget) < 0.01;
  }

  sync(): void {
    this.root.position.set(this.x, this.y + this.press * 3);
    this.root.scale.set(1 - this.press * 0.05);
  }

  private setState(s: State): void {
    if (s === this.state) return;
    this.state = s;
    this.draw();
  }

  private draw(): void {
    if (this.variant === "text") {
      // Текст-кнопка: без фона и обводки. Аффорданс — цветом: ярче на ховере, глуше при нажатии.
      this.bg.clear();
      this.label.style.fill = this.disabled
        ? 0x6b7a70
        : this.state === "pressed"
          ? 0xc79a2e
          : this.state === "hover"
            ? 0xffe08a
            : 0xf2c14e;
      return;
    }
    const s = SIZES[this.size];
    const v = VARIANTS[this.variant];
    let fillColor = v.fill;
    let fillAlpha = 1;
    if (this.variant === "ghost") {
      fillAlpha = this.active ? 0.3 : this.state === "pressed" ? 0.22 : this.state === "hover" ? 0.12 : 0;
    } else {
      // active «перебивает» ховер/нажатие — режим включён видно всегда, а не только под курсором.
      fillColor = this.active ? shade(v.fill, 1.25) : this.state === "pressed" ? shade(v.fill, 0.88) : this.state === "hover" ? shade(v.fill, 1.1) : v.fill;
    }
    this.bg.clear();
    this.bg
      .roundRect(-s.w / 2, -s.h / 2, s.w, s.h, s.radius)
      .fill({ color: fillColor, alpha: fillAlpha })
      .stroke({ width: this.active ? 3 : 2, color: this.active ? 0xf2c14e : v.border });
  }
}
