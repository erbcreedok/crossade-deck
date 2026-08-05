import { Graphics, Sprite } from "pixi.js";
import { TEX_H, TEX_W } from "../engine/constants";
import { scaled } from "../anim/presets";
import { cardTags } from "../slotfield/elementTags";
import type { CardTextureCache } from "./CardTextureCache";
import { CardSecrecy, repaintWithFade } from "./cardSecrecy";
import { buildLock, buildTear } from "./cardFace";
import { TableItem, type ItemCap, type ItemVisual } from "./tableItem";
import type { GlowShape } from "./selection";
import type { CardOptions } from "./cardTypes";
import { syncCard } from "./cardRender";

// ВИД «КАРТА» — запись реестра видов, как chip/chess в pieceKinds: тот же TableItem, свои —
// двустороннее лицо-текстура (флип со спином), секретность/цензура (CardSecrecy + вуаль) и
// украшения (надрыв, замок). Способности объявлены ДАННЫМИ (caps) — движок спрашивает их, а не тип.

export interface FlipAnim {
  t: number;
  dur: number;
  fromFaceUp: boolean;
}

const CARD_CAPS: ReadonlySet<ItemCap> = new Set(["flip", "conceal", "peek", "value", "censor"] as const);

export class CardVisual implements ItemVisual {
  readonly baseSprite = new Sprite();
  faceUp: boolean;
  flipAnim: FlipAnim | null = null;
  burnMask: Graphics | null = null; // маска фронта горения (создаётся на фазе расхода)
  secrecy!: CardSecrecy; // собирается в mount (ей нужны root и жизнь предмета)
  readonly flippable: boolean;
  readonly torn: boolean;
  readonly size: number;
  private it!: TableItem;

  constructor(
    private readonly opts: CardOptions,
    private readonly tex: CardTextureCache,
    readonly baseScale: number,
  ) {
    this.faceUp = opts.faceUp ?? true;
    this.flippable = opts.flippable ?? true;
    this.torn = opts.torn ?? false;
    this.size = opts.size ?? 1;
  }

  get scaleFactor(): number {
    return this.baseScale * this.size;
  }

  mount(it: TableItem): void {
    this.it = it;
    this.secrecy = new CardSecrecy(
      it.root,
      this.tex,
      { back: this.opts.back ?? "ruby", faceStyle: this.opts.faceStyle ?? "pips", fourColor: this.opts.fourColor ?? false, custom: this.opts.custom ?? "" },
      {
        faceUp: () => this.faceUp,
        busy: () => this.flipAnim !== null || it.life.burning || it.life.dead,
        requestFlip: () => void this.flip.request(it),
        setPeekBob: (v) => {
          it.peekBob = v;
        },
        repaint: () => repaintWithFade(this.secrecy.veil, this.baseSprite, this.secrecy.faceTex(this.faceUp)),
      },
      { card: this.opts.card ?? "A♠", hidden: this.opts.hidden ?? false, censored: this.opts.censored ?? false },
    );
    this.baseSprite.anchor.set(0.5);
    it.root.addChild(this.baseSprite);
    this.secrecy.prime();
    if (this.torn) it.root.addChild(buildTear());
    if (!this.flippable) it.root.addChild(buildLock());
    this.paint();
  }

  paint(): void {
    this.baseSprite.texture = this.secrecy.faceTex(this.faceUp);
  }

  // Флип — способность-данные: без неё дверь requestFlip отвечает «нет» сама.
  readonly flip = {
    faceUp: (): boolean => this.faceUp,
    request: (it: TableItem): boolean => {
      if (!this.flippable || this.flipAnim) return false;
      this.flipAnim = { t: 0, dur: Math.max(0.001, scaled(it.life.preset.flip.dur, it.life.preset.speed)), fromFaceUp: this.faceUp };
      this.secrecy.veil.dropFade(); // флип сам сменит текстуру спином — кросс-фейд лица не к месту
      return true;
    },
  };

  // Цензура карты — часть секретности (пыль по настоящему лицу).
  readonly censor = {
    get: (): boolean => this.secrecy.censored,
    set: (v: boolean): void => this.secrecy.setCensored(v),
    params: (p: Parameters<CardSecrecy["setDustParams"]>[0]): void => this.secrecy.setDustParams(p),
  };

  step(it: TableItem, dt: number): void {
    this.secrecy.veil.step(dt, this.secrecy.dustActive, it.idleFrozen);
    if (this.flipAnim) {
      this.flipAnim.t += dt;
      if (this.flipAnim.t >= this.flipAnim.dur) {
        this.faceUp = !this.flipAnim.fromFaceUp;
        this.flipAnim = null;
        this.secrecy.veil.setPoints(this.secrecy.dustSeeds()); // сторона сменилась — пыль едет за ней
        this.paint();
      }
    }
  }

  settled(it: TableItem): boolean {
    return !this.flipAnim && this.secrecy.veil.settled(this.secrecy.dustActive, it.idleFrozen);
  }

  render(it: TableItem): void {
    syncCard(it, this);
  }

  /** Авто-теги по значению — живые: после setValue (раскрытия) масть/ранг обновляются сами. */
  autoTags(): ReadonlySet<string> {
    const custom = this.secrecy.look.custom;
    return custom ? new Set(["card", `custom:${custom}`]) : cardTags(this.secrecy.card);
  }

  localBox(): { w: number; h: number } {
    return { w: TEX_W * this.size, h: TEX_H * this.size };
  }

  footprint(): { hw: number; hh: number } {
    return { hw: (TEX_W * this.scaleFactor) / 2, hh: (TEX_H * this.scaleFactor) / 2 };
  }

  glowUnit(it: TableItem): number {
    return this.baseScale * it.body.scaleVal; // контент-px на локальную единицу текстуры
  }

  glowFallback(): GlowShape {
    return { x: -TEX_W / 2, y: -TEX_H / 2, w: TEX_W, h: TEX_H, radius: 16 };
  }
}

/** Собрать карту: вид «card» на общем шасси. Игровые теги/поза/z — как у любого предмета. */
export function makeCard(opts: CardOptions, tex: CardTextureCache, baseScale: number): TableItem {
  const visual = new CardVisual(opts, tex, baseScale);
  return new TableItem({
    id: opts.id ?? "",
    kind: "card",
    caps: CARD_CAPS,
    visual,
    draggable: opts.draggable ?? true,
    pose: opts.pose,
    idle: opts.idle,
    z: opts.z,
    tags: opts.tags,
    selected: opts.selected,
  });
}
