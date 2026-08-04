// Стейт-машина ввода: none/drag/pan/pinch/button + ховер. Владеет указателями, жестом,
// геометрией пинча и bookkeeping'ом пана — самая ошибкоёмкая часть. Домен (что делать при
// захвате/дропе карты, как зумить вьюпорт) — В КОЛБЭКАХ движка, поэтому роутер переиспользуем
// (песочница/стол/будущее) и тестируется без Pixi. Обобщён по токенам карты C и кнопки B.

export type Gesture = "none" | "drag" | "pan" | "pinch" | "button" | "blocked" | "press";

/**
 * Насколько надо увести палец, чтобы это считалось ПОПЫТКОЙ ТАЩИТЬ.
 *
 * Нужен «стоп»-качанию недрагабельного элемента: раньше оно срабатывало на нажатии, то есть на
 * любом тыке. Тык по карте — не попытка её утащить, а «стоп» в ответ на него читается как ошибка
 * там, где ошибки не было. Порог маленький: отказ должен быть быстрым, иначе его примут за лаг.
 */
const DRAG_SLOP = 6;

/**
 * «Держи, чтобы тащить»: сколько секунд палец должен простоять на карте, прежде чем это станет
 * драгом. Опциональная фича (см. `holdToDrag`) — обычный тап-драг её не задевает.
 */
const HOLD_SEC = 0.35;

interface Pt {
  x: number;
  y: number;
}

export interface InputHandlers<C, B> {
  screenToContent(sx: number, sy: number): Pt;
  pickCard(cx: number, cy: number): C | null;
  cardDraggable(c: C): boolean;
  /**
   * Опц.: для ЭТОЙ карты драг начинается не сразу, а после `HOLD_SEC` неподвижности. Пока палец
   * стоит, жест — `press`; сдвиг раньше срока превращает его в пан (значит, тащить не хотели, а
   * листали стопку), быстрое отпускание — в тап по карте. Отсутствует/false — поведение как раньше.
   */
  holdToDrag?(c: C): boolean;
  pickButton(cx: number, cy: number): B | null;
  buttonContains(b: B, cx: number, cy: number): boolean;

  /**
   * Кнопка ЭКРАННОГО слоя (HUD/топбар) — в ЭКРАННЫХ координатах, не в координатах контента.
   * Спрашивается ПЕРВОЙ, ещё до карт: HUD нарисован поверх сцены, и палец, попавший по кнопке,
   * не должен вместо неё хватать лежащую под ней карту. Опц. — сцене без HUD передавать нечего.
   */
  pickOverlay?(sx: number, sy: number): B | null;

  onCardGrab(c: C, content: Pt, screen: Pt): void;
  onCardMove(c: C, content: Pt, screen: Pt): void;
  onCardDrop(c: C, content: Pt): void; // отпустили (дроп в зону/возврат)
  onCardCancel(c: C): void; // драг прерван вторым пальцем (пинч)
  onCardBlocked(c: C): void; // палец ПОЕХАЛ по недрагабельной — «стоп»-кивок в ответ на попытку
  /**
   * ТАП по недрагабельному элементу: нажали и отпустили, не сдвинувшись.
   *
   * Отдельно от `onCardBlocked` намеренно. Пока смысл был один на оба случая, «стоп»-качание и
   * «тап по невыделенной фигуре» ездили по одному проводу: стоило отложить качание до реального
   * сдвига пальца — и тап перестал доходить, а с ним отвалился выбор набора в песочнице.
   */
  onCardTap(c: C): void;

  /** Тап (клик без сдвига) в точку сцены — по ЛЮБОЙ цели (пустая зона, карта, что угодно). Двойной
   *  тап движок собирает из двух подряд. Опц. — сцене без зума не нужен. */
  onTap?(content: Pt, screen: Pt): void;

  onButtonDown(b: B): void;
  onButtonMove(b: B, inside: boolean): void;
  onButtonUp(b: B, inside: boolean): void; // inside → клик

  onPanStart?(): void; // начался пан (для сброса инерции/скорости)
  onPan(dx: number, dy: number): void; // экранная дельта
  onPanEnd?(): void; // пан отпущен (для запуска инерции)
  onPinchStart(midX: number, midY: number, dist: number, spanX: number): void;
  onPinch(midX: number, midY: number, dist: number, spanX: number): void;

  onHover(b: B | null): void; // только при смене (комп)
  afterAny(): void; // разбудить цикл
}

export class InputRouter<C, B> {
  gesture: Gesture = "none";
  /** Откуда начали давить на недрагабельный элемент и отбили ли уже. */
  private blockedFrom: { x: number; y: number } | null = null;
  private blockedFired = false;
  private pointers = new Map<number, Pt>();
  private card: C | null = null;
  private button: B | null = null;
  private panLast: Pt = { x: 0, y: 0 };
  private hovered: B | null = null;
  private downAt: Pt | null = null; // где нажали первый палец — для распознавания ТАПА (без сдвига)
  private multi = false; // был ли второй палец за жест (тогда это не тап)
  /** Жест "press": сколько уже простояли и откуда — для промоции в drag по `tick()`. */
  private heldFor = 0;
  private pressFrom: Pt | null = null;

  constructor(private readonly h: InputHandlers<C, B>) {}

