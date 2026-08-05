import type { Container, Sprite } from "pixi.js";
import type { ParticleParams } from "../engine/censorParticles";
import type { CardBackId } from "../cardBack";
import type { FaceStyle } from "../engine/cardTextures";
import type { CardTextureCache } from "./CardTextureCache";
import { normalizeCard } from "../card";
import { CardVeil, type DustSeeds } from "./cardVeil";
import { faceKeyOf, faceTexOf, plainFaceTexOf, type FaceLook } from "./cardFace";

// СЕКРЕТНОСТЬ КАРТЫ — способность-коллаборатор: значение (придержано сервером = ""), скрытость,
// цензура и «подглядеть». Владеет вуалью (CardVeil): пыль и кросс-фейд лица — это ЕЁ следствия.
// Карте остаётся физика/флип/тень; хост-лямбды — ровно то, что секретности нужно от карты.
//
// СКРЫТОСТЬ и ЦЕНЗУРА — два разных явления, и их нельзя путать:
//
//   masked  — показывать МАСКУ ВМЕСТО лица. Значения у клиента либо нет вовсе (сервер придержал),
//             либо оно объявлено секретным. Под пылью — чистый фон: показывать нечего.
//   censored — лицо рисуется НАСТОЯЩЕЕ, а пыль ложится ПОВЕРХ него фильтром. Значение у клиента
//             есть, но смотреть на него сейчас нельзя. Работает на ЛЮБОМ лице.
//
// masked меняет ТЕКСТУРУ, censored — только слой пыли над ней.

export interface SecrecyStyle {
  back: CardBackId;
  faceStyle: FaceStyle;
  fourColor: boolean;
  custom: string; // id кастом-лица; "" — обычная числовая карта
}

export interface SecrecyHost {
  faceUp(): boolean;
  /** Идёт ли флип / горит ли карта — пыль на это время гаснет. */
  busy(): boolean;
  /** Перевернуть карту (peek raise/undo); отказ (флип занят) — забота хоста. */
  requestFlip(): void;
  /** Парение показанной карты — чтобы «подглянутая» не читалась зависшей. */
  setPeekBob(v: boolean): void;
  /** Перерисовать лицо (baseSprite ← faceTex). */
  repaint(): void;
}

export class CardSecrecy {
  readonly veil: CardVeil;
  private _card: string;
  private _concealed: boolean;
  private _censored: boolean;

  constructor(
    root: Container,
    private readonly tex: CardTextureCache,
    private readonly style: SecrecyStyle,
    private readonly host: SecrecyHost,
    init: { card: string; hidden: boolean; censored: boolean },
  ) {
    this.veil = new CardVeil(root);
    this._card = normalizeCard(init.card);
    this._concealed = init.hidden;
    this._censored = init.censored;
  }

  /** Построить пыль на спавне (если нужна) и выставить альфу без fade — сразу в целевом состоянии. */
  prime(): void {
    if (this.dusty) this.veil.build(this.dustSeeds());
    this.veil.alpha = this.dustActive ? 1 : 0;
  }

  /** Значение карты (ранг+масть); "" — придержано. Ключ — это id, не значение. */
  get card(): string {
    return this._card;
  }

  /** Есть ли у клиента значение (иначе оно придержано сервером). */
  get hasValue(): boolean {
    return this._card !== "";
  }

  get concealed(): boolean {
    return this._concealed;
  }

  get censored(): boolean {
    return this._censored;
  }

  get masked(): boolean {
    return this._concealed || !this.hasValue;
  }

  /** Нужна ли карте пыль вообще (маска ИЛИ фильтр) — по этому признаку она лениво строится. */
  private get dusty(): boolean {
    return this.masked || this._censored;
  }

  /** Описание лица для cardFace: ровно те поля, от которых зависит текстура. */
  get look(): FaceLook {
    return { tex: this.tex, card: this._card, masked: this.masked, ...this.style };
  }

  /** Точки рождения пыли для ТЕКУЩЕГО лица. Кэш общий на комнату и ключуется тем же ключом, что и
   *  сама текстура, — одинаковые карты делят одно облако. */
  dustSeeds(): DustSeeds {
    return this.tex.faceDustPoints(faceKeyOf(this.look, this.host.faceUp()), plainFaceTexOf(this.look, this.host.faceUp()));
  }

