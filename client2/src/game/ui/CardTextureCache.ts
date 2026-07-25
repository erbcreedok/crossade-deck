import type { Application, Texture } from "pixi.js";
import { makeCardBackTexture, makeCardFaceTexture, type FaceStyle } from "../engine/cardTextures";
import type { CardBackId } from "../cardBack";

// Кэш текстур карт по параметрам: одна запечённая текстура на уникальную комбинацию
// (карта×палитра×вид лица) и на рубашку. Карты берут текстуры отсюда — не пекут сами.
export class CardTextureCache {
  private faces = new Map<string, Texture>();
  private backs = new Map<CardBackId, Texture>();

  constructor(private readonly app: Application) {}

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
    this.faces.clear();
    this.backs.clear();
  }
}
