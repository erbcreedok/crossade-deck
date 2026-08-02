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
import { buildFingerDustPoints, buildTextureDustPoints } from "../engine/censorSource";
import type { DustPoint } from "../censorConfig";

/** Шаг сетки сэмплирования лица и базовая плотность облака. Отдельно от DANCE_DEFAULT.block: тот —
 *  рычаг ВИДА частицы, выбранный владельцем на стенде, а это — разрешение смаза. Связывать их одним
 *  числом значило бы, что попытка укрупнить точку тайком огрубляет и рисунок. */
const DUST_GRID = 4;
const DUST_PER_CELL = 1;
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
  private faceDust = new Map<string, DustPoint[]>();

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

  /** Облако точек по силуэту фака — запасной путь (стенд /motion, стол). Кэш на комнату. */
  dustPoints(): Array<{ x: number; y: number }> {
    if (!this.dustPts) this.dustPts = buildFingerDustPoints(this.app, 4, 0, 0);
    return this.dustPts;
  }

  /**
   * Облако точек по КОНКРЕТНОМУ лицу: пыль должна быть смазом того, что под ней, а не универсальной
   * жёлтой крошкой. Ключ — тот же, по которому лицо лежит в кэше текстур, поэтому одинаковые карты
   * делят одно облако и пересчёт на каждую карту не нужен.
   *
   * Шаг сетки берём из DANCE_DEFAULT.block, а не из своей константы: «частица» — уже существующий
   * рычаг цензуры, и второй источник правды тут разъехался бы с ним при первой правке.
   */
  faceDustPoints(key: string, tex: Texture): DustPoint[] {
    let pts = this.faceDust.get(key);
    if (!pts) {
      pts = buildTextureDustPoints(this.app.renderer, tex, { step: DUST_GRID, perCell: DUST_PER_CELL });
      this.faceDust.set(key, pts);
    }
    return pts;
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
    this.faceDust.clear();
  }
}