  /** Что печатать в спрайт для стороны `faceUp` (флип показывает обе по очереди). */
  faceTex(faceUp: boolean): import("pixi.js").Texture {
    return faceTexOf(this.look, faceUp, this.dustShown);
  }

  /** Показываем ли пыль вообще. «Лицом вверх» принципиально: рубашка ничего не прячет — она и так
   *  публична, — поэтому цензурить её нечего и незачем. */
  get dustShown(): boolean {
    return this.veil.built && this.dusty && this.host.faceUp();
  }

  /** Видна ли сейчас пыль (вне переворота/горения) — тогда её крутим, цикл не спит. */
  get dustActive(): boolean {
    return this.dustShown && !this.host.busy();
  }

  /** Переключить скрытость в рантайме: перерисовать лицо (при надобности — лениво построить пыль). */
  setConcealed(v: boolean): void {
    if (v === this._concealed) return;
    this._concealed = v;
    this.reface();
  }

  /** Переключить ЦЕНЗУРУ. Лицо не меняется — меняется слой пыли; смену подложки ведём тем же
   *  путём, что скрытость (под пылью печатается чистый фон, нужен кросс-фейд). */
  setCensored(v: boolean): void {
    if (v === this._censored) return;
    this._censored = v;
    this.reface();
  }

  /** Проставить/придержать значение (раскрытие сервером): "" прячет, непустое — показывает лицо. */
  setValue(v: string): void {
    const n = normalizeCard(v);
    if (n === this._card) return;
    this._card = n;
    this.reface();
  }

  /** Рычаги живой пыли — для стенда и каталога: иначе параметры задаются только при рождении. */
  setDustParams(p: Partial<ParticleParams>): void {
    this.veil.setParams(p);
  }

  /** Лениво построить пыль, если карта теперь маскируется, и перерисовать лицо с кросс-фейдом
   *  (CardVeil): смена подложки под ещё прозрачной пылью иначе читалась рывком. Кросс-фейд заводит
   *  ХОСТ (он знает старую текстуру) — здесь только пересев пыли. */
  private reface(): void {
    if (this.dusty && !this.veil.built) this.veil.build(this.dustSeeds());
    else this.veil.setPoints(this.dustSeeds()); // лицо сменилось — пыль обязана поехать за ним
    this.host.repaint();
  }

  /** Есть ли что подглядеть: карта скрыта, зацензурена ИЛИ лежит рубашкой. ЧИСТЫЙ предикат (без
   *  мутаций) — зона ПОДГЛЯДЕТЬ читает его для armed-текста («давай подсмотрим?» vs «зачем?»). */
  get canPeek(): boolean {
    return this._concealed || this._censored || !this.host.faceUp();
  }

  /**
   * «Подглядеть»: раскрыть карту (снять скрытость, перевернуть лицом вверх если лежала рубашкой) и
   * ВЕРНУТЬ функцию-undo, восстанавливающую прежний вид. reveal и restore живут одной парой — движок
   * лишь держит undo и зовёт его по таймеру / концу драга, так что «перевернул, но забыл перевернуть
   * назад» взяться неоткуда. peekBob ставится и снимается тем же undo.
   * Край: перехватить и повторно бросить карту ЗА <0.45с (reveal-флип ещё крутится) — встречный
   * requestFlip в undo откажет (флип занят), рубашка не вернётся; PEEK_DUR=3 делает обычные пути
   * безопасными, отдельный механизм на этот дабл-тап пока не заводим.
   */
  peekReveal(): (() => void) | null {
    if (!this.canPeek) return null;
    const wasFaceUp = this.host.faceUp();
    const wasConcealed = this._concealed;
    const wasCensored = this._censored;
    if (!wasFaceUp) this.host.requestFlip();
    this.setConcealed(false);
    this.setCensored(false); // фильтр снимаем тоже: иначе «подглядел» показывало бы пыль вместо лица
    this.host.setPeekBob(true);
    return () => {
      if (!wasFaceUp) this.host.requestFlip();
      this.setConcealed(wasConcealed);
      this.setCensored(wasCensored);
      this.host.setPeekBob(false);
    };
  }
}

/** Спрайт-хелпер: сменилась ли текстура после repaint — тогда хост заводит кросс-фейд. */
export function repaintWithFade(veil: CardVeil, sprite: Sprite, tex: import("pixi.js").Texture): void {
  const old = sprite.texture;
  sprite.texture = tex;
  if (sprite.texture !== old) veil.crossfade(old, sprite);
}
