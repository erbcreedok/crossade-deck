import { Container, Graphics, Text } from "pixi.js";
import { PIXEL_FONT } from "../engine/constants";
import { fitBox, fitText, type BoxFit, type TextFitAxis } from "./boxFit";

export type { TextFitAxis };

// Кнопка на канвасе — по канонам сторибука: варианты (primary/secondary/danger/ghost),
// размеры (sm/md/lg), состояния (покой/ховер/нажатие/недоступна) и упругая анимация нажатия.
// Событий сама не слушает: ввод ведёт движок (hitTest + hover/press/click) — так драг/пан и
// кнопки не спорят за один pointer (как у карт).

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "text";
export type ButtonSize = "sm" | "md" | "lg";
type State = "rest" | "hover" | "pressed";

/**
 * Как кнопка выбирает себе ГАБАРИТ. Правила общие для любой коробки с текстом (ui/boxFit.ts):
 * дроп-зона, шильдик индикатора и подпись слота считают их так же — кнопке они не принадлежат.
 */
export type ButtonFit = BoxFit;



export interface ButtonOptions {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onClick?: () => void;

  // ——— оформление поверх варианта ———
  /** Своя заливка. Не задана — от варианта. */
  color?: number;
  /** Свой цвет обводки. Не задан — от варианта. */
  borderColor?: number;
  /** Свой цвет подписи. Не задан — от варианта. */
  textColor?: number;
  /** Толщина обводки, px. Не задана — 2 (у «включённой» кнопки 3). */
  borderWidth?: number;
  /** Скругление углов, px. Не задано — от размера (sm/md/lg). */
  radius?: number;

  // ——— прозрачность ———
  //
  // Три РАЗНЫХ слоя, и одного «alpha на всё» тут мало: полупрозрачная плашка с чётким текстом и
  // рамкой — обычный приём (стекло), а «выцветшая целиком» кнопка означает «недоступна» и путать
  // эти два смысла нельзя. Поэтому альфа своя у каждого слоя.
  /** Прозрачность ЗАЛИВКИ, 0..1. 0 — фона нет (как у ghost). */
  fillAlpha?: number;
  /** Прозрачность ОБВОДКИ, 0..1. 0 — рамки нет. */
  borderAlpha?: number;
  /** Прозрачность ПОДПИСИ, 0..1. */
  textAlpha?: number;

  /**
   * ВЫСОТА над поверхностью, px. 0 — кнопка лежит, тени нет.
   *
   * Своя тень, а не общий теневой пасс стола: пасс сливает силуэты элементов В ОДНУ маску, чтобы
   * пересекающиеся тени карт не темнили друг друга. Кнопка — не предмет на столе, а интерфейс
   * ПОВЕРХ него, и попадать в ту же маску ей незачем — она бы затемняла карты под собой.
   *
   * При нажатии высота падает: кнопка вдавливается, и тень подбирается под неё. Без этого нажатие
   * читается как «поехала вниз вместе с тенью», то есть как перемещение, а не как нажатие.
   */
  elevation?: number;

  // ——— габарит ———
  /** Как выбирается ГАБАРИТ (см. ButtonFit). */
  fit?: ButtonFit;
  /** Базовый кегль подписи. Не задан — от размера (sm/md/lg). */
  textSize?: number;
  /**
   * УЖИМАТЬ подпись, если она не влезает. Обрезать многоточием нельзя: на кнопке обрезанное слово
   * хуже мелкого, а перенос ломает единственную строку, по которой кнопку опознают.
   */
  textShrink?: boolean;
  /** УВЕЛИЧИВАТЬ подпись, если в кнопке есть запас. */
  textGrow?: boolean;
  /** По какой оси считать «влезает» (см. TextFitAxis). */
  textFit?: TextFitAxis;
  /** Точный габарит. Перебивает и пресет, и content-fit. */
  width?: number;
  height?: number;
  /** Границы. Действуют на любой способ подбора — в том числе на явные width/height. */
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  /** Поле вокруг текста. Участвует в content-fit и в ужатии текста. */
  padding?: number;
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

