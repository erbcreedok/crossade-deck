import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { CardBody } from "../CardBody";
import { spinAngle, spinScale, spinShowsOther } from "../flip";
import { easeOutQuad } from "../anim/easing";
import { TEX_H, TEX_W } from "../engine/constants";
import { scaleForState, shadowSilhouette } from "./plane";
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
// ПЛАВНО. Тень карта НЕ рисует сама: в sync() она считает СИЛУЭТ тени (shadowRect) — его
// движок собирает в общую маску уровня и заливает одной непрозрачной заливкой (см.
// ShadowLayer). Так пересекающиеся тени сливаются в одну и не темнят. Смещение/размер силуэта
// растут с «высотой» (elev): свет сверху справа → тень уходит вниз-влево, сильнее вниз.

export type CardState = "idle" | "floating" | "held" | "drag" | "fan";
export type RestState = "idle" | "floating" | "held";

/** Силуэт тени карты (центр, полуразмеры, поворот) — движок сливает их в маску уровня. */
export interface ShadowShape {
  x: number;
  y: number;
  hw: number;
  hh: number;
  rot: number;
}

export interface CardOptions {
  id?: string; // ключ идентичности для публичного API (flipCard/moveCard по id)
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
  rest?: RestState; // план ПОКОЯ: idle (на столе) / floating (левитация, «в руке») / held (в руке держат)
}

interface FlipAnim {
  t: number;
  dur: number;
  fromFaceUp: boolean;
}

const BOB_SPEED = 2.2;

// «Сжечь»: сначала карта ЗАМИРАЕТ на долю секунды (дрожь нарастает), затем теряет видимость
// СНИЗУ ВВЕРХ (маска с волнистым фронтом) при сильной дрожи.
const BURN_FREEZE = 0.14;
const BURN_DISSOLVE = 0.5;

export class Card {
  readonly root = new Container();
  readonly body = new CardBody();
  shadowRect: ShadowShape | null = null; // силуэт тени, обновляется в sync(); движок его собирает
  bobPhase = 0; // сдвиг фазы парения, чтобы карты не качались в унисон

  readonly id: string;
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
  readonly rest: RestState;
  private age = 0;
  private readonly baseSprite = new Sprite();
  private flip: FlipAnim | null = null;
  private block: { t: number; dur: number } | null = null; // «стоп»-покачивание при блоке драга
  private dying: { t: number; dur: number } | null = null; // «сжечь»: замирание → расход снизу вверх
  private burnMask: Graphics | null = null; // маска фронта горения (создаётся на фазе расхода)
  dead = false; // догорела — движок убирает её из песочницы

  constructor(
    opts: CardOptions,
    private readonly tex: CardTextureCache,
    private readonly baseScale: number,
  ) {
    this.id = opts.id ?? "";
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
    this.rest = opts.rest ?? "idle";
    this.state = this.rest; // стартуем в своём плане покоя

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

  /** Масштаб плана покоя карты — движок им расставляет карты при монтировании. */
  get restScale(): number {
    return scaleForState(this.rest);
  }

  /** Сменить план: целевой масштаб едет пружиной, поэтому размер/тень/позиция — плавно. */
  setState(s: CardState): void {
    this.state = s;
    this.body.setTarget({ scale: scaleForState(s) });
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

  /** Сжечь: карта замирает, потом расходится снизу вверх при сильной дрожи; затем dead → убирают. */
  burn(): void {
    if (!this.dying && !this.dead) this.dying = { t: 0, dur: BURN_FREEZE + BURN_DISSOLVE };
  }

  get burning(): boolean {
    return this.dying !== null;
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
    if (this.dying) {
      this.dying.t += dt;
      if (this.dying.t >= this.dying.dur) {
        this.dying = null;
        this.dead = true;
      }
    }
  }

  /** Парящая карта не «отдыхает» — она качается, значит цикл не должен засыпать под ней. */
  get resting(): boolean {
    return this.body.isResting() && !this.flip && !this.block && !this.dying && this.state !== "floating";
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

    // Силуэт тени. Смещение растёт с «высотой» (карта выше — тень дальше, сильнее вниз). РАЗМЕР
    // тени — от размера ПОКОЯ карты (scaleFactor), а не от увеличенной драгом (render): по
    // перспективе приподнятая карта кажется крупнее, но её тень на доске почти исходного
    // размера, лишь чуть подрастая с высотой. В покое сдвиг маленький (тень прижата).
    this.shadowRect = shadowSilhouette({
      px: this.body.px,
      py: this.body.py,
      shakeX,
      bobY,
      bobLift,
      rotation: this.body.rotation,
      scaleVal: this.body.scaleVal,
      scaleFactor: this.scaleFactor,
    });

    // «Сжечь». Две фазы: ЗАМИРАНИЕ (держим на месте, дрожь нарастает) → РАСХОД снизу вверх
    // (маска отрезает низ волнистым «фронтом горения») при сильной дрожи. Без общего затухания:
    // видимость съедает именно маска. Накладывается ПОВЕРХ обычного sync.
    if (this.dying) {
      const t = this.dying.t;
      const amp = this.width * 0.055; // «сильная дрожь»
      const jx = Math.sin(this.age * 92) * amp + Math.sin(this.age * 57) * amp * 0.5;
      const jy = Math.cos(this.age * 78) * amp * 0.7;
      if (t < BURN_FREEZE) {
        // Замирание на долю секунды: держим, дрожь плавно нарастает.
        const q = t / BURN_FREEZE;
        this.root.position.set(this.body.px + jx * q, this.body.py + jy * q);
      } else {
        const p = Math.min(1, (t - BURN_FREEZE) / BURN_DISSOLVE);
        this.root.position.set(this.body.px + jx, this.body.py + jy);
        // Видимой остаётся ВЕРХНЯЯ часть; нижняя граница (фронт) едет вверх и волнится.
        if (!this.burnMask) {
          this.burnMask = new Graphics();
          this.root.addChild(this.burnMask);
          this.root.mask = this.burnMask;
        }
        const frontY = -TEX_H / 2 + TEX_H * (1 - p);
        const pts: number[] = [-TEX_W / 2, -TEX_H / 2, TEX_W / 2, -TEX_H / 2];
        const seg = 10;
        for (let k = 0; k <= seg; k++) {
          const x = TEX_W / 2 - TEX_W * (k / seg);
          pts.push(x, frontY + Math.sin(x * 0.18 + this.age * 26 + k) * TEX_H * 0.05);
        }
        this.burnMask.clear();
        this.burnMask.poly(pts).fill(0xffffff);
        // Тень съёживается вслед за расходящейся картой и гаснет.
        if (this.shadowRect) {
          if (p > 0.85) this.shadowRect = null;
          else this.shadowRect.hh *= 1 - p;
        }
      }
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
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
