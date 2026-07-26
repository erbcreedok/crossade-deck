import { Application, Container, Filter, GlProgram, RenderTexture, Sprite } from "pixi.js";
import { buildContent } from "../fingerContent";
import { TEX_H, TEX_W } from "./constants";

// GPU-варианты «цензуры»: вся анимация на видеокарте, CPU за кадр лишь двигает один uniform (uTime/uStep).
// Демонстрируют два подхода из обсуждения:
//   "remap"    — СТЕЙТЛЕСС фрагментный шейдер: цвет клетки = сосед, выбранный хешем от (клетка, tick).
//                Пересемплирование каждый тик → «моргает». CPU ≈ 0, состояния нет.
//   "pingpong" — НАКОПЛЕНИЕ на GPU через две RenderTexture: шаг-шейдер читает прошлое состояние, меняет
//                местами домино-пары и пишет новое. Плавный «ползущий» танец, состояние живёт в текстурах.
// Оба рисуют пиксель-блоки, размер задаётся сеткой (cols×rows) — частица 2.5 достижима без нагрузки CPU.

export type GpuMode = "remap" | "pingpong";

// Стандартная вершинка фильтра Pixi v8 (uInputSize/uOutputFrame/uOutputTexture проставляет сам движок).
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
vec2 filterTextureCoord( void ) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}`;

const HASH = `
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}`;

// СТЕЙТЛЕСС ремап: клетка берёт цвет соседа, выбранного хешем от (клетка, tick). Никакой памяти.
const REMAP_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uGrid;
uniform float uTime;
uniform float uRate;
${HASH}
void main(void){
  vec2 cell = floor(vTextureCoord * uGrid);
  float tick = floor(uTime * uRate);
  float h = hash21(cell + vec2(tick * 13.0, tick * 7.0));
  vec2 dir = vec2(0.0);
  if (h < 0.18) dir = vec2(1.0, 0.0);
  else if (h < 0.36) dir = vec2(-1.0, 0.0);
  else if (h < 0.54) dir = vec2(0.0, 1.0);
  else if (h < 0.72) dir = vec2(0.0, -1.0);
  vec2 uv = (cell + dir + 0.5) / uGrid;
  finalColor = texture(uTexture, uv);
}`;

