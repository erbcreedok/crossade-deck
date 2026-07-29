// Скользящее среднее FPS из длительностей кадров (мс). Чистый (без таймеров): CanvasApp кормит его
// ticker.deltaMS каждый кадр, КРОМЕ первого после пробуждения из сна — там deltaMS = wall-clock разрыв,
// который читался бы как «просадка». Пока набралось меньше minSamples — fps() === null (не решаем
// вслепую на 2-3 кадрах). Кольцевой буфер фиксированного окна — старые кадры вытесняются.

export class FpsMeter {
  private buf: number[] = [];
  private i = 0;

  constructor(
    private readonly window = 60, // ~1с при 60fps
    private readonly minSamples = 20,
  ) {}

  reset(): void {
    this.buf = [];
    this.i = 0;
  }

  sample(ms: number): void {
    if (ms <= 0) return; // защита от нулевого/отрицательного разрыва
    if (this.buf.length < this.window) this.buf.push(ms);
    else {
      this.buf[this.i] = ms;
      this.i = (this.i + 1) % this.window;
    }
  }

  /** Сглаженный FPS, либо null пока данных меньше minSamples. */
  fps(): number | null {
    if (this.buf.length < this.minSamples) return null;
    const sum = this.buf.reduce((a, b) => a + b, 0);
    return sum > 0 ? (1000 * this.buf.length) / sum : null;
  }
}
