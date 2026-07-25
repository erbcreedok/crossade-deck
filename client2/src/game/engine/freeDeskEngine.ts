import { Application, Container, Graphics, Rectangle, Sprite, Text, type Texture } from "pixi.js";
import { CardBody } from "../CardBody";
import { spinAngle, spinScale, spinShowsOther } from "../flip";
import { easeOutQuad } from "../anim/easing";
import { makeCardBackTexture, makeCardFaceTexture } from "./cardTextures";
import { DRAG_SCALE, PIXEL_FONT, TEX_H, TEX_W } from "./constants";

// UI-kit «/free-desk» — сторибук НА КАНВАСЕ. Вертикально скроллится (тащишь пустоту — едет
// лист), при этом drag-and-drop карт работает (тащишь карту — берёшь её). Каждый «стори» —
// интерактивный кусок будущего UI.
//
// Стори 1: одна карта + дропзона рядом. Бросил карту в зону — она ПЕРЕВОРАЧИВАЕТСЯ и
// пружиной возвращается на исходное место (мимо зоны — просто возвращается, без переворота).

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FlipAnim {
  t: number;
  dur: number;
  fromFaceUp: boolean;
}

export class FreeDeskEngine {
  private app: Application | null = null;
  private destroyed = false;
  private content!: Container; // скроллится по вертикали
  private cardLayer!: Container;
  private zoneG!: Graphics;

  private backTex!: Texture;
  private faceTex!: Texture;

  private W = 1;
  private H = 1;
  private cardW = 1;
  private cardH = 1;
  private baseScale = 1;
  private contentH = 1;
  private scrollY = 0;

  // Стори 1
  private card!: CardBody;
  private sprite!: Sprite;
  private home = { x: 0, y: 0 };
  private zone: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private faceUp = true;
  private flip: FlipAnim | null = null;

  private drag: { dx: number; dy: number } | null = null;
  private scroll: { startPointerY: number; startScroll: number } | null = null;

  async mount(container: HTMLElement, width: number, height: number): Promise<void> {
    if (this.destroyed) return;
    this.W = Math.max(1, Math.round(width));
    this.H = Math.max(1, Math.round(height));
    // Эталонный размер карты — ровно как в игре (layout.ts): высота = min(w,h)*0.16 с полом
    // 48 и потолком 140; ширина по соотношению текстуры. Карта в покое в вееере — этот размер.
    this.cardH = Math.max(48, Math.min(140, Math.min(this.W, this.H) * 0.16));
    this.baseScale = this.cardH / TEX_H;
    this.cardW = TEX_W * this.baseScale;
    this.contentH = Math.max(this.H * 1.6, this.H + 200); // выше экрана — есть куда скроллить

    const app = new Application();
    try {
      await app.init({
        width: this.W,
        height: this.H,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        autoStart: false,
        preference: "webgl",
      });
    } catch {
      return;
    }
    if (this.destroyed) {
      app.destroy({ removeView: true }, { children: true, texture: true });
      return;
    }
    container.appendChild(app.canvas);
    this.app = app;
    this.backTex = makeCardBackTexture(app, "ruby");
    this.faceTex = makeCardFaceTexture(app, "A♠", false, "pips");

    this.content = new Container();
    app.stage.addChild(this.content);

    this.buildStory1();

    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, this.W, this.H);
    app.stage.on("pointerdown", this.onDown);
    app.stage.on("pointermove", this.onMove);
    app.stage.on("pointerup", this.onUp);
    app.stage.on("pointerupoutside", this.onUp);

