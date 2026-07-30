// Камера песочницы/стола — ЧИСТАЯ математика пан/зум, без Pixi (тестируется юнитами).
// Держит только числа (x, y, zoom) и границы (экран/контент). Движок читает x/y/zoom и
// применяет их к контейнеру Pixi; сама Viewport ничего не рисует и не знает про сцену.

export interface ViewState {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  scrollX: number; // 0..1 доля прокрутки по X
  thumbX: number; // 0..1 доля видимого (размер ползунка)
  scrollableX: boolean;
  scrollY: number;
  thumbY: number;
  scrollableY: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class Viewport {
  x = 0;
  y = 0;
  zoom = 1;

  private W = 1;
  private H = 1;
  private cw = 1; // ширина контента
  private ch = 1; // высота контента

  constructor(
    readonly minZoom: number,
    readonly maxZoom: number,
    // Верхний отступ, когда контент ниже экрана и центрировать по вертикали не надо.
    private readonly topInset = 24,
    // Как класть контент по X, когда он УЖЕ экрана (issue #49). "center" — исторический дефолт
    // (стенд /motion, меню). "left" — прижать к постоянному левому отступу: у песочницы контент то
    // уже, то шире экрана, и центрирование заставляло всю раскладку прыгать вбок при каждом
    // изменении ширины окна (напр. открыли консоль сайдбаром) — единой опоры у элементов не было.
    private readonly alignX: "center" | "left" = "center",
    private readonly leftInset = 0,
  ) {}

  setScreen(w: number, h: number): void {
    this.W = w;
    this.H = h;
  }

  setContent(w: number, h: number): void {
    this.cw = w;
    this.ch = h;
  }

  /** Экранная точка → координаты контента (обратное к position/scale контейнера). */
  screenToContent(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.x) / this.zoom, y: (sy - this.y) / this.zoom };
  }

  /** Удержать вид в границах: контент уже экрана — центрируем/прижимаем к верху, иначе кламп. */
  clamp(): void {
    const cw = this.cw * this.zoom;
    const ch = this.ch * this.zoom;
    this.x = cw <= this.W ? (this.alignX === "left" ? this.leftInset : (this.W - cw) / 2) : clamp(this.x, this.W - cw, 0);
    this.y = ch <= this.H ? this.topInset : clamp(this.y, this.H - ch, 0);
  }

  /** Зум вокруг экранной точки — она остаётся на месте (фокус не «уползает»). */
  zoomAround(sx: number, sy: number, factor: number): void {
    const f = this.screenToContent(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    this.x = sx - f.x * this.zoom;
    this.y = sy - f.y * this.zoom;
    this.clamp();
  }

  /** Задать зум (вокруг центра экрана). */
  setZoom(z: number): void {
    this.zoomAround(this.W / 2, this.H / 2, clamp(z, this.minZoom, this.maxZoom) / this.zoom);
  }

  /** Сдвинуть вид (пан) на дельту в экранных пикселях. */
  panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  setScrollX(fraction: number): void {
    const overflow = Math.max(0, this.cw * this.zoom - this.W);
    this.x = -clamp(fraction, 0, 1) * overflow;
    this.clamp();
  }

  setScrollY(fraction: number): void {
    const overflow = Math.max(0, this.ch * this.zoom - this.H);
    this.y = -clamp(fraction, 0, 1) * overflow;
    this.clamp();
  }

  // ——— инерция (fling): после отпускания пана вид едет по инерции с затуханием ———
  private fvx = 0;
  private fvy = 0;
  flinging = false;

  /** Запустить инерцию со скоростью px/сек (порог/капы отсекают дрожь и безумные броски). */
  startFling(vx: number, vy: number): void {
    const cap = 4000;
    this.fvx = clamp(vx, -cap, cap);
    this.fvy = clamp(vy, -cap, cap);
    this.flinging = Math.hypot(this.fvx, this.fvy) > 40;
  }

  stopFling(): void {
    this.flinging = false;
    this.fvx = 0;
    this.fvy = 0;
  }

  /** Шаг инерции: сдвинуть, кламп, затухание; ось гасится, упершись в край. Возвращает «ещё едем». */
  stepFling(dt: number): boolean {
    if (!this.flinging) return false;
    const bx = this.x;
    const by = this.y;
    this.x += this.fvx * dt;
    this.y += this.fvy * dt;
    this.clamp();
    if (this.x === bx) this.fvx = 0; // упёрлись в вертикальный край
    if (this.y === by) this.fvy = 0; // упёрлись в горизонтальный край
    const k = Math.exp(-5 * dt); // затухание, независимое от частоты кадров
    this.fvx *= k;
    this.fvy *= k;
    if (Math.hypot(this.fvx, this.fvy) < 40) this.flinging = false;
    return this.flinging;
  }

  state(): ViewState {
    const cw = this.cw * this.zoom;
    const ch = this.ch * this.zoom;
    const ox = Math.max(0, cw - this.W);
    const oy = Math.max(0, ch - this.H);
    return {
      zoom: this.zoom,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom,
      scrollX: ox > 0 ? -this.x / ox : 0,
      thumbX: cw > 0 ? Math.min(1, this.W / cw) : 1,
      scrollableX: ox > 1,
      scrollY: oy > 0 ? -this.y / oy : 0,
      thumbY: ch > 0 ? Math.min(1, this.H / ch) : 1,
      scrollableY: oy > 1,
    };
  }
}
