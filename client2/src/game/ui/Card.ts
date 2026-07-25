import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { CardBody } from "../CardBody";
import { spinAngle, spinScale, spinShowsOther } from "../flip";
import { easeOutQuad } from "../anim/easing";
import { TEX_H, TEX_W } from "../engine/constants";
import type { FaceStyle } from "../engine/cardTextures";
import type { CardBackId } from "../cardBack";
import type { CardTextureCache } from "./CardTextureCache";

// Карта UI-kit — одна карта как объект с пропсами. Масштабируемая (size — множитель эталона)
// и расширяемая: новый вариант = новый пропс + ветка отрисовки, ничего снаружи не ломается.
//
// Устройство: root (Container) движётся движком по пружинному телу (body); внутри root —
// базовый спрайт (лицо/рубашка из кэша) и накладки вариантов (разрыв, замок) в КООРДИНАТАХ
// ТЕКСТУРЫ, поэтому масштабируются вместе с картой. Размер и переворот — через scale root.

export interface CardOptions {
  card?: string; // идентичность для лица, по умолчанию "A♠"
  faceUp?: boolean; // открыта (лицом) / закрыта (рубашкой)
  flippable?: boolean; // доступен ли переворот
  back?: CardBackId; // кастомная рубашка
  faceStyle?: FaceStyle; // вид лица: "pips" | "symbol"
  fourColor?: boolean; // кастомное лицо: четырёхцветная колода
  torn?: boolean; // порванная карта
  size?: number; // множитель эталонного размера (1 = эталон)
}

interface FlipAnim {
  t: number;
  dur: number;
  fromFaceUp: boolean;
}

export class Card {
  readonly root = new Container();
  readonly body = new CardBody();

  readonly card: string;
  faceUp: boolean;
  readonly flippable: boolean;
  readonly back: CardBackId;
  readonly faceStyle: FaceStyle;
  readonly fourColor: boolean;
  readonly torn: boolean;
  readonly size: number;

  private readonly base = new Sprite();
  private flip: FlipAnim | null = null;

  constructor(
    opts: CardOptions,
    private readonly tex: CardTextureCache,
    private readonly baseScale: number,
  ) {
    this.card = opts.card ?? "A♠";
    this.faceUp = opts.faceUp ?? true;
    this.flippable = opts.flippable ?? true;
    this.back = opts.back ?? "ruby";
    this.faceStyle = opts.faceStyle ?? "pips";
    this.fourColor = opts.fourColor ?? false;
    this.torn = opts.torn ?? false;
    this.size = opts.size ?? 1;

    this.base.anchor.set(0.5);
    this.root.addChild(this.base);
    if (this.torn) this.root.addChild(this.buildTear());
    if (!this.flippable) this.root.addChild(this.buildLock());
    this.paint();
  }

  /** Итоговый масштаб карты (эталон × size). Хит-тест/раскладку движок считает по нему. */
  get scaleFactor(): number {
    return this.baseScale * this.size;
  }

  get width(): number {
    return TEX_W * this.scaleFactor;
  }

  get height(): number {
    return TEX_H * this.scaleFactor;
  }

  /** Запустить переворот (если доступен и не идёт уже). Вернёт, удалось ли. */
  requestFlip(): boolean {
    if (!this.flippable || this.flip) return false;
    this.flip = { t: 0, dur: 0.45, fromFaceUp: this.faceUp };
    return true;
  }

  step(dt: number): void {
    this.body.step(dt);
    if (this.flip) {
      this.flip.t += dt;
      if (this.flip.t >= this.flip.dur) {
        this.faceUp = !this.flip.fromFaceUp;
        this.flip = null;
        this.paint();
      }
    }
  }

  get resting(): boolean {
    return this.body.isResting() && !this.flip;
  }

  /** Применить тело к сцене: позиция/поворот/масштаб (+ схлопывание ширины в перевороте). */
  sync(): void {
    const eff = this.body.scaleVal * this.scaleFactor;
    this.root.position.set(this.body.px, this.body.py);
    this.root.rotation = this.body.rotation;
    if (this.flip) {
      const angle = spinAngle(easeOutQuad(Math.min(1, this.flip.t / this.flip.dur)), 1);
      this.root.scale.set(eff * spinScale(angle), eff);
      const showOther = spinShowsOther(angle);
      this.base.texture = this.faceTex(showOther ? !this.flip.fromFaceUp : this.flip.fromFaceUp);
    } else {
      this.root.scale.set(eff, eff);
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }

  // ——— отрисовка ———

  private faceTex(faceUp: boolean): Texture {
    return faceUp ? this.tex.face(this.card, this.fourColor, this.faceStyle) : this.tex.back(this.back);
  }

  private paint(): void {
    this.base.texture = this.faceTex(this.faceUp);
  }

  /** Разрыв: рваная бумага по вертикали — светлый зигзаг с тёмной трещиной поверх. */
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
    g.stroke({ width: 10, color: 0xefe6d0 }); // рваный край бумаги
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
    g.stroke({ width: 3, color: 0x3a2f1f }); // тень трещины
    return g;
  }

  /** Замок «переворот недоступен» — маленький в правом верхнем углу (координаты текстуры). */
  private buildLock(): Graphics {
    const g = new Graphics();
    const x = TEX_W / 2 - 30;
    const y = -TEX_H / 2 + 36;
    g.arc(x, y - 6, 9, Math.PI, 0).stroke({ width: 4, color: 0x1e1e1e }); // дужка
    g.roundRect(x - 14, y - 6, 28, 22, 4).fill({ color: 0x1e1e1e }); // корпус
    g.circle(x, y + 3, 3).fill({ color: 0xd0c090 }); // скважина
    return g;
  }
}
