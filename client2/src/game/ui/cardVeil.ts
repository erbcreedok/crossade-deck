import { Graphics, Sprite, type Container, type Texture } from "pixi.js";
import { ParticleField, type ParticleParams } from "../engine/censorParticles";
import { DANCE_DEFAULT, DUST_FLICKER, dustParams } from "../censorConfig";
import { TEX_H, TEX_W } from "../engine/constants";

// ВУАЛЬ КАРТЫ — способность-коллаборатор: живая «пыль»-цензура (облако частиц, построенное по
// НАСТОЯЩЕМУ лицу — цвет у каждой частицы свой) и кросс-фейд лица при смене маскировки. Карта
// решает, КОГДА пыль нужна и по какому лицу её сеять (masked/censored/faceUp — её предикаты),
// вуаль — КАК это выглядит: маска по пластине, плавная альфа, старая текстура поверх новой.

export const DUST_FADE_DUR = 0.4; // fade вкл/выкл пыли — как у block (Card.blockNudge)

export type DustSeeds = ReadonlyArray<{ x: number; y: number; color: number }>;

export class CardVeil {
  private dust: ParticleField | null = null;
  private dustT = 0; // локальное время пыли (крутит только пока она видна)
  alpha = 0; // сглаженная альфа пыли — плавный fade вместо мгновенного visible-тумблера
  private fadeSprite: Sprite | null = null; // старая текстура лица, кросс-фейдится поверх новой
  private fadeT = 0;

  constructor(private readonly root: Container) {}

  get built(): boolean {
    return this.dust !== null;
  }

  /** Лениво построить облако. Маска повторяет ПЛАСТИНУ карты, а не габарит: лицо нарисовано с
   *  отступом 2 px от края (roundRect(2,2,…) в cardTextures), и без отступа пыль садилась в
   *  двухпиксельное кольцо ЗА пластиной — по краю карты шла заметная бахрома. */
  build(seeds: DustSeeds): void {
    this.dust = new ParticleField(seeds, dustParams(DANCE_DEFAULT, DUST_FLICKER));
    const mask = new Graphics();
    mask.roundRect(-TEX_W / 2 + 2, -TEX_H / 2 + 2, TEX_W - 4, TEX_H - 4, 16).fill({ color: 0xffffff });
    this.dust.view.mask = mask;
    this.root.addChild(this.dust.view, mask);
  }

  /** Лицо сменилось — пыль обязана поехать за ним. */
  setPoints(seeds: DustSeeds): void {
    this.dust?.setPoints(seeds);
  }

  /** Рычаги живой пыли (размер частицы, разлёт, жизнь, мерцание) — для стенда и каталога. */
  setParams(p: Partial<ParticleParams>): void {
    this.dust?.setParams(p);
  }

  /** Кросс-фейд смены лица: старую текстуру держим поверх новой тем же DUST_FADE_DUR — иначе
   *  текстура ПОД плавно наплывающей пылью щёлкала мгновенно и читалась рывком. */
  crossfade(oldTex: Texture, above: Sprite): void {
    this.fadeSprite?.destroy();
    this.fadeSprite = new Sprite(oldTex);
    this.fadeSprite.anchor.set(0.5);
    this.root.addChildAt(this.fadeSprite, this.root.getChildIndex(above) + 1);
    this.fadeT = 0;
  }

  /** Снести кросс-фейд: флип сам сменит текстуру спином — фейд лица там не к месту. */
  dropFade(): void {
    this.fadeSprite?.destroy();
    this.fadeSprite = null;
  }

  /** `active` — пыль сейчас показывается (карта решает), `frozen` — reduce-motion/лёгкий профиль. */
  step(dt: number, active: boolean, frozen: boolean): void {
    const target = active ? 1 : 0;
    if (this.alpha !== target) {
      const step = dt / DUST_FADE_DUR;
      this.alpha += Math.sign(target - this.alpha) * Math.min(Math.abs(target - this.alpha), step);
    }
    if ((active || this.alpha > 0) && !frozen) {
      this.dustT += dt;
      this.dust!.update(this.dustT);
    }
    if (this.fadeSprite) {
      this.fadeT += dt;
      if (this.fadeT >= DUST_FADE_DUR) this.dropFade();
      else this.fadeSprite.alpha = 1 - this.fadeT / DUST_FADE_DUR;
    }
  }

  sync(): void {
    if (this.dust) {
      this.dust.view.visible = this.alpha > 0.001;
      this.dust.view.alpha = this.alpha;
    }
  }

  /** Успокоилась ли вуаль (иначе цикл не спит: живая пыль и доезжающий fade «шевелятся»). */
  settled(active: boolean, frozen: boolean): boolean {
    return (frozen || (!active && this.alpha === 0)) && !this.fadeSprite;
  }
}
