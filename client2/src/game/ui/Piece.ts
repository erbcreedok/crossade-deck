import { Container, type Graphics } from "pixi.js";
import { CardBody } from "../CardBody";
import { ParticleField } from "../engine/censorParticles";
import { DANCE_DEFAULT, DUST_FLICKER, dustParams } from "../censorConfig";
import { scaleForState } from "./plane";
import { shadowOf, withEffect } from "./shadow";
import type { AnimPreset } from "../anim/presets";
import { applyEffect } from "../anim/effectApply";
import { bobOffset, idleBobs, scaleFromZ, screenLift, zFromScale } from "./elevation";
import { TEX_H, TEX_W } from "../engine/constants";
import type { Burnable, Draggable, TableElement } from "../engine/element";
import type { CardState, Pose, ShadowShape } from "./Card";
import type { OwnShadow } from "./silhouetteExtract";
import type { GlowShape } from "./selection";
import { ElementLife } from "./elementLife";
import { remountGlow } from "./elementGlow";

// Обобщённый ЭЛЕМЕНТ стола, НЕ карта: фишка, шахматная фигура — что угодно с телом и тенью.
// Реализует ровно те же способности, что и Card (TableElement + Draggable + Burnable), но НЕ
// Flippable — значит зона «перевернуть» его проигнорирует (реакция зоны на СПОСОБНОСТИ, не на
// тип), а зона «сжечь» — сработает. Визуал рисует переданный build(root); физика/тень/цикл —
// общие с картой. ОБЩЕЕ не скопировано, а разделено с ней коллабораторами: жизнь
// (block/born/dying, пресет) — ElementLife, свечение — elementGlow; фишка не «упрощённый
// элемент», а такой же — своей у неё остаётся только форма (габарит/снимок) и цензура-пыль
// по переданным точкам.

export interface PieceOptions {
  id: string;
  w: number; // футпринт ПОКОЯ для хит-теста (полуразмеры × scaleVal)
  h: number;
  build: (root: Container) => void; // нарисовать визуал в ЛОКАЛЬНЫХ координатах (центр 0,0)
  shadow: { rx: number; ry: number; dy: number }; // габарит тени: полуоси + сдвиг вниз
  /**
   * СОБСТВЕННАЯ тень — снимок этого же визуала (ui/silhouetteExtract.ts): форма совпадает с
   * предметом один в один, потому что это он и есть. Нет снимка — остаётся габарит выше; это не
   * «запасной вариант»: лежащей фишке эллипс и есть её форма, снимать там нечего.
   */
  own?: OwnShadow | null;
  /**
   * Точки рождения пыли-цензуры, снятые с ЭТОГО визуала. Цензура — не карточная фича: она
   * размазывает настоящее лицо предмета, каким бы он ни был. Считает их тот, у кого есть рендерер
   * (pieceKinds.buildPiece), — предмету остаётся крутить облако.
   */
  censorSeeds?: ReadonlyArray<{ x: number; y: number; color: number }> | null;
  censored?: boolean;
  pose?: Pose;
  /** Дышит ли фишка (idle-покачивание). Не задано — по позе: поднятая дышит, лежащая нет. */
  idle?: boolean;
  tags?: string[]; // идентичность-ДАННЫЕ: chip, color:green, piece:♞ … (SELECTION-DESIGN §2)
}

export class Piece implements TableElement, Draggable, Burnable {
  readonly root = new Container();
  readonly body = new CardBody();
  readonly life = new ElementLife(); // общая жизнь предмета: block/born/dying, возраст, пресет
  shadowRect: ShadowShape | null = null;

  readonly id: string;
  readonly tags: ReadonlySet<string>;
  readonly draggable = true;
  readonly pose: Pose;
  /** Явное «дышать / не дышать»; не задано — решает поза (`idleBobs`). */
  readonly idle?: boolean;
  /** Сдвиг фазы дыхания — чтобы соседи не качались в унисон. Ставит тот, кто расставляет. */
  bobPhase = 0;
  state: CardState;
  private readonly w: number;
  private readonly h: number;