    app.ticker.add(this.tick);
    this.render();
    this.wake(); // без этого тикер (autoStart:false) не стартует и Pixi не рисует первый кадр
  }

  private buildStory1(): void {
    const title = new Text({
      text: "01 — Карта + дропзона (дроп → переворот и возврат)",
      style: { fontFamily: PIXEL_FONT, fontSize: 22, fill: 0xcdb98f },
    });
    title.position.set(this.W * 0.06, 24);
    this.content.addChild(title);

    this.zoneG = new Graphics();
    this.content.addChild(this.zoneG);

    this.cardLayer = new Container();
    this.content.addChild(this.cardLayer);

    const rowY = 130 + this.cardH / 2;
    this.home = { x: this.W * 0.3, y: rowY };
    this.zone = { x: this.W * 0.56, y: rowY - this.cardH / 2, w: this.cardW * 1.2, h: this.cardH };

    this.card = new CardBody();
    this.card.snapTo({ x: this.home.x, y: this.home.y, rot: 0, scale: 1 });
    this.sprite = new Sprite(this.faceTex);
    this.sprite.anchor.set(0.5);
    this.cardLayer.addChild(this.sprite);

    this.drawZone(false);
  }

  private drawZone(hot: boolean): void {
    const z = this.zone;
    this.zoneG.clear();
    this.zoneG
      .roundRect(z.x, z.y, z.w, z.h, 12)
      .fill({ color: hot ? 0x3a5142 : 0x000000, alpha: hot ? 0.35 : 0.12 })
      .stroke({ width: 2, color: hot ? 0xf2c14e : 0x5f7a6d });
  }

  // ——— ввод ———

  private toContent(sx: number, sy: number): { x: number; y: number } {
    return { x: sx, y: sy + this.scrollY };
  }

  private hitCard(cx: number, cy: number): boolean {
    const hw = (this.cardW * DRAG_SCALE) / 2;
    const hh = (this.cardH * DRAG_SCALE) / 2;
    return Math.abs(cx - this.card.px) <= hw && Math.abs(cy - this.card.py) <= hh;
  }

  private onDown = (e: { global: { x: number; y: number } }): void => {
    const p = this.toContent(e.global.x, e.global.y);
    if (this.hitCard(p.x, p.y) && !this.flip) {
      this.drag = { dx: this.card.px - p.x, dy: this.card.py - p.y };
      this.card.setTarget({ x: p.x + this.drag.dx, y: p.y + this.drag.dy, scale: DRAG_SCALE, rot: 0 });
    } else {
      this.scroll = { startPointerY: e.global.y, startScroll: this.scrollY };
    }
    this.wake();
  };

  private onMove = (e: { global: { x: number; y: number } }): void => {
    if (this.drag) {
      const p = this.toContent(e.global.x, e.global.y);
      this.card.setTarget({ x: p.x + this.drag.dx, y: p.y + this.drag.dy, scale: DRAG_SCALE, rot: 0 });
      this.drawZone(this.overZone(p.x, p.y));
      this.wake();
    } else if (this.scroll) {
      const max = Math.max(0, this.contentH - this.H);
      this.scrollY = Math.min(max, Math.max(0, this.scroll.startScroll + (this.scroll.startPointerY - e.global.y)));
      this.content.y = -this.scrollY;
    }
  };

  private onUp = (e: { global: { x: number; y: number } }): void => {
    if (this.drag) {
      this.drag = null;
      const p = this.toContent(e.global.x, e.global.y);
      // Возврат домой в любом случае; попал в зону — по пути переворачивается.
      this.card.setTarget({ x: this.home.x, y: this.home.y, scale: 1, rot: 0 });
      if (this.overZone(p.x, p.y)) this.flip = { t: 0, dur: 0.45, fromFaceUp: this.faceUp };
      this.drawZone(false);
      this.wake();
    }
    this.scroll = null;
  };

  private overZone(cx: number, cy: number): boolean {
    const z = this.zone;
    return cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h;
  }

  // ——— цикл ———

  private wake(): void {
    if (this.app && !this.app.ticker.started) this.app.ticker.start();
  }

  private tick = (): void => {
    if (!this.app) return;
    const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05);
    this.card.step(dt);
    if (this.flip) {
      this.flip.t += dt;
      if (this.flip.t >= this.flip.dur) {
        this.faceUp = !this.flip.fromFaceUp;
        this.flip = null;
      }
    }
    this.render();
    if (this.card.isResting() && !this.flip && !this.drag) this.app.ticker.stop();
  };

  private sideTex(faceUp: boolean): Texture {
    return faceUp ? this.faceTex : this.backTex;
  }

  private render(): void {
    const s = this.card.scaleVal * this.baseScale;
    this.sprite.position.set(this.card.px, this.card.py);
    this.sprite.rotation = this.card.rotation;
    if (this.flip) {
      const angle = spinAngle(easeOutQuad(Math.min(1, this.flip.t / this.flip.dur)), 1);
      this.sprite.scale.set(s * spinScale(angle), s);
      const showOther = spinShowsOther(angle);
      this.sprite.texture = this.sideTex(showOther ? !this.flip.fromFaceUp : this.flip.fromFaceUp);
    } else {
      this.sprite.scale.set(s, s);
      this.sprite.texture = this.sideTex(this.faceUp);
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (!this.app) return;
    this.app.ticker.remove(this.tick);
    this.app.destroy({ removeView: true }, { children: true, texture: true });
    this.app = null;
  }
}