  down(id: number, sx: number, sy: number): void {
    this.pointers.set(id, { x: sx, y: sy });
    if (this.pointers.size === 1) {
      this.downAt = { x: sx, y: sy };
      this.multi = false;
    } else {
      this.multi = true; // второй палец — жест уже не тап
    }
    if (this.pointers.size === 2) {
      // Второй палец → пинч; текущий драг отменяем (карта уезжает домой).
      if (this.card) {
        this.h.onCardCancel(this.card);
        this.card = null;
      }
      this.gesture = "pinch";
      const g = this.pinchGeom();
      this.h.onPinchStart(g.midX, g.midY, g.dist, g.spanX);
    } else if (this.pointers.size === 1) {
      // HUD выигрывает у всего: он нарисован ПОВЕРХ сцены и не ездит с камерой.
      const hud = this.h.pickOverlay?.(sx, sy) ?? null;
      if (hud) {
        this.gesture = "button";
        this.button = hud;
        this.h.onButtonDown(hud);
        this.h.afterAny();
        return;
      }
      const cp = this.h.screenToContent(sx, sy);
      const card = this.h.pickCard(cp.x, cp.y);
      if (card && !this.h.cardDraggable(card)) {
        // НЕ отбиваем сразу: ждём, поедет ли палец. Сам по себе тык — не попытка тащить.
        this.gesture = "blocked";
        this.card = card;
        this.blockedFrom = { x: sx, y: sy };
        this.blockedFired = false;
      } else if (card && this.h.holdToDrag?.(card)) {
        // Драгабельна, но требует «держи»: пока не набежит HOLD_SEC, это ещё не захват.
        this.gesture = "press";
        this.card = card;
        this.pressFrom = { x: sx, y: sy };
        this.heldFor = 0;
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
      this.h.onPinch(g.midX, g.midY, g.dist, g.spanX);
    } else if (this.gesture === "blocked" && this.card) {
      // Палец поехал — вот теперь это попытка тащить, и на неё отвечаем отказом. Один раз за жест:
      // иначе качание перезапускалось бы на каждом кадре движения и превратилось в дрожь.
      if (!this.blockedFired && this.blockedFrom && Math.hypot(sx - this.blockedFrom.x, sy - this.blockedFrom.y) > DRAG_SLOP) {
        this.blockedFired = true;
        this.h.onCardBlocked(this.card);
      }
    } else if (this.gesture === "press" && this.card) {
      // Поехал раньше, чем настоялся — значит тащить не хотели, это пан/скролл стопки.
      if (this.pressFrom && Math.hypot(sx - this.pressFrom.x, sy - this.pressFrom.y) > DRAG_SLOP) {
        this.card = null;
        this.pressFrom = null;
        this.gesture = "pan";
        this.panLast = { x: sx, y: sy };
        this.h.onPanStart?.();
      }
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
      const b = this.h.pickOverlay?.(sx, sy) ?? this.h.pickButton(cp.x, cp.y); // HUD и на ховере первый
      if (b !== this.hovered) {
        this.hovered = b;
        this.h.onHover(b);
      }
    }
  }

  up(id: number, sx: number, sy: number): void {
    const wasPan = this.gesture === "pan";
    const g0 = this.gesture;
    this.pointers.delete(id);
    if (this.gesture === "drag" && this.card) {
      this.h.onCardDrop(this.card, this.h.screenToContent(sx, sy));
      this.card = null;
    } else if (this.gesture === "blocked") {
      // Палец не поехал — значит это был ТАП, а не попытка тащить.
      if (!this.blockedFired && this.card) this.h.onCardTap(this.card);
      this.card = null;
      this.blockedFrom = null;
    } else if (this.gesture === "press") {
      // Отпустили до истечения HOLD_SEC — не «держали», а тыкнули: это ТАП по карте.
      if (this.card) this.h.onCardTap(this.card);
      this.card = null;
      this.pressFrom = null;
      this.heldFor = 0;
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
      // ТАП: последний палец ушёл без сдвига и без второго пальца, и это не была кнопка. Цель любая
      // (пустая зона/карта) — что делать с двойным, решает движок (onTap → детект дабл-тапа).
      if (!this.multi && this.downAt && g0 !== "button" && g0 !== "pinch" && Math.hypot(sx - this.downAt.x, sy - this.downAt.y) <= DRAG_SLOP) {
        this.h.onTap?.(this.h.screenToContent(sx, sy), { x: sx, y: sy });
      }
      this.downAt = null;
      this.multi = false;
      if (wasPan) this.h.onPanEnd?.(); // пан отпущен последним пальцем → запускаем инерцию
    }
    this.h.afterAny();
  }

  /**
   * Раз в кадр: копит время удержания для «press» и повышает его в «drag», как только наберётся
   * `HOLD_SEC`. Время приходит СНАРУЖИ (dt), а не из wall-clock — роутер держим чистым и
   * тестируемым без Pixi.
   */
  tick(dt: number): void {
    if (this.gesture !== "press" || !this.card || !this.pressFrom) return;
    this.heldFor += dt;
    if (this.heldFor < HOLD_SEC) return;
    const card = this.card;
    const at = this.pressFrom;
    this.gesture = "drag";
    this.pressFrom = null;
    this.heldFor = 0;
    this.h.onCardGrab(card, this.h.screenToContent(at.x, at.y), at);
  }

  /** Сброс (teardown/рестарт): забыть указатели и жест. */
  reset(): void {
    this.pointers.clear();
    this.gesture = "none";
    this.card = null;
    this.button = null;
    this.hovered = null;
    this.downAt = null;
    this.multi = false;
    this.heldFor = 0;
    this.pressFrom = null;
  }

  private pinchGeom(): { midX: number; midY: number; dist: number; spanX: number } {
    const [a, b] = [...this.pointers.values()];
    // spanX — ГОРИЗОНТАЛЬНОЕ разведение пальцев; им сцена управляет горизонтальным спредом стека
    // (жест «раздвинуть по X прямо на картах»), отдельно от полного dist (зум камеры).
    return { midX: (a!.x + b!.x) / 2, midY: (a!.y + b!.y) / 2, dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), spanX: Math.abs(a!.x - b!.x) };
  }
}
