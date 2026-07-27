import type { Application, Texture } from "pixi.js";
import {
  CUSTOM_FACES,
  makeCardBackTexture,
  makeCardFaceTexture,
  makeHiddenBgTexture,
  makeHiddenFaceTexture,
  makeShadowTexture,
  type FaceStyle,
} from "../engine/cardTextures";
import { buildFingerDustPoints } from "../engine/censorSource";
import type { CardBackId } from "../cardBack";

// Кэш текстур карт по параметрам: одна запечённая текстура на уникальную комбинацию
// (карта×палитра×вид лица), на рубашку и одна общая тень. Карты берут отсюда, не пекут сами.
export class CardTextureCache {
  private faces = new Map<string, Texture>();
  private backs = new Map<CardBackId, Texture>();
  private shadowTex: Texture | null = null;
  private hiddenTex: Texture | null = null;
  private hiddenBgTex: Texture | null = null;
  private customTex = new Map<string, Texture>();
  private dustPts: Array<{ x: number; y: number }> | null = null;

  constructor(private readonly app: Application) {}

  shadow(): Texture {
    if (!this.shadowTex) this.shadowTex = makeShadowTexture(this.app);
    return this.shadowTex;
  }

  /** Статичное лицо скрытой карты (🖕 вместо номинала) — запасной вид под «пылью». */
  hiddenFace(): Texture {
    if (!this.hiddenTex) this.hiddenTex = makeHiddenFaceTexture(this.app);
    return this.hiddenTex;
  }

  /** Чистый фон скрытой карты (без фака) — база под живую «пыль». */
  hiddenBg(): Texture {
    if (!this.hiddenBgTex) this.hiddenBgTex = makeHiddenBgTexture(this.app);
    return this.hiddenBgTex;
  }

  /** Облако точек рождения «пыли» по силуэту фака, центрированное в центре карты (0,0). Кэш на комнату. */
  dustPoints(): Array<{ x: number; y: number }> {
    if (!this.dustPts) this.dustPts = buildFingerDustPoints(this.app, 4, 0, 0);
    return this.dustPts;
  }

  /** Кастом-лицо по id из реестра CUSTOM_FACES (напр. «joker»). null — id неизвестен (Card покажет число). */
  customFace(id: string): Texture | null {
    let t = this.customTex.get(id);
    if (!t) {
      const make = CUSTOM_FACES[id];
      if (!make) return null;
      t = make(this.app);
      this.customTex.set(id, t);
    }
    return t;
  }

  face(card: string, fourColor: boolean, style: FaceStyle): Texture {
    const key = `${card}|${fourColor ? 1 : 0}|${style}`;
    let t = this.faces.get(key);
    if (!t) {
      t = makeCardFaceTexture(this.app, card, fourColor, style);
      this.faces.set(key, t);
    }
    return t;
  }

  back(id: CardBackId): Texture {
    let t = this.backs.get(id);
    if (!t) {
      t = makeCardBackTexture(this.app, id);
      this.backs.set(id, t);
    }
    return t;
  }

  destroy(): void {
    this.faces.forEach((t) => t.destroy(true));
    this.backs.forEach((t) => t.destroy(true));
    this.shadowTex?.destroy(true);
    this.hiddenTex?.destroy(true);
    this.hiddenBgTex?.destroy(true);
    this.customTex.forEach((t) => t.destroy(true));
    this.faces.clear();
    this.backs.clear();
    this.customTex.clear();
    this.shadowTex = null;
    this.hiddenTex = null;
    this.hiddenBgTex = null;
    this.dustPts = null;
  }
}
