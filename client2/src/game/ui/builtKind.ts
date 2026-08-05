import type { Container } from "pixi.js";
import { Graphics } from "pixi.js";
import { ParticleField, type ParticleParams } from "../engine/censorParticles";
import { DANCE_DEFAULT, DUST_FLICKER, dustParams } from "../censorConfig";
import { shadowOf, withEffect } from "./shadow";
import { applyEffect } from "../anim/effectApply";
import { scaleFromZ } from "./elevation";
import { TEX_H, TEX_W } from "../engine/constants";
import { placeItem } from "./itemFrame";
import { TableItem, type ItemCap, type ItemVisual } from "./tableItem";
import type { OwnShadow } from "./silhouetteExtract";
import type { GlowShape } from "./selection";
import type { Pose } from "./cardTypes";

// ВИД «РИСОВАННЫЙ ПРЕДМЕТ» — фишка, шахматная фигура, что угодно с build(root): вторая запись
// реестра видов на том же TableItem, что и карта. Не Flippable — значит зона «перевернуть» его
// проигнорирует (движок спрашивает caps, не тип), а «сжечь» — сработает. Своё здесь: одноразовый
// рисунок, тень габаритом или СОБСТВЕННЫМ снимком силуэта, цензура-пыль по переданным точкам.

export interface BuiltOptions {
  id: string;
  w: number; // футпринт ПОКОЯ для хит-теста (полуразмеры × scaleVal)
  h: number;
  build: (root: Container) => void; // нарисовать визуал в ЛОКАЛЬНЫХ координатах (центр 0,0)
  shadow: { rx: number; ry: number; dy: number }; // габарит тени: полуоси + сдвиг вниз
  /** СОБСТВЕННАЯ тень — снимок этого же визуала (ui/silhouetteExtract.ts): форма один в один.
   *  Нет снимка — габарит; лежащей фишке эллипс и есть её форма, снимать там нечего. */
  own?: OwnShadow | null;
  /** Точки рождения пыли-цензуры, снятые с ЭТОГО визуала (censorSource): цензура — не карточная
   *  фича, она размазывает настоящее лицо предмета, каким бы он ни был. */
  censorSeeds?: ReadonlyArray<{ x: number; y: number; color: number }> | null;
  censored?: boolean;
  pose?: Pose;
  idle?: boolean;
  tags?: string[]; // идентичность-ДАННЫЕ: chip, color:green, piece:♞ … (SELECTION-DESIGN §2)
}

const BUILT_CAPS: ReadonlySet<ItemCap> = new Set(["censor"] as const);

export class BuiltVisual implements ItemVisual {
  private dust: ParticleField | null = null;
  private dustT = 0;
  private _censored: boolean;
  private mask: { g: Graphics | null } = { g: null };
  private it!: TableItem;

  constructor(private readonly opts: BuiltOptions) {
    this._censored = opts.censored ?? false;
  }

  mount(it: TableItem): void {
    this.it = it;
    this.opts.build(it.root);
    if (this._censored) this.buildDust();
  }

  private buildDust(): void {
    const seeds = this.opts.censorSeeds;
    if (!seeds || seeds.length === 0) return;
    this.dust = new ParticleField(seeds, dustParams(DANCE_DEFAULT, DUST_FLICKER));
    this.it.root.addChild(this.dust.view);
  }

  /** Цензура-фильтр: пыль ПОВЕРХ настоящего лица — смазывает, а не заменяет (как у карты). */
  readonly censor = {
    get: (): boolean => this._censored,
    set: (v: boolean): void => {
      if (v === this._censored) return;
      this._censored = v;
      if (v && !this.dust) this.buildDust();
      if (this.dust) this.dust.view.visible = v;
    },
    params: (p: Partial<ParticleParams>): void => this.dust?.setParams(p),
  };

  /** Крутится ли пыль прямо сейчас. Заморозка движения её останавливает — как и дыхание. */
  private dusty(it: TableItem): boolean {
    return this.dust !== null && this._censored && !it.idleFrozen;
  }

