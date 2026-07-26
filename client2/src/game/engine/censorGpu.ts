import { Application, Container, Filter, GlProgram, Graphics, RenderTexture, Sprite } from "pixi.js";
import { buildContent } from "../fingerContent";
import type { DanceParams } from "../censorDemo";
import { TEX_H, TEX_W } from "./constants";

// GPU-варианты «цензуры»: вся анимация на видеокарте, CPU за кадр лишь двигает uniform'ы. Управляются
// теми же рычагами (DanceParams), что и CPU-карта: block→сетка, swapsPerSec→темп, jitterAmp→размах, freq→живость.
//   "remap"    — СТЕЙТЛЕСС шейдер: клетка берёт цвет соседа на расстоянии amp, выбранного хешем от
//                (клетка, tick). Пересемплирование каждый тик → «моргает». Состояния нет, CPU ≈ 0.
//   "pingpong" — НАКОПЛЕНИЕ на GPU: состояние = поле СМЕЩЕНИЙ (куда каждый блок отошёл от дома). Шаг-шейдер
//                бродит смещение случайно + ВОЗВРАТ (затухание к нулю) → ограничено, силуэт не расплывается.
//                Дисплей-шейдер сэмплит фак по (клетка+смещение). Плавный «живой» дрейф с памятью.

export type GpuMode = "remap" | "pingpong";

const VERT = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition( void ) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord( void ) { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void) { gl_Position = filterVertexPosition(); vTextureCoord = filterTextureCoord(); }`;

const HASH = `
float hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }`;

// СТЕЙТЛЕСС ремап: клетка берёт цвет соседа на расстоянии uAmp клеток в случайном направлении (по хешу
// от tick). Доля прыгающих ~0.6. uAmp=0 → статичный фак.
const REMAP_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uGrid; uniform float uTime; uniform float uRate; uniform float uAmp;
${HASH}
void main(void){
  vec2 cell = floor(vTextureCoord * uGrid);
  float tick = floor(uTime * uRate);
  float h = hash21(cell + vec2(tick*13.0, tick*7.0));
  float ang = hash21(cell + vec2(tick*3.7, 9.1)) * 6.28318;
  vec2 dir = vec2(cos(ang), sin(ang));
  float hop = (h < 0.6) ? uAmp : 0.0;
  finalColor = texture(uTexture, (cell + dir*hop + 0.5) / uGrid);
}`;

// ШАГ поля смещений: декодируем смещение из RG, добавляем случайный шаг (по клетке+step), затухаем к нулю
// (ВОЗВРАТ → ограниченность) и зажимаем в ±uMax. Кодируем обратно. Так каждый блок бродит вокруг дома.
const STEP_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uGrid; uniform float uStep; uniform float uMax; uniform float uStepAmp; uniform float uDamp;
${HASH}
void main(void){
  vec2 cell = floor(vTextureCoord * uGrid);
  vec2 enc = texture(uTexture, (cell+0.5)/uGrid).xy;
  vec2 off = (enc*2.0 - 1.0) * uMax;
  float ang = hash21(cell + vec2(uStep*1.7, 3.1)) * 6.28318;
  float mag = hash21(cell + vec2(7.3, uStep*2.3));
  off += vec2(cos(ang), sin(ang)) * mag * uStepAmp;
  off *= uDamp;                       // возврат к дому → размах ограничен
  off = clamp(off, -uMax, uMax);
  finalColor = vec4(off/max(uMax,0.001)*0.5 + 0.5, 0.0, 1.0);
}`;

// ДИСПЛЕЙ поля смещений: для каждой клетки читаем смещение из uState и сэмплим ФАК (uTexture) по (клетка+смещение).
const DISPLAY_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture; uniform sampler2D uState;
uniform vec2 uGrid; uniform float uMax;
void main(void){
  vec2 cell = floor(vTextureCoord * uGrid);
  vec2 enc = texture(uState, (cell+0.5)/uGrid).xy;
  vec2 off = (enc*2.0 - 1.0) * uMax;
  finalColor = texture(uTexture, (cell + off + 0.5) / uGrid);
}`;

