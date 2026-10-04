// ПЕРЕВОРОТ КАРТЫ ВТОРЫМ ПАЛЬЦЕМ — чистая логика жеста, без сцены и без DOM.
//
// Первый палец держит карту; второй ложится где угодно и ведёт её вбок: карта крутится вокруг своей длинной оси вслед за пальцем.
//   • первые `dead` пикселей — мёртвая зона (дрожание пальца карту не крутит);
//   • угол идёт за пальцем; `span` пикселей хода — полный оборот на 180°;
//   • дошёл до `click` градусов — ЩЁЛКНУЛО: переворот засчитан, карта доворачивает на 180° сама и остаётся перевёрнутой, что бы палец ни делал дальше;
//   • второй палец поднят до щелчка — переворота нет, карта откатывается назад; после щелчка — он остаётся.
// Что сделать, если первый палец отпустил карту, решает вызывающий: щёлкнуло — переворот остаётся (`clicked`), не щёлкнуло — обрыв, как дроп без переворота.

export const FLIP = { dead: 12, span: 220, click: 100 } as const;

export interface FlipMove {
  /** Угол карты за пальцем, градусы со знаком (знак — куда повёл палец). До щелчка. */
  angle: number;
  /** Щёлкнуло только что: вызывающий переворачивает карту и сбрасывает угол. */
  click: boolean;
}

export class CardFlip {
  private x0 = 0;
  private done = false;
  constructor(private readonly o: { dead: number; span: number; click: number } = FLIP) {}

  /** Второй палец лёг в точку `x`. */
  begin(x: number): void {
    this.x0 = x;
    this.done = false;
  }

  /** Второй палец сдвинулся в `x`. После щелчка угла нет: карта уже перевёрнута. */
  move(x: number): FlipMove {
    if (this.done) return { angle: 0, click: false };
    const dx = x - this.x0;
    if (Math.abs(dx) <= this.o.dead) return { angle: 0, click: false };
    const angle = Math.max(-180, Math.min(180, ((dx - Math.sign(dx) * this.o.dead) / this.o.span) * 180));
    if (Math.abs(angle) >= this.o.click) {
      this.done = true;
      return { angle, click: true };
    }
    return { angle, click: false };
  }

  /** Щёлкнуло ли за этот жест. */
  get clicked(): boolean {
    return this.done;
  }
}
