import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { CardBody } from "../CardBody";
import { spinAngle, spinScale, spinShowsOther } from "../flip";
import { easeOutQuad } from "../anim/easing";
import { DRAG_SCALE, SHADOW_ALPHA, TEX_H, TEX_W } from "../engine/constants";
import type { FaceStyle } from "../engine/cardTextures";
import type { CardBackId } from "../cardBack";
import type { CardTextureCache } from "./CardTextureCache";

// Карта UI-kit — объект с пропсами (масштабируемый, расширяемый) И «высотой над столом».
//
// План (state) задаёт, в каком слое лежит карта и как высоко парит:
//   idle     — лежит на столе (низкая тень);
//   floating — парит (тень дальше/крупнее, слегка больше, покачивается в воздухе — bob);
//   drag     — в руке игрока (наивысшая, тень растёт сильнее всего);
//   fan      — в вееере (задел на будущее).
// Смена плана меняет целевой масштаб (пружина CardBody), поэтому размер/тень/позиция едут
// ПЛАВНО. Тень — отдельный спрайт (движок кладёт его в нужный слой): её смещение и размер
// растут с «высотой» (lift), свет сверху справа → тень уходит вниз-влево.

export type CardState = "idle" | "floating" | "drag" | "fan";

export interface CardOptions {
  card?: string;
  faceUp?: boolean;
  flippable?: boolean;
  back?: CardBackId;
  faceStyle?: FaceStyle;
  fourColor?: boolean;
  torn?: boolean;
  size?: number;
}

interface FlipAnim {
  t: number;
  dur: number;
  fromFaceUp: boolean;
}

const FLOAT_SCALE = 1.06; // парящая чуть крупнее
const IDLE_LIFT = 0.3; // базовая «высота» лежащей карты — тень заметно дальше, чем впритык
const BOB_SPEED = 2.2;

export class Card {
  readonly root = new Container();
  readonly shadow: Sprite;
  readonly body = new CardBody();
  bobPhase = 0; // сдвиг фазы парения, чтобы карты не качались в унисон

  readonly card: string;
  faceUp: boolean;
  readonly flippable: boolean;
  readonly back: CardBackId;
  readonly faceStyle: FaceStyle;
  readonly fourColor: boolean;
  readonly torn: boolean;
  readonly size: number;

  state: CardState = "idle";
  private age = 0;
  private readonly baseSprite = new Sprite();
  private flip: FlipAnim | null = null;

  constructor(
    opts: CardOptions,
    private readonly tex: CardTextureCache,
    private readonly baseScale: number,
  ) {
    this.card = opts.card ?? "A♠";
    this.faceUp = opts.faceUp ?? true;
    this.flippable = opts.flippable ?? true;
    this.back = opts.back ?? "ruby";
    this.faceStyle = opts.faceStyle ?? "pips";
    this.fourColor = opts.fourColor ?? false;
    this.torn = opts.torn ?? false;
    this.size = opts.size ?? 1;

    this.shadow = new Sprite(tex.shadow());
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = SHADOW_ALPHA;

    this.baseSprite.anchor.set(0.5);
    this.root.addChild(this.baseSprite);
    if (this.torn) this.root.addChild(this.buildTear());
    if (!this.flippable) this.root.addChild(this.buildLock());
    this.paint();
  }

  get scaleFactor(): number {
    return this.baseScale * this.size;
  }

  get width(): number {
    return TEX_W * this.scaleFactor;
  }

  get height(): number {
    return TEX_H * this.scaleFactor;
  }

  /** Сменить план: целевой масштаб едет пружиной, поэтому размер/тень/позиция — плавно. */
  setState(s: CardState): void {
    this.state = s;
    const scale = s === "drag" ? DRAG_SCALE : s === "floating" ? FLOAT_SCALE : 1;
    this.body.setTarget({ scale });
  }

  requestFlip(): boolean {
    if (!this.flippable || this.flip) return false;
    this.flip = { t: 0, dur: 0.45, fromFaceUp: this.faceUp };
    return true;
  }

  step(dt: number): void {
    this.age += dt;
    this.body.step(dt);
    if (this.flip) {
      this.flip.t += dt;
      if (this.flip.t >= this.flip.dur) {
        this.faceUp = !this.flip.fromFaceUp;
        this.flip = null;
        this.paint();
      }
    }
  }

  /** Парящая карта не «отдыхает» — она качается, значит цикл не должен засыпать под ней. */
  get resting(): boolean {
    return this.body.isResting() && !this.flip && this.state !== "floating";
  }

  sync(): void {
    const render = this.body.scaleVal * this.scaleFactor;
    // «Парение»: покачивание вверх-вниз только у floating; выше поднялась — дальше тень.
    let bobY = 0;
    let bobLift = 0;
    if (this.state === "floating") {
      const b = Math.sin(this.age * BOB_SPEED + this.bobPhase);
      bobY = b * this.height * 0.05;
      bobLift = (b * 0.5 + 0.5) * 0.12;
    }

    this.root.position.set(this.body.px, this.body.py + bobY);
    this.root.rotation = this.body.rotation;
    if (this.flip) {
      const angle = spinAngle(easeOutQuad(Math.min(1, this.flip.t / this.flip.dur)), 1);
      this.root.scale.set(render * spinScale(angle), render);
      const showOther = spinShowsOther(angle);
      this.baseSprite.texture = this.faceTex(showOther ? !this.flip.fromFaceUp : this.flip.fromFaceUp);
    } else {
      this.root.scale.set(render);
    }

    // Тень: смещение и размер растут с «высотой». Свет сверху справа → тень вниз-влево.
    const lift = this.body.scaleVal - 1 + IDLE_LIFT + bobLift;
    const chpx = TEX_H * this.scaleFactor;
    this.shadow.position.set(this.body.px - lift * chpx * 0.14, this.body.py + bobY * 0.35 + lift * chpx * 0.2);
    this.shadow.rotation = this.body.rotation;
    this.shadow.scale.set(render * (1 + lift * 0.18));
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.shadow.destroy();
  }

  // ——— отрисовка ———

  private faceTex(faceUp: boolean): Texture {
    return faceUp ? this.tex.face(this.card, this.fourColor, this.faceStyle) : this.tex.back(this.back);
  }

  private paint(): void {
    this.baseSprite.texture = this.faceTex(this.faceUp);
  }

  private buildTear(): Graphics {
    const g = new Graphics();
    const steps = 9;
    const pts: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const y = -TEX_H / 2 + (TEX_H * i) / steps;
      pts.push((i % 2 ? -1 : 1) * 12, y);
    }
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
    g.stroke({ width: 10, color: 0xefe6d0 });
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
    g.stroke({ width: 3, color: 0x3a2f1f });
    return g;
  }

  private buildLock(): Graphics {
    const g = new Graphics();
    const x = TEX_W / 2 - 30;
    const y = -TEX_H / 2 + 36;
    g.arc(x, y - 6, 9, Math.PI, 0).stroke({ width: 4, color: 0x1e1e1e });
    g.roundRect(x - 14, y - 6, 28, 22, 4).fill({ color: 0x1e1e1e });
    g.circle(x, y + 3, 3).fill({ color: 0xd0c090 });
    return g;
  }
}
