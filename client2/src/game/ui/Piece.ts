import { Container, Graphics, Text } from "pixi.js";
import { CardBody } from "../CardBody";
import { scaleForState } from "./plane";
import { pieceSilhouette } from "../effects/pieceShadow";
import { BURN_DUR } from "../effects/burn";
import type { Burnable, Draggable, TableElement } from "../engine/element";
import type { CardState, RestState, ShadowShape } from "./Card";

// Обобщённый ЭЛЕМЕНТ стола, НЕ карта: фишка, шахматная фигура — что угодно с телом и тенью.
// Реализует ровно те же способности, что и Card (TableElement + Draggable + Burnable), но НЕ
// Flippable — значит зона «перевернуть» его проигнорирует (реакция зоны на СПОСОБНОСТИ, не на
// тип), а зона «сжечь» — сработает. Визуал рисует переданный build(root); физика/тень/цикл —
// общие с картой (то самое «встаёт на место карты без правок систем»). Так withDragger/withAnchor
// и драг работают на нём без единой строчки «для фишек».

export interface PieceOptions {
  id: string;
  w: number; // футпринт ПОКОЯ для хит-теста (полуразмеры × scaleVal)
  h: number;
  build: (root: Container) => void; // нарисовать визуал в ЛОКАЛЬНЫХ координатах (центр 0,0)
  shadow: { rx: number; ry: number; dy: number }; // эллипс тени у основания: полуоси + сдвиг вниз
  rest?: RestState;
  tags?: string[]; // идентичность-ДАННЫЕ: chip, color:green, piece:♞ … (SELECTION-DESIGN §2)
}

export class Piece implements TableElement, Draggable, Burnable {
  readonly root = new Container();
  readonly body = new CardBody();
  shadowRect: ShadowShape | null = null;

  readonly id: string;
  readonly tags: ReadonlySet<string>;
  readonly draggable = true;
  readonly rest: RestState;
  state: CardState;
  private readonly w: number;
  private readonly h: number;
  private readonly shadowCfg: { rx: number; ry: number; dy: number };
  private age = 0;
  private block: { t: number; dur: number } | null = null;
  private dying: { t: number; dur: number } | null = null;
  dead = false;

  constructor(opts: PieceOptions) {
    this.id = opts.id;
    this.tags = new Set(opts.tags ?? []);
    this.w = opts.w;
    this.h = opts.h;
    this.shadowCfg = opts.shadow;
    this.rest = opts.rest ?? "idle";
    this.state = this.rest;
    opts.build(this.root);
  }

  /** Полуразмеры покоя — хит-тест берёт их × scaleVal. */
  get footprint(): { hw: number; hh: number } {
    return { hw: this.w / 2, hh: this.h / 2 };
  }

  get restScale(): number {
    return scaleForState(this.rest);
  }

  setState(s: CardState): void {
    this.state = s;
    this.body.setTarget({ scale: scaleForState(s) });
  }

  blockNudge(): void {
    if (!this.block) this.block = { t: 0, dur: 0.4 };
  }

  burn(): void {
    if (!this.dying && !this.dead) this.dying = { t: 0, dur: BURN_DUR };
  }

  get burning(): boolean {
    return this.dying !== null;
  }

  step(dt: number): void {
    this.age += dt;
    this.body.step(dt);
    if (this.block) {
      this.block.t += dt;
      if (this.block.t >= this.block.dur) this.block = null;
    }
    if (this.dying) {
      this.dying.t += dt;
      if (this.dying.t >= this.dying.dur) {
        this.dying = null;
        this.dead = true;
      }
    }
  }

  get resting(): boolean {
    return this.body.isResting() && !this.block && !this.dying && this.state !== "floating";
  }

