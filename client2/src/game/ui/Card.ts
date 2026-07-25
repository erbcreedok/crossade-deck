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
  draggable?: boolean; // можно ли тащить; false — драг блокируется «стоп»-анимацией
  back?: CardBackId;
  faceStyle?: FaceStyle;
  fourColor?: boolean;
  torn?: boolean;
  size?: number;
  hidden?: boolean; // скрытая карта: без номинала, «лицо» — 🖕 (обычно лежит рубашкой вверх)
  joker?: boolean; // джокер: кастомное рисованное лицо
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
  readonly draggable: boolean;
  readonly back: CardBackId;
  readonly faceStyle: FaceStyle;
  readonly fourColor: boolean;
  readonly torn: boolean;
  readonly size: number;
  readonly hidden: boolean;
  readonly joker: boolean;

  state: CardState = "idle";
  private age = 0;
  private readonly baseSprite = new Sprite();
  private flip: FlipAnim | null = null;
  private block: { t: number; dur: number } | null = null; // «стоп»-покачивание при блоке драга

  constructor(
    opts: CardOptions,
    private readonly tex: CardTextureCache,
    private readonly baseScale: number,
  ) {
    this.card = opts.card ?? "A♠";
    this.faceUp = opts.faceUp ?? true;
    this.flippable = opts.flippable ?? true;
    this.draggable = opts.draggable ?? true;
    this.back = opts.back ?? "ruby";
    this.faceStyle = opts.faceStyle ?? "pips";
    this.fourColor = opts.fourColor ?? false;
    this.torn = opts.torn ?? false;
    this.size = opts.size ?? 1;
    this.hidden = opts.hidden ?? false;
    this.joker = opts.joker ?? false;

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

  /** Лёгкая «стоп»-анимация: короткое затухающее покачивание — «эту карту тащить нельзя». */
  blockNudge(): void {
    if (!this.block) this.block = { t: 0, dur: 0.4 };
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
    if (this.block) {
      this.block.t += dt;
      if (this.block.t >= this.block.dur) this.block = null;
    }
  }

  /** Парящая карта не «отдыхает» — она качается, значит цикл не должен засыпать под ней. */
  get resting(): boolean {
    return this.body.isResting() && !this.flip && !this.block && this.state !== "floating";
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

    // «Стоп»-покачивание при заблокированном драге: затухающее мелкое смещение вбок.
    let shakeX = 0;
    if (this.block) {
      const p = this.block.t / this.block.dur;
      shakeX = Math.sin(this.block.t * 42) * this.width * 0.05 * (1 - p);
    }

    this.root.position.set(this.body.px + shakeX, this.body.py + bobY);
    this.root.rotation = this.body.rotation;
    if (this.flip) {
      const angle = spinAngle(easeOutQuad(Math.min(1, this.flip.t / this.flip.dur)), 1);
      this.root.scale.set(render * spinScale(angle), render);
      const showOther = spinShowsOther(angle);
      this.baseSprite.texture = this.faceTex(showOther ? !this.flip.fromFaceUp : this.flip.fromFaceUp);
    } else {
      this.root.scale.set(render);
    }

    // Тень: смещение растёт с «высотой» (карта выше — тень дальше). А вот РАЗМЕР тени — от
    // размера ПОКОЯ карты (scaleFactor), а не от увеличенной драгом (render): по перспективе
    // приподнятая карта кажется крупнее (ближе к глазу), но её тень на доске остаётся почти
    // исходного размера, лишь чуть подрастая с высотой. Свет сверху справа → тень вниз-влево.
    const lift = this.body.scaleVal - 1 + IDLE_LIFT + bobLift;
    const chpx = TEX_H * this.scaleFactor;
    // Смещение растёт с высотой СИЛЬНЕЕ размера: приподнятая карта крупнее, но тень уходит
    // дальше вниз-влево и выглядывает из-под неё, а не прячется целиком (иначе «тень пропала»).
    this.shadow.position.set(this.body.px + shakeX - lift * chpx * 0.26, this.body.py + bobY * 0.35 + lift * chpx * 0.34);
    this.shadow.rotation = this.body.rotation;
    this.shadow.scale.set(this.scaleFactor * (1 + lift * 0.15));
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.shadow.destroy();
  }

  // ——— отрисовка ———

  private faceTex(faceUp: boolean): Texture {
    if (!faceUp) return this.tex.back(this.back);
    // Особые лица: скрытая (🖕) и джокер (кастом); иначе обычное числовое.
    if (this.hidden) return this.tex.hiddenFace();
    if (this.joker) return this.tex.jokerFace();
    return this.tex.face(this.card, this.fourColor, this.faceStyle);
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