function makeFilter(fragment: string, uniforms: Record<string, { value: number | Float32Array; type: string }>, textures?: Record<string, RenderTexture>): Filter {
  const resources: Record<string, unknown> = { u: uniforms };
  if (textures) for (const k in textures) resources[k] = textures[k]!.source;
  const f = new Filter({ glProgram: GlProgram.from({ vertex: VERT, fragment, name: "censor-gpu" }), resources });
  f.padding = 0;
  return f;
}

export class GpuCensorCard {
  readonly view = new Container();
  private app: Application;
  private mode: GpuMode;
  private p: DanceParams;
  private cols = 1;
  private rows = 1;
  // общие
  private display!: Sprite;
  private grid: RenderTexture | null = null; // источник-фак в сетке
  private filter: Filter | null = null; // remap: ремап; pingpong: дисплей
  // pingpong
  private stateA: RenderTexture | null = null;
  private stateB: RenderTexture | null = null;
  private stateDisp: RenderTexture | null = null; // фикс. текстура, которую читает дисплей (копия cur)
  private cur: RenderTexture | null = null;
  private other: RenderTexture | null = null;
  private stepSprite: Sprite | null = null;
  private stepFilter: Filter | null = null;
  private copySprite: Sprite | null = null;
  private step = 0;

  constructor(app: Application, mode: GpuMode, params: DanceParams) {
    this.app = app;
    this.mode = mode;
    this.p = { ...params };
    this.build();
  }

  // Собрать всё под текущий block (сетку/текстуры/фильтры/спрайты). Зовётся заново при смене block.
  private build(): void {
    this.teardown();
    this.cols = Math.max(1, Math.round(TEX_W / this.p.block));
    this.rows = Math.max(1, Math.round(TEX_H / this.p.block));
    const grid = new Float32Array([this.cols, this.rows]);
    this.grid = this.newGrid();
    this.renderFinger(this.grid);

    if (this.mode === "remap") {
      const sprite = new Sprite(this.grid);
      sprite.setSize(TEX_W, TEX_H);
      this.filter = makeFilter(REMAP_FRAG, {
        uGrid: { value: grid, type: "vec2<f32>" },
        uTime: { value: 0, type: "f32" },
        uRate: { value: this.p.swapsPerSec, type: "f32" },
        uAmp: { value: this.p.jitterAmp, type: "f32" },
      });
      sprite.filters = [this.filter];
      this.display = sprite;
    } else {
      this.stateA = this.newGrid();
      this.stateB = this.newGrid();
      this.stateDisp = this.newGrid();
      this.renderZeroOffset(this.stateA);
      this.renderZeroOffset(this.stateDisp);
      this.cur = this.stateA;
      this.other = this.stateB;
      this.stepFilter = makeFilter(STEP_FRAG, {
        uGrid: { value: grid, type: "vec2<f32>" },
        uStep: { value: 0, type: "f32" },
        uMax: { value: Math.max(0.001, this.p.jitterAmp), type: "f32" },
        uStepAmp: { value: 0.14 * (this.p.jitterFreq / 6), type: "f32" },
        uDamp: { value: 0.9, type: "f32" },
      });
      this.stepSprite = new Sprite(this.stateA);
      this.stepSprite.filters = [this.stepFilter];
      this.copySprite = new Sprite(this.cur);
      // дисплей: фак (uTexture) + поле смещений (uState = фикс. stateDisp)
      const sprite = new Sprite(this.grid);
      sprite.setSize(TEX_W, TEX_H);
      this.filter = makeFilter(DISPLAY_FRAG, {
        uGrid: { value: grid, type: "vec2<f32>" },
        uMax: { value: Math.max(0.001, this.p.jitterAmp), type: "f32" },
      }, { uState: this.stateDisp });
      sprite.filters = [this.filter];
      this.display = sprite;
    }
    this.step = 0;
    this.view.addChild(this.display);
  }