  sync(): void {
    const render = this.body.scaleVal;
    let shakeX = 0;
    if (this.block) {
      const p = this.block.t / this.block.dur;
      shakeX = Math.sin(this.block.t * 42) * this.w * 0.06 * (1 - p);
    }
    this.root.position.set(this.body.px + shakeX, this.body.py);
    this.root.rotation = this.body.rotation;
    this.root.scale.set(render);

    this.shadowRect = pieceSilhouette({
      px: this.body.px,
      py: this.body.py,
      shakeX,
      rx: this.shadowCfg.rx,
      ry: this.shadowCfg.ry,
      baseDy: this.shadowCfg.dy,
      elev: this.body.scaleVal - 1,
    });

    // «Сжечь»: без карточной маски — фишка дрожит, тускнеет и сжимается; затем dead → убирают.
    if (this.dying) {
      const p = this.dying.t / this.dying.dur;
      const jx = Math.sin(this.age * 52) * this.w * 0.05 * (1 - p);
      this.root.position.set(this.body.px + jx, this.body.py + Math.cos(this.age * 47) * this.h * 0.04 * (1 - p));
      this.root.alpha = 1 - p;
      this.root.scale.set(render * (1 - 0.4 * p));
      if (this.shadowRect) this.shadowRect.hh *= 1 - p;
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

// ——— визуалы (рисуют в ЛОКАЛЬНЫХ координатах, центр 0,0) ———

/** Покерная фишка: диск номинала, кремовые edge-споты по ободу, кремовое кольцо, светлое ядро, номинал. */
export function drawChip(root: Container, radius: number, color: number, label: string): void {
  const cream = 0xf2ecda;
  const g = new Graphics();
  // тело + тонкий тёмный кант (чтобы читалось на любом фоне)
  g.circle(0, 0, radius).fill({ color }).stroke({ width: radius * 0.05, color: darken(color, 0.5) });
  // edge-споты: 6 кремовых блоков по ободу (радиально-тангенциальные дуги)
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2;
    g.arc(0, 0, radius * 0.84, a - 0.24, a + 0.24).stroke({ width: radius * 0.34, color: cream, cap: "butt" });
  }
  // кремовое кольцо + светлое ядро (перекрывает внутренние концы спотов — остаются только на ободе)
  g.circle(0, 0, radius * 0.6).stroke({ width: radius * 0.09, color: cream });
  g.circle(0, 0, radius * 0.56).fill({ color: lighten(color, 0.12) });
  root.addChild(g);
  if (label) root.addChild(glyph(label, radius * 0.8, textInk(lighten(color, 0.12)), radius * 0.05, darken(color, 0.6)));
}

/** Шахматная фигура — СПЛОШНОЙ силуэт (без диска-подложки): глиф чёрного набора, крашенный в
 *  команду, с контрастным контуром. Белая — кремовая с тёмным кантом, чёрная — тёмная со светлым. */
export function drawChessPiece(root: Container, size: number, dark: boolean, sym: string): void {
  const fill = dark ? 0x2a2521 : 0xf1e8d4;
  const ink = dark ? 0xc9b892 : 0x241c14;
  root.addChild(glyph(sym, size * 1.15, fill, size * 0.045, ink));
}

// Текст-глиф по центру (0,0), с настраиваемым контуром.
function glyph(text: string, size: number, color: number, strokeW: number, strokeColor = 0x000000): Container {
  const t = new Text({
    text,
    style: { fontFamily: "'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols2','DejaVu Sans',serif", fontSize: size, fill: color, stroke: { color: strokeColor, width: strokeW }, align: "center" },
  });
  t.anchor.set(0.5);
  return t;
}

function darken(c: number, f: number): number {
  return mix(c, 0x000000, f);
}
function lighten(c: number, f: number): number {
  return mix(c, 0xffffff, f);
}
function textInk(bg: number): number {
  // Тёмный номинал на светлой фишке и наоборот — по яркости фона.
  const r = (bg >> 16) & 255;
  const gg = (bg >> 8) & 255;
  const b = bg & 255;
  return 0.299 * r + 0.587 * gg + 0.114 * b > 140 ? 0x201b16 : 0xf4ecd8;
}
function mix(a: number, b: number, f: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * f);
  const g = Math.round(ag + (bg - ag) * f);
  const bl = Math.round(ab + (bb - ab) * f);
  return (r << 16) | (g << 8) | bl;
}
