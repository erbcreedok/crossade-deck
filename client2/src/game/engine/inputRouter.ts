// Стейт-машина ввода: none/drag/pan/pinch/button + ховер. Владеет указателями, жестом,
// геометрией пинча и bookkeeping'ом пана — самая ошибкоёмкая часть. Домен (что делать при
// захвате/дропе карты, как зумить вьюпорт) — В КОЛБЭКАХ движка, поэтому роутер переиспользуем
// (песочница/стол/будущее) и тестируется без Pixi. Обобщён по токенам карты C и кнопки B.

export type Gesture = "none" | "drag" | "pan" | "pinch" | "button";

interface Pt {
  x: number;
  y: number;
}

export interface InputHandlers<C, B> {
  screenToContent(sx: number, sy: number): Pt;
  pickCard(cx: number, cy: number): C | null;
  cardDraggable(c: C): boolean;
  pickButton(cx: number, cy: number): B | null;
  buttonContains(b: B, cx: number, cy: number): boolean;

  onCardGrab(c: C, content: Pt, screen: Pt): void;
  onCardMove(c: C, content: Pt, screen: Pt): void;
  onCardDrop(c: C, content: Pt): void; // отпустили (дроп в зону/возврат)
  onCardCancel(c: C): void; // драг прерван вторым пальцем (пинч)
  onCardBlocked(c: C): void; // недраг-карта — «стоп»-кивок

  onButtonDown(b: B): void;
  onButtonMove(b: B, inside: boolean): void;
  onButtonUp(b: B, inside: boolean): void; // inside → клик

  onPanStart?(): void; // начался пан (для сброса инерции/скорости)
  onPan(dx: number, dy: number): void; // экранная дельта
  onPanEnd?(): void; // пан отпущен (для запуска инерции)
  onPinchStart(midX: number, midY: number, dist: number): void;
  onPinch(midX: number, midY: number, dist: number): void;

  onHover(b: B | null): void; // только при смене (комп)
  afterAny(): void; // разбудить цикл
}

export class InputRouter<C, B> {
  gesture: Gesture = "none";
  private pointers = new Map<number, Pt>();
  private card: C | null = null;
  private button: B | null = null;
  private panLast: Pt = { x: 0, y: 0 };
  private hovered: B | null = null;

  constructor(private readonly h: InputHandlers<C, B>) {}

  down(id: number, sx: number, sy: number): void {
    this.pointers.set(id, { x: sx, y: sy });
    if (this.pointers.size === 2) {
      // Второй палец → пинч; текущий драг отменяем (карта уезжает домой).
      if (this.card) {
        this.h.onCardCancel(this.card);
        this.card = null;
      }
      this.gesture = "pinch";
      const g = this.pinchGeom();
      this.h.onPinchStart(g.midX, g.midY, g.dist);
    } else if (this.pointers.size === 1) {
      const cp = this.h.screenToContent(sx, sy);
      const card = this.h.pickCard(cp.x, cp.y);
      if (card && !this.h.cardDraggable(card)) {
        this.h.onCardBlocked(card);
        this.gesture = "none";
      } else if (card) {
        this.gesture = "drag";
        this.card = card;
        this.h.onCardGrab(card, cp, { x: sx, y: sy });
      } else {
        const btn = this.h.pickButton(cp.x, cp.y);
        if (btn) {
          this.gesture = "button";
          this.button = btn;
          this.h.onButtonDown(btn);
        } else {
          this.gesture = "pan";
          this.panLast = { x: sx, y: sy };
          this.h.onPanStart?.();
        }
      }
    }
    this.h.afterAny();
  }

  move(id: number, sx: number, sy: number): void {
    if (this.pointers.has(id)) this.pointers.set(id, { x: sx, y: sy });

    if (this.gesture === "pinch" && this.pointers.size >= 2) {
      const g = this.pinchGeom();
      this.h.onPinch(g.midX, g.midY, g.dist);
    } else if (this.gesture === "drag" && this.card) {
      const cp = this.h.screenToContent(sx, sy);
      this.h.onCardMove(this.card, cp, { x: sx, y: sy });
    } else if (this.gesture === "button" && this.button) {
      const cp = this.h.screenToContent(sx, sy);
      this.h.onButtonMove(this.button, this.h.buttonContains(this.button, cp.x, cp.y));
    } else if (this.gesture === "pan") {
      this.h.onPan(sx - this.panLast.x, sy - this.panLast.y);
      this.panLast = { x: sx, y: sy };
    } else if (this.gesture === "none") {
      const cp = this.h.screenToContent(sx, sy);
      const b = this.h.pickButton(cp.x, cp.y);
      if (b !== this.hovered) {
        this.hovered = b;
        this.h.onHover(b);
      }
    }
  }

  up(id: number, sx: number, sy: number): void {
    const wasPan = this.gesture === "pan";
    this.pointers.delete(id);
    if (this.gesture === "drag" && this.card) {
      this.h.onCardDrop(this.card, this.h.screenToContent(sx, sy));
      this.card = null;
    } else if (this.gesture === "button" && this.button) {
      const cp = this.h.screenToContent(sx, sy);
      this.h.onButtonUp(this.button, this.h.buttonContains(this.button, cp.x, cp.y));
      this.button = null;
    }
    // Остался один палец после пинча → продолжаем паном от него; ноль → покой.
    if (this.pointers.size === 1) {
      const only = [...this.pointers.values()][0]!;
      this.gesture = "pan";
      this.panLast = { x: only.x, y: only.y };
    } else if (this.pointers.size === 0) {
      this.gesture = "none";
      if (wasPan) this.h.onPanEnd?.(); // пан отпущен последним пальцем → запускаем инерцию
    }
    this.h.afterAny();
  }

  /** Сброс (teardown/рестарт): забыть указатели и жест. */
  reset(): void {
    this.pointers.clear();
    this.gesture = "none";
    this.card = null;
    this.button = null;
    this.hovered = null;
  }

  private pinchGeom(): { midX: number; midY: number; dist: number } {
    const [a, b] = [...this.pointers.values()];
    return { midX: (a!.x + b!.x) / 2, midY: (a!.y + b!.y) / 2, dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
  }
}