  private newGrid(): RenderTexture {
    const rt = RenderTexture.create({ width: this.cols, height: this.rows });
    rt.source.scaleMode = "nearest";
    return rt;
  }
  private renderFinger(rt: RenderTexture): void {
    const content = buildContent();
    content.scale.set(this.cols / TEX_W, this.rows / TEX_H);
    this.app.renderer.render({ container: content, target: rt, clear: true });
    content.destroy({ children: true });
  }
  // Нулевое смещение = серый 0x808000 (0.5,0.5) во всех клетках.
  private renderZeroOffset(rt: RenderTexture): void {
    const g = new Graphics().rect(0, 0, this.cols, this.rows).fill({ color: 0x808000, alpha: 1 });
    this.app.renderer.render({ container: g, target: rt, clear: true });
    g.destroy();
  }

  private setU(f: Filter | null, name: string, value: number): void {
    if (f) (f.resources.u.uniforms as Record<string, number>)[name] = value;
  }

  // Живая настройка рычагами. block → пересборка; остальное → апдейт uniform'ов.
  setParams(p: Partial<DanceParams>): void {
    if (p.block !== undefined && p.block !== this.p.block) {
      this.p.block = p.block;
      if (p.swapsPerSec !== undefined) this.p.swapsPerSec = p.swapsPerSec;
      if (p.jitterAmp !== undefined) this.p.jitterAmp = p.jitterAmp;
      if (p.jitterFreq !== undefined) this.p.jitterFreq = p.jitterFreq;
      this.build();
      return;
    }
    if (p.swapsPerSec !== undefined) {
      this.p.swapsPerSec = p.swapsPerSec;
      this.setU(this.filter, "uRate", p.swapsPerSec); // только remap использует uRate
    }
    if (p.jitterAmp !== undefined) {
      this.p.jitterAmp = p.jitterAmp;
      const m = Math.max(0.001, p.jitterAmp);
      if (this.mode === "remap") this.setU(this.filter, "uAmp", p.jitterAmp);
      else { this.setU(this.stepFilter, "uMax", m); this.setU(this.filter, "uMax", m); }
    }
    if (p.jitterFreq !== undefined) {
      this.p.jitterFreq = p.jitterFreq;
      this.setU(this.stepFilter, "uStepAmp", 0.14 * (p.jitterFreq / 6));
    }
  }

  update(t: number): void {
    if (this.mode === "remap") {
      this.setU(this.filter, "uTime", t);
      return;
    }
    const target = Math.floor(t * this.p.swapsPerSec);
    let steps = Math.min(8, target - this.step); // потолок на кадр — не залипнуть при большом dt
    while (steps-- > 0) {
      this.setU(this.stepFilter, "uStep", this.step);
      this.stepSprite!.texture = this.cur!;
      this.app.renderer.render({ container: this.stepSprite!, target: this.other!, clear: true });
      const sw = this.cur!;
      this.cur = this.other!;
      this.other = sw;
      this.step++;
    }
    // копируем текущее состояние в фикс. stateDisp, который читает дисплей-фильтр (без пере-бинда текстур).
    this.copySprite!.texture = this.cur!;
    this.app.renderer.render({ container: this.copySprite!, target: this.stateDisp!, clear: true });
  }

  reset(): void {
    this.step = 0;
    if (this.mode === "pingpong") {
      this.renderZeroOffset(this.stateA!);
      this.renderZeroOffset(this.stateDisp!);
      this.cur = this.stateA!;
      this.other = this.stateB!;
    }
  }

  private teardown(): void {
    this.filter?.destroy();
    this.stepFilter?.destroy();
    this.stepSprite?.destroy();
    this.copySprite?.destroy();
    this.display?.destroy();
    this.grid?.destroy(true);
    this.stateA?.destroy(true);
    this.stateB?.destroy(true);
    this.stateDisp?.destroy(true);
    this.filter = this.stepFilter = null;
    this.stepSprite = this.copySprite = null;
    this.grid = this.stateA = this.stateB = this.stateDisp = this.cur = this.other = null;
    this.view.removeChildren();
  }

  destroy(): void {
    this.teardown();
    this.view.destroy({ children: true });
  }
}