  private readonly shadow = new Graphics();
  private readonly bg = new Graphics();
  private readonly label: Text;
  private readonly onClick?: () => void;
  private state: State = "rest";
  private active = false; // «залипшее» вкл-состояние тоглер-кнопки (напр. режим выделения включён) — держится независимо от ховера/нажатия
  private press = 0; // 0..1 — сглаженное «нажатие» (масштаб/сдвиг вниз)
  private pressTarget = 0;
  private customW = 0; // текст-кнопка меряется по тексту, а не по SIZES
  private customH = 0;
  private readonly fit: ButtonFit;
  private readonly baseFont: number;
  private readonly textShrink: boolean;
  private readonly textGrow: boolean;
  private readonly textFit: TextFitAxis;
  private readonly pad: number;
  private readonly fillColor?: number;
  private readonly strokeColor?: number;
  private readonly labelColor?: number;
  private readonly strokeWidth?: number;
  private readonly cornerRadius?: number;
  private readonly alphaFill?: number;
  private readonly alphaBorder: number;
  private readonly alphaText: number;
  private readonly elevation: number;
  private readonly bounds: { minW?: number; maxW?: number; minH?: number; maxH?: number };
  private readonly fixedW?: number;
  private readonly fixedH?: number;

  constructor(opts: ButtonOptions) {
    this.variant = opts.variant ?? "primary";
    this.size = opts.size ?? "md";
    this.disabled = opts.disabled ?? false;
    this.onClick = opts.onClick;
    this.fit = opts.fit ?? (opts.variant === "text" ? "content" : "preset");
    this.baseFont = opts.textSize ?? SIZES[opts.size ?? "md"].font;
    // Ужатие по умолчанию ВКЛЮЧЕНО: вылезший за кнопку текст — поломка, а не решение, и молча
    // оставлять его нельзя. Растяжение по умолчанию выключено: подпись, самовольно выросшая до
    // краёв, ломает ряд одинаковых кнопок.
    this.textShrink = opts.textShrink ?? true;
    this.textGrow = opts.textGrow ?? false;
    this.textFit = opts.textFit ?? "both";
    this.pad = opts.padding ?? 11;
    this.fillColor = opts.color;
    this.strokeColor = opts.borderColor;
    this.labelColor = opts.textColor;
    this.strokeWidth = opts.borderWidth;
    this.cornerRadius = opts.radius;
    this.alphaFill = opts.fillAlpha;
    this.alphaBorder = opts.borderAlpha ?? 1;
    this.alphaText = opts.textAlpha ?? 1;
    this.elevation = Math.max(0, opts.elevation ?? 0);
    this.bounds = { minW: opts.minWidth, maxW: opts.maxWidth, minH: opts.minHeight, maxH: opts.maxHeight };
    this.fixedW = opts.width;
    this.fixedH = opts.height;

    this.root.addChild(this.shadow, this.bg);
    // Кегль: конкретный или базовый от размера — «adaptive» это не кегль, а способ ужатия,
    // и рисовать им нечего, пока габарит не посчитан.
    this.label = new Text({ text: opts.label, style: { fontFamily: PIXEL_FONT, fontSize: this.baseFont, fill: opts.textColor ?? VARIANTS[this.variant].text } });
    this.label.anchor.set(0.5);
    this.root.addChild(this.label);
    this.measure();
    this.draw();
  }

  get w(): number {
    return this.customW || SIZES[this.size].w;
  }
  get h(): number {
    return this.customH || SIZES[this.size].h;
  }

  /**
   * Подобрать габарит и, если надо, ужать текст.
   *
   * Порядок жёсткий и он же ответ на «что кого перебивает»: способ подбора → явные width/height →
   * границы min/max. Границы применяются ПОСЛЕДНИМИ ко всем случаям сразу — иначе `maxWidth`
   * молча не действовал бы на явную ширину, а это ровно то, ради чего его и ставят.
   */
  private measure(): void {
    // Масштаб текста сбрасываем перед замером: иначе ужатие прошлого прогона считалось бы за
    // натуральную ширину, и кнопка ужимала бы текст всё сильнее с каждой правкой.
    this.label.scale.set(1);
    const text = { w: this.label.width, h: this.label.height };

    // Арифметика — общая (ui/boxFit.ts). Кнопка только подставляет свои числа и применяет ответ.
    const box = fitBox({
      preset: SIZES[this.size],
      text,
      fit: this.fit,
      padding: this.pad,
      width: this.fixedW,
      height: this.fixedH,
      minWidth: this.bounds.minW,
      maxWidth: this.bounds.maxW,
      minHeight: this.bounds.minH,
      maxHeight: this.bounds.maxH,
    });
    this.customW = box.w;
    this.customH = box.h;
    this.drawShadow();
    this.label.alpha = this.alphaText;
    this.label.scale.set(fitText({ box, text, padding: this.pad, shrink: this.textShrink, grow: this.textGrow, axis: this.textFit }));
  }