  step(it: TableItem, dt: number): void {
    if (this.dusty(it)) {
      this.dustT += dt;
      this.dust!.update(this.dustT);
    }
  }

  settled(it: TableItem): boolean {
    return !this.dusty(it);
  }

  autoTags(): ReadonlySet<string> {
    return new Set(); // теги рисованного предмета — целиком данные сборки (init.tags)
  }

  localBox(): { w: number; h: number } {
    return { w: this.opts.w, h: this.opts.h };
  }

  footprint(): { hw: number; hh: number } {
    return { hw: this.opts.w / 2, hh: this.opts.h / 2 };
  }

  glowUnit(it: TableItem): number {
    return it.body.scaleVal || 1;
  }

  /** Своя форма: БЕЛЫЙ силуэт-снимок (конь светится конём) или круг-футпринт. */
  glowFallback(): GlowShape {
    const sil = this.glowSilhouette();
    return sil
      ? { kind: "silhouette", x: sil.bounds.x, y: sil.bounds.y, w: sil.bounds.width, h: sil.bounds.height, texture: sil.texture }
      : { x: -this.opts.w / 2, y: -this.opts.h / 2, w: this.opts.w, h: this.opts.h, radius: Math.min(this.opts.w, this.opts.h) / 2 };
  }

  glowSilhouette(): { texture: import("pixi.js").Texture; bounds: OwnShadow["bounds"] } | null {
    const own = this.opts.own;
    return own?.white ? { texture: own.white, bounds: own.bounds } : null;
  }

  render(it: TableItem): void {
    const { w, h } = this.opts;
    const f = placeItem(it, h, w, 0.06);
    const drawn = it.body.scaleVal * scaleFromZ(it.zBase); // тот же множитель, что уходит в root.scale
    it.root.scale.set(drawn);

    // Эффект (ElementLife) — ДО тени: она выводится из итогового состояния, а не правится под
    // каждый способ. Маски стилей нарисованы в координатах карточной текстуры — вписываем их в
    // коробку предмета.
    const fx = it.life.effectFrame(w, it.flashOff);
    const unit = { x: w / TEX_W, y: h / TEX_H };
    if (fx) applyEffect(it.root, it.body.px, it.body.py, fx, this.mask, unit);

    const own = this.opts.own ?? null;
    const cfg = this.opts.shadow;
    it.shadowRect = shadowOf(
      withEffect(
        {
          px: it.body.px,
          py: it.body.py,
          shakeX: f.shakeX,
          z: f.z,
          screenY: f.bob,
          rotation: it.body.rotation,
          // Силуэт — от НАРИСОВАННОГО размера, как у карты: поднятая фишка крупнее лежащей, и
          // тень у неё крупнее во столько же.
          hw: cfg.rx * drawn,
          hh: cfg.ry * drawn,
          // Снимку сдвиг не нужен: он ложится ровно туда, где нарисован предмет. Габаритной тени —
          // нужен: пятно рисуется от центра, а стоит предмет на низу.
          baseDy: own ? 0 : cfg.dy * drawn,
          reach: w * drawn,
          round: !own,
          // Маска эффекта режет тень в тех же единицах, в каких режет предмет.
          polyK: drawn * unit.x,
          polyKy: drawn * unit.y,
          image: own ? { texture: own.texture, bx: own.bounds.x, by: own.bounds.y, bw: own.bounds.width, bh: own.bounds.height, k: drawn } : null,
        },
        fx,
      ),
      it.life.preset.shadow,
    );
  }
}

/** Собрать рисованный предмет: вид kind (chip/chess/…) на общем шасси. */
export function makeBuilt(kind: string, opts: BuiltOptions): TableItem {
  return new TableItem({
    id: opts.id,
    kind,
    caps: BUILT_CAPS,
    visual: new BuiltVisual(opts),
    pose: opts.pose,
    idle: opts.idle,
    tags: opts.tags,
  });
}