  private readonly shadowCfg: { rx: number; ry: number; dy: number };
  private readonly own: OwnShadow | null;
  private readonly censorSeeds: ReadonlyArray<{ x: number; y: number; color: number }> | null;
  private glowNode: Container | null = null; // свечение выделения (setGlow)
  private dust: ParticleField | null = null;
  private dustT = 0;
  private _censored: boolean;
  private mask: { g: Graphics | null } = { g: null };
  /** Высота над столом (ось z). У лежащего — 0. */
  private zBase = 0;
  /** «Без вспышек» (issue #9): гасит дрожь «сжечь», оставляя затухание+сжатие. Движок ставит на спавне/смене. */
  flashOff = false;
  /** OS/юзер reduce-motion: замораживает дыхание в статичный кадр. Ставит движок, как у карты. */
  reduceMotion = false;
  /** Лёгкий профиль качества: тоже замораживает дыхание. Ставит движок при просадке FPS. */
  lowFx = false;

  constructor(opts: PieceOptions) {
    this.id = opts.id;
    this.tags = new Set(opts.tags ?? []);
    this.w = opts.w;
    this.h = opts.h;
    this.shadowCfg = opts.shadow;
    this.own = opts.own ?? null;
    this.censorSeeds = opts.censorSeeds ?? null;
    this._censored = opts.censored ?? false;
    this.pose = opts.pose ?? "rest";
    this.idle = opts.idle;
    this.state = this.pose;
    opts.build(this.root);
    if (this._censored) this.buildDust();
  }

  /** Силуэт для свечения: БЕЛАЯ версия собственного снимка (форма тени, цвет под tint) — конь
   *  светится конём. Нет снимка или белой версии (фишка) — null: фишке круг и есть её форма. */
  get glowSilhouette(): { texture: import("pixi.js").Texture; bounds: OwnShadow["bounds"] } | null {
    return this.own?.white ? { texture: this.own.white, bounds: this.own.bounds } : null;
  }

  /** Свечение выделения (Glowable) — общий атом (elementGlow); своя тут только форма-фоллбэк:
   *  СОБСТВЕННЫЙ силуэт (есть снимок) или круг-футпринт. */
  setGlow(color: number | null, figure?: readonly GlowShape[]): void {
    const sil = this.glowSilhouette;
    const fallback: GlowShape = sil
      ? { kind: "silhouette", x: sil.bounds.x, y: sil.bounds.y, w: sil.bounds.width, h: sil.bounds.height, texture: sil.texture }
      : { x: -this.w / 2, y: -this.h / 2, w: this.w, h: this.h, radius: Math.min(this.w, this.h) / 2 };
    this.glowNode = remountGlow(this.root, this.glowNode, color, figure, this.body.scaleVal || 1, fallback);
  }

  /** Полуразмеры покоя — хит-тест берёт их × scaleVal. */
  get footprint(): { hw: number; hh: number } {
    return { hw: this.w / 2, hh: this.h / 2 };
  }

  get restScale(): number {
    return scaleForState(this.pose);
  }

  setState(s: CardState): void {
    this.state = s;
    this.body.setTarget({ scale: scaleForState(s) });
  }

  get censored(): boolean {
    return this._censored;
  }

  /**
   * Включить/выключить цензуру. Пыль ложится ПОВЕРХ настоящего лица предмета — она его смазывает,
   * а не заменяет: это фильтр, а не «другая картинка» (то же разделение, что у карты).
   */
  setCensored(v: boolean): void {
    if (v === this._censored) return;
    this._censored = v;
    if (v && !this.dust) this.buildDust();
    if (this.dust) this.dust.view.visible = v;
  }

  private buildDust(): void {
    if (!this.censorSeeds || this.censorSeeds.length === 0) return;
    this.dust = new ParticleField(this.censorSeeds, dustParams(DANCE_DEFAULT, DUST_FLICKER));
    this.root.addChild(this.dust.view);
  }

  blockNudge(): void {
    this.life.blockNudge();
  }

  setZ(v: number): void {
    this.zBase = Math.max(0, v);
  }

  get animPreset(): AnimPreset {
    return this.life.preset;
  }