  place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.root.position.set(x, y);
  }

  /** Текущая подпись — для дев-хуков и e2e: канвас не отдаёт ни DOM-узлов, ни ролей, и опознать
   *  кнопку иначе как по её тексту нечем. */
  get labelText(): string {
    return this.label.text;
  }

  /** Сменить подпись на лету (для тоглеров «вкл/выкл» и т.п.). Текст-кнопка пересчитывает размер. */
  setLabel(text: string): void {
    this.label.text = text;
    this.measure();
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
    // Тень перерисовывается на каждом кадре нажатия: она обязана СЪЕЗЖАТЬСЯ под кнопку, а не
    // ехать вместе с ней. Едущая тень читается как перемещение, а не как нажатие.
    if (this.elevation > 0) this.drawShadow();
  }

  /**
   * Тень кнопки. Направление света то же, что у карт (сверху справа → тень вниз-влево), иначе на
   * одном экране два разных солнца.
   */
  private drawShadow(): void {
    this.shadow.clear();
    if (this.elevation <= 0) return;
    // Вдавленная кнопка сидит ниже: высота падает почти до нуля, тень подбирается и бледнеет.
    const e = this.elevation * (1 - this.press * 0.8);
    const s = { ...SIZES[this.size], w: this.w, h: this.h };
    this.shadow
      .roundRect(-s.w / 2 - e * 0.3, -s.h / 2 + e * 0.6, s.w, s.h, this.cornerRadius ?? s.radius)
      .fill({ color: 0x101a14, alpha: 0.45 * (1 - this.press * 0.5) });
  }

  private setState(s: State): void {
    if (s === this.state) return;
    this.state = s;
    this.draw();
  }

  private draw(): void {
    // Гашение — в draw, а НЕ в конструкторе: `setDisabled` перекрашивает через draw, и пока альфа
    // стояла разово при сборке, кнопка переставала кликаться, но выглядела точно так же. Тумблер
    // в каталоге выглядел сломанным, а на столе disabled читался только у тех кнопок, которые
    // такими родились.
    this.root.alpha = this.disabled ? 0.4 : 1;
    if (this.variant === "text") {
      // Текст-кнопка: без фона и обводки. Аффорданс — цветом: ярче на ховере, глуше при нажатии.
      this.bg.clear();
      // Текст-кнопка: аффорданс несёт ЦВЕТ, поэтому свой textColor тут перебивает всю шкалу —
      // иначе заданный цвет виден только в покое и пропадает под курсором.
      const base = this.labelColor ?? 0xf2c14e;
      this.label.style.fill = this.disabled ? 0x6b7a70 : this.state === "pressed" ? shade(base, 0.82) : this.state === "hover" ? shade(base, 1.2) : base;
      return;
    }
    const s = { ...SIZES[this.size], w: this.w, h: this.h };
    const v = VARIANTS[this.variant];
    let fillColor = this.fillColor ?? v.fill;
    // Базовая альфа заливки: у ghost она и есть аффорданс (фон проявляется под курсором), у
    // остальных — единица. Заданная снаружи перебивает обе: попросили «стекло» — значит стекло.
    let fillAlpha = this.alphaFill ?? 1;
    if (this.variant === "ghost" && this.alphaFill === undefined) {
      fillAlpha = this.active ? 0.3 : this.state === "pressed" ? 0.22 : this.state === "hover" ? 0.12 : 0;
    } else {
      // active «перебивает» ховер/нажатие — режим включён видно всегда, а не только под курсором.
      const base = this.fillColor ?? v.fill;
      fillColor = this.active ? shade(base, 1.25) : this.state === "pressed" ? shade(base, 0.88) : this.state === "hover" ? shade(base, 1.1) : base;
    }
    this.bg.clear();
    this.bg
      .roundRect(-s.w / 2, -s.h / 2, s.w, s.h, this.cornerRadius ?? s.radius)
      .fill({ color: fillColor, alpha: fillAlpha })
      .stroke({ width: this.strokeWidth ?? (this.active ? 3 : 2), color: this.active ? 0xf2c14e : (this.strokeColor ?? v.border), alpha: this.alphaBorder });
  }
}
