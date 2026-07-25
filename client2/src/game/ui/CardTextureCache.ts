import type { Application, Texture } from "pixi.js";
import {
  makeCardBackTexture,
  makeCardFaceTexture,
  makeHiddenFaceTexture,
  makeJokerFaceTexture,
  makeShadowTexture,
  type FaceStyle,
} from "../engine/cardTextures";
import type { CardBackId } from "../cardBack";

// Кэш текстур карт по параметрам: одна запечённая текстура на уникальную комбинацию
// (карта×палитра×вид лица), на рубашку и одна общая тень. Карты берут отсюда, не пекут сами.
export class CardTextureCache {
  private faces = new Map<string, Texture>();
  private backs = new Map<CardBackId, Texture>();
  private shadowTex: Texture | null = null;
  private hiddenTex: Texture | null = null;
  private jokerTex: Texture | null = null;

  constructor(private readonly app: Application) {}

  shadow(): Texture {
    if (!this.shadowTex) this.shadowTex = makeShadowTexture(this.app);
    return this.shadowTex;
  }

  /** Лицо скрытой карты (🖕 вместо номинала). */
  hiddenFace(): Texture {
    if (!this.hiddenTex) this.hiddenTex = makeHiddenFaceTexture(this.app);
    return this.hiddenTex;
  }

  /** Кастомное лицо джокера. */
  jokerFace(): Texture {
    if (!this.jokerTex) this.jokerTex = makeJokerFaceTexture(this.app);
    return this.jokerTex;
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
    this.jokerTex?.destroy(true);
    this.faces.clear();
    this.backs.clear();
    this.shadowTex = null;
    this.hiddenTex = null;
    this.jokerTex = null;
  }
}
