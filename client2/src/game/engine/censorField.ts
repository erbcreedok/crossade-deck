import { Container, Graphics } from "pixi.js";
import { type CensorSpec, cellJitter, rowShearOffset, swapPairAt, wrap } from "../censorMotion";

// ГЕНЕРИК-рендер «цензуры»: берёт ЛЮБУЮ пиксель-сетку-источник (не знает про карты) и каждый кадр
// перерисовывает её блоки согласно CensorSpec. Императивная оболочка над чистой censorMotion.ts.
// Один источник цвета (моно-заливка) — силуэт фака одноцветный; при желании легко расширить до
// пер-блочного цвета (source.color[]). Держит рабочую сетку для свапов (единственное состояние).

export interface CensorSource {
  cols: number;
  rows: number;
  block: number; // px
  on: boolean[]; // row-major: есть ли «пиксель» контента в клетке
  color: number; // цвет заливки блоков
}

export class CensorField {
  readonly view = new Container();
  private g = new Graphics();
  private src: CensorSource;
  private spec: CensorSpec;
  private work: boolean[]; // рабочая копия on[] — свапы мутируют её
  private swapStep = 0;
  private seed = 0; // сдвиг последовательности свапов — «ререндер» даёт новый узор

  constructor(src: CensorSource, spec: CensorSpec) {
    this.src = src;
    this.spec = spec;
    this.work = src.on.slice();
    this.view.addChild(this.g);
  }

  // Сброс к исходной сетке + новая «сеть» свапов (seed). Вызывающий обычно ещё обнуляет своё время t.
  reset(seed = 0): void {
    this.work = this.src.on.slice();
    this.swapStep = 0;
    this.seed = seed;
  }

  get width(): number {
    return this.src.cols * this.src.block;
  }
  get height(): number {
    return this.src.rows * this.src.block;
  }

  // Перерисовать под время t (секунды, уже с учётом множителя скорости). t=0 → статичный кадр.
  update(t: number): void {
    const { cols, rows, block, color } = this.src;
    const g = this.g;
    g.clear();
    if (this.spec.kind === "swap-dance") this.drawSwap(t);
    else if (this.spec.kind === "row-shear") this.drawShear(t, 1);
    else this.drawCombo(t);
    g.fill({ color }); // одна заливка на все накопленные прямоугольники — дёшево
  }

  // Свап-танец: догоняем нужное число свапов, потом рисуем рабочую сетку с мелким дрожанием.
  private drawSwap(t: number): void {
    const { cols, rows, block } = this.src;
    const target = Math.floor(t * this.spec.swapsPerSec);
    while (this.swapStep < target) {
      const { a, b } = swapPairAt(this.swapStep + this.seed, cols, rows);
      const tmp = this.work[a]!;
      this.work[a] = this.work[b]!;
      this.work[b] = tmp;
      this.swapStep++;
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!this.work[r * cols + c]) continue;
        const j = cellJitter(this.spec, c, r, t);
        this.g.rect(c * block + j.dx, r * block + j.dy, block, block);
      }
    }
  }

  // Сдвиг рядов: каждый ряд едет вбок со своим offset, оборачивается по ширине (шов дорисовываем).
  private drawShear(t: number, mix: number): void {
    const { cols, rows, block } = this.src;
    const W = cols * block;
    for (let r = 0; r < rows; r++) {
      const off = rowShearOffset(this.spec, r, t) * mix;
      for (let c = 0; c < cols; c++) {
        if (!this.src.on[r * cols + c]) continue;
        const x = wrap(c * block + off, W);
        this.g.rect(x, r * block, block, block);
        if (x + block > W) this.g.rect(x - W, r * block, block, block); // шов оборачивания
      }
    }
  }

  // Комбо: свапы рабочей сетки + сдвиг рядов (доля shearMix) + лёгкое дрожание.
  private drawCombo(t: number): void {
    const { cols, rows, block } = this.src;
    const W = cols * block;
    const target = Math.floor(t * this.spec.swapsPerSec);
    while (this.swapStep < target) {
      const { a, b } = swapPairAt(this.swapStep + this.seed, cols, rows);
      const tmp = this.work[a]!;
      this.work[a] = this.work[b]!;
      this.work[b] = tmp;
      this.swapStep++;
    }
    for (let r = 0; r < rows; r++) {
      const off = rowShearOffset(this.spec, r, t) * this.spec.shearMix;
      for (let c = 0; c < cols; c++) {
        if (!this.work[r * cols + c]) continue;
        const j = cellJitter(this.spec, c, r, t);
        const x = wrap(c * block + off + j.dx, W);
        this.g.rect(x, r * block + j.dy, block, block);
        if (x + block > W) this.g.rect(x - W, r * block + j.dy, block, block);
      }
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