  setAnimPreset(p: AnimPreset): void {
    this.life.setPreset(p, this.body);
  }

  appear(): void {
    this.life.appear();
  }

  burn(): void {
    this.life.burn();
  }

  get burning(): boolean {
    return this.life.burning;
  }

  get dead(): boolean {
    return this.life.dead;
  }

  step(dt: number): void {
    this.body.step(dt);
    this.life.step(dt);
    if (this.dusty) {
      this.dustT += dt;
      this.dust!.update(this.dustT);
    }
  }

  /** Крутится ли пыль прямо сейчас. Заморозка движения её останавливает — как и дыхание. */
  private get dusty(): boolean {
    return this.dust !== null && this._censored && !this.reduceMotion && !this.lowFx;
  }

  get resting(): boolean {
    // `born`/`dying` (life.settled) тут обязательны: без них цикл засыпает ПОСРЕДИ появления и
    // фишка застывает полупрозрачной (см. CLAUDE.md про EngineActivity — ровно эта ловушка).
    // Дыхание — вторая непрерывная анимация, и условие идёт по нему, а не по позе.
    return this.body.isResting() && !this.body.travelling && this.life.settled && !this.bobbing && !this.dusty;
  }

  /** Качается ли прямо сейчас. Заморозка движения (reduce-motion / лёгкий профиль) её отменяет. */
  private get bobbing(): boolean {
    return !this.reduceMotion && !this.lowFx && idleBobs(this.state, this.idle) && this.life.preset.idle.amp > 0;
  }

  sync(): void {
    const render = this.body.scaleVal;
    const shakeX = this.life.shakeX(this.w, 0.06);
    // Дыхание — ЭКРАННОЕ покачивание, как у карты: в `z` оно не идёт, иначе тень начнёт дышать
    // размером под предметом, который не изменился.
    const bob = this.bobbing ? bobOffset(Math.sin(this.life.age * this.life.preset.idle.speed + this.bobPhase), this.life.preset.idle.amp, this.h) : 0;
    // Высота — та же ось, что у карты: поза покоя плюс подъём полёта плюс заданный z.
    const z = zFromScale(this.body.scaleVal) + this.body.liftPx / Math.max(1, this.h) + this.zBase;
    this.root.position.set(this.body.px + shakeX, this.body.py + screenLift(z, this.h) + bob);
    this.root.rotation = this.body.rotation;
    const drawn = render * scaleFromZ(this.zBase); // тот же множитель, что уходит в root.scale
    this.root.scale.set(drawn);

    // Эффект (ElementLife) — ДО тени: она выводится из итогового состояния, а не правится под
    // каждый способ. Маски стилей нарисованы в координатах карточной текстуры — вписываем их в
    // коробку предмета.
    const fx = this.life.effectFrame(this.w, this.flashOff);
    const unit = { x: this.w / TEX_W, y: this.h / TEX_H };
    if (fx) applyEffect(this.root, this.body.px, this.body.py, fx, this.mask, unit);

    const own = this.own;
    this.shadowRect = shadowOf(
      withEffect(
        {
          px: this.body.px,
          py: this.body.py,
          shakeX,
          z,
          screenY: bob,
          rotation: this.body.rotation,
          // Силуэт — от НАРИСОВАННОГО размера, как у карты: поднятая фишка крупнее лежащей, и
          // тень у неё крупнее во столько же.
          hw: this.shadowCfg.rx * drawn,
          hh: this.shadowCfg.ry * drawn,
          // Снимку сдвиг не нужен: он ложится ровно туда, где нарисован предмет. Габаритной тени —
          // нужен: пятно рисуется от центра, а стоит предмет на низу.
          baseDy: own ? 0 : this.shadowCfg.dy * drawn,
          reach: this.w * drawn,
          round: !own,
          // Маска эффекта режет тень в тех же единицах, в каких режет предмет.
          polyK: drawn * unit.x,
          polyKy: drawn * unit.y,
          image: own ? { texture: own.texture, bx: own.bounds.x, by: own.bounds.y, bw: own.bounds.width, bh: own.bounds.height, k: drawn } : null,
        },
        fx,
      ),
      this.life.preset.shadow,
    );
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