// ШАГ-шейдер накопления: домино-обмен пар. Ориентация/фаза по uStep, активность пары по хешу.
// Оба члена пары считают ОДИН pairId и ОДНУ активность → меняются согласованно. Читает prev, пишет next.
const STEP_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uGrid;
uniform float uStep;
uniform float uProb;
${HASH}
void main(void){
  vec2 cell = floor(vTextureCoord * uGrid);
  bool horiz = mod(uStep, 2.0) < 1.0;
  float phase = mod(floor(uStep / 2.0), 2.0);
  vec2 partner; float pairId;
  if (horiz) {
    float pick = mod(cell.x + phase, 2.0) < 1.0 ? 1.0 : -1.0;
    partner = vec2(cell.x + pick, cell.y);
    pairId = min(cell.x, cell.x + pick) + cell.y * uGrid.x * 2.0;
  } else {
    float pick = mod(cell.y + phase, 2.0) < 1.0 ? 1.0 : -1.0;
    partner = vec2(cell.x, cell.y + pick);
    pairId = min(cell.y, cell.y + pick) + cell.x * uGrid.y * 2.0;
  }
  bool inRange = partner.x >= 0.0 && partner.x < uGrid.x && partner.y >= 0.0 && partner.y < uGrid.y;
  bool swap = inRange && hash21(vec2(pairId, uStep)) < uProb;
  vec2 from = swap ? partner : cell;
  finalColor = texture(uTexture, (from + 0.5) / uGrid);
}`;

function makeFilter(fragment: string, uniforms: Record<string, { value: number | Float32Array; type: string }>): Filter {
  const f = new Filter({ glProgram: GlProgram.from({ vertex: VERT, fragment, name: "censor-gpu" }), resources: { u: uniforms } });
  f.padding = 0;
  return f;
}

export class GpuCensorCard {
  readonly view = new Container();
  private app: Application;
  private mode: GpuMode;
  private rate: number;
  private cols: number;
  private rows: number;
  private display: Sprite;
  // remap:
  private filter: Filter | null = null;
  private grid: RenderTexture | null = null;
  // pingpong:
  private stateA: RenderTexture | null = null;
  private stateB: RenderTexture | null = null;
  private cur: RenderTexture | null = null;
  private other: RenderTexture | null = null;
  private stepSprite: Sprite | null = null;
  private stepFilter: Filter | null = null;
  private step = 0;

  // prob — доля домино-пар, обменивающихся за шаг (только для pingpong). Мало → медленное «ползание»
  // силуэта; много → быстрая диффузия в кашу (свапы копят энтропию, так что мельчит всё равно, но дольше).
  constructor(app: Application, mode: GpuMode, block: number, rate: number, prob = 0.5) {
    this.app = app;
    this.mode = mode;
    this.rate = rate;
    this.cols = Math.max(1, Math.round(TEX_W / block));
    this.rows = Math.max(1, Math.round(TEX_H / block));
    const grid = new Float32Array([this.cols, this.rows]);

    if (mode === "remap") {
      this.grid = this.newGrid();
      this.renderFinger(this.grid);
      const sprite = new Sprite(this.grid);
      sprite.setSize(TEX_W, TEX_H);
      this.filter = makeFilter(REMAP_FRAG, {
        uGrid: { value: grid, type: "vec2<f32>" },
        uTime: { value: 0, type: "f32" },
        uRate: { value: rate, type: "f32" },
      });
      sprite.filters = [this.filter];
      this.display = sprite;
    } else {
      this.stateA = this.newGrid();
      this.stateB = this.newGrid();
      this.renderFinger(this.stateA);
      this.cur = this.stateA;
      this.other = this.stateB;
      this.stepFilter = makeFilter(STEP_FRAG, {
        uGrid: { value: grid, type: "vec2<f32>" },
        uStep: { value: 0, type: "f32" },
        uProb: { value: prob, type: "f32" },
      });
      this.stepSprite = new Sprite(this.stateA);
      this.stepSprite.filters = [this.stepFilter];
      const display = new Sprite(this.cur);
      display.setSize(TEX_W, TEX_H);
      this.display = display;
    }
    this.view.addChild(this.display);
  }

  private newGrid(): RenderTexture {
    const rt = RenderTexture.create({ width: this.cols, height: this.rows });
    rt.source.scaleMode = "nearest";
    return rt;
  }

  // Отрисовать фак в сетку (амбер на прозрачном) в заданную RenderTexture.
  private renderFinger(rt: RenderTexture): void {
    const content = buildContent();
    content.scale.set(this.cols / TEX_W, this.rows / TEX_H);
    this.app.renderer.render({ container: content, target: rt, clear: true });
    content.destroy({ children: true });
  }

  update(t: number): void {
    if (this.mode === "remap") {
      if (this.filter) (this.filter.resources.u.uniforms as { uTime: number }).uTime = t;
      return;
    }
    // pingpong: догоняем rate шагов/сек. Потолок 8 шагов на кадр — не залипнуть при большом dt/паузе.
    const target = Math.floor(t * this.rate);
    let steps = Math.min(8, target - this.step);
    while (steps-- > 0) {
      (this.stepFilter!.resources.u.uniforms as { uStep: number }).uStep = this.step;
      this.stepSprite!.texture = this.cur!;
      this.app.renderer.render({ container: this.stepSprite!, target: this.other!, clear: true });
      const swap = this.cur!;
      this.cur = this.other!;
      this.other = swap;
      this.display.texture = this.cur;
      this.step++;
    }
  }

  // Ререндер: стейтлесс просто перезапустится по t; накопление — вернуть исходный фак в текущее состояние.
  reset(): void {
    this.step = 0;
    if (this.mode === "pingpong" && this.stateA) {
      this.renderFinger(this.stateA);
      this.cur = this.stateA;
      this.other = this.stateB;
      this.display.texture = this.cur;
    }
  }

  destroy(): void {
    this.filter?.destroy();
    this.stepFilter?.destroy();
    this.stepSprite?.destroy();
    this.grid?.destroy(true);
    this.stateA?.destroy(true);
    this.stateB?.destroy(true);
    this.view.destroy({ children: true });
  }
}
