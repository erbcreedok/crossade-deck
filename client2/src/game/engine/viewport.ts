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
    this.x = cw <= this.W ? (this.W - cw) / 2 : clamp(this.x, this.W - cw, 0);
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
