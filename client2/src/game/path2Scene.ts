import { Application, Container, Graphics, Rectangle, Sprite, type Texture } from "pixi.js";
import { CardBody } from "./CardBody";
import { TablePool, type TableSlot } from "./engine/tablePool";
import { assembleTable } from "./engine/tableAssemble";
import { boxFaceUp } from "./engine/tableSide";
import { makeCardBackTexture, makeCardFaceTexture } from "./engine/cardTextures";
import { TEX_H, TEX_W } from "./engine/constants";
import type { CardVisual } from "./engine/types";

// POC Пути 2 (см. PATH2.md): один TablePool на всю мини-сцену. Тап по карте перегоняет её в
// следующий бокс (колода→рука→зона→сброс→колода) — и это ТОТ ЖЕ спрайт, летящий пружиной
// (CardBody), а не «уничтожить/создать/призрак». Доказывает ядро Пути 2 вживую, не трогая
// боевой движок. Сторона карты берётся из boxFaceUp (рука/зона — лицом, колода/сброс —
// рубашкой), поэтому переезд сам показывает нужную сторону.

const DECK = ["A♠", "K♥", "Q♦", "J♣", "10♠", "9♥", "8♦", "7♣"];
const NEXT: Record<string, string> = { deck: "hand", hand: "play", discard: "deck" };

export class Path2Scene {
  private app: Application | null = null;
  private destroyed = false;
  private pool!: TablePool;
  private faceTex = new Map<string, Texture>();
  private backTex!: Texture;
  private baseScale = 1;
  private W = 1;
  private H = 1;

  // Состояние стола — как на сервере: четыре набора.
  private deck: string[] = [...DECK];
  private hand: string[] = [];
  private discard: string[] = [];
  private play: string[][] = [];

  async mount(container: HTMLElement, width: number, height: number): Promise<void> {
    if (this.destroyed) return;
    this.W = Math.max(1, Math.round(width));
    this.H = Math.max(1, Math.round(height));
    const cardW = this.W * 0.13;
    this.baseScale = cardW / TEX_W;

    const app = new Application();
    try {
      await app.init({ width: this.W, height: this.H, backgroundAlpha: 0, antialias: true, preference: "webgl" });
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

    // Разметка боксов — для наглядности рамками.
    const boxes = new Graphics();
    for (const r of Object.values(this.boxRects())) {
      boxes.roundRect(r.x, r.y, r.w, r.h, 10).stroke({ width: 2, color: 0x6f8a7d });
    }
    app.stage.addChild(boxes);

    const layer = new Container();
    layer.sortableChildren = true;
    app.stage.addChild(layer);

    this.pool = new TablePool({
      create: (card) => {
        const sprite = new Sprite(this.backTex);
        sprite.anchor.set(0.5);
        layer.addChild(sprite);
        const v: CardVisual = { body: new CardBody(), sprite, card, phase: 0 };
        return v;
      },
      anchor: (s) => this.anchorFor(s),
      onEnter: (v, s) => this.paint(v, s),
      onPlace: (v, s) => this.paint(v, s),
      onLeave: (v) => v.sprite.destroy(),
    });

    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, this.W, this.H);
    app.stage.on("pointerdown", this.onDown);

    this.rebuild(true);
    app.ticker.add(this.tick);
    this.render();
  }

  private boxRects(): Record<string, { x: number; y: number; w: number; h: number }> {
    const W = this.W;
    const H = this.H;
    const bw = W * 0.22;
    const bh = H * 0.24;
    return {
      deck: { x: W * 0.04, y: H * 0.1, w: bw, h: bh },
      discard: { x: W * 0.74, y: H * 0.1, w: bw, h: bh },
      play: { x: W * 0.08, y: H * 0.42, w: W * 0.84, h: H * 0.24 },
      hand: { x: W * 0.08, y: H * 0.74, w: W * 0.84, h: H * 0.2 },
    };
  }

  private anchorFor(s: TableSlot) {
    const r = this.boxRects();
    if (s.box === "deck") return { x: r.deck.x + r.deck.w / 2, y: r.deck.y + r.deck.h / 2 - s.within * 1.5, rot: 0, scale: 1 };
    if (s.box === "discard") return { x: r.discard.x + r.discard.w / 2, y: r.discard.y + r.discard.h / 2 - s.within * 1.5, rot: 0, scale: 1 };
    if (s.box === "hand") {
      const step = Math.min(TEX_W * this.baseScale * 0.75, (r.hand.w - 20) / Math.max(1, this.hand.length));
      const total = (this.hand.length - 1) * step;
      const cx = r.hand.x + r.hand.w / 2;
      return { x: cx - total / 2 + s.within * step, y: r.hand.y + r.hand.h / 2, rot: 0, scale: 1 };
    }
    // play:k — кучки слева направо, карты в кучке стопкой вверх.
    const k = Number(s.box.slice(5));
    const step = TEX_W * this.baseScale * 1.25;
    const cx = r.play.x + r.play.w / 2;
    const total = (this.play.length - 1) * step;
    return { x: cx - total / 2 + k * step, y: r.play.y + r.play.h / 2 - s.within * 10, rot: 0, scale: 1 };
  }

  private paint(v: CardVisual, s: TableSlot): void {
    v.sprite.zIndex = s.within + (s.box.startsWith("play") ? 100 : 0);
    v.sprite.texture = boxFaceUp(s.box) ? this.faceFor(v.card) : this.backTex;
  }

  private faceFor(card: string): Texture {
    let t = this.faceTex.get(card);
    if (!t && this.app) {
      t = makeCardFaceTexture(this.app, card, false, "symbol");
      this.faceTex.set(card, t);
    }
    return t ?? this.backTex;
  }

  private rebuild(snap = false): void {
    const slots = assembleTable(this.deck, this.hand, this.discard, this.play);
    this.pool.apply(slots);
    if (snap) for (const v of this.pool.all()) v.body.snapTo(this.anchorFor(this.slotOf(v.card)!));
    this.wake();
  }

  private slotOf(card: string): TableSlot | undefined {
    return this.pool.slots.find((s) => s.card === card);
  }

  // Тап по карте — перегнать её в следующий бокс. Показывает: ОДИН спрайт летит из бокса в бокс.
  private onDown = (e: { global: { x: number; y: number } }): void => {
    const hit = this.hitCard(e.global.x, e.global.y);
    if (!hit) return;
    const slot = this.slotOf(hit.card);
    if (!slot) return;
    this.moveCard(hit.card, slot.box);
  };

  private moveCard(card: string, box: string): void {
    // вынуть карту из текущего бокса
    this.deck = this.deck.filter((c) => c !== card);
    this.hand = this.hand.filter((c) => c !== card);
    this.discard = this.discard.filter((c) => c !== card);
    this.play = this.play.map((s) => s.filter((c) => c !== card)).filter((s) => s.length > 0);
    const dest = box.startsWith("play") ? "discard" : NEXT[box] ?? "deck";
    if (dest === "hand") this.hand.push(card);
    else if (dest === "discard") this.discard.push(card);
    else if (dest === "deck") this.deck.push(card);
    else this.play.push([card]); // hand→play — новой кучкой
    this.rebuild();
  }

  private hitCard(x: number, y: number): CardVisual | null {
    const half = (TEX_W * this.baseScale) / 2;
    const halfH = (TEX_H * this.baseScale) / 2;
    const all = this.pool.all();
    for (let i = all.length - 1; i >= 0; i--) {
      const v = all[i]!;
      if (Math.abs(x - v.body.px) <= half && Math.abs(y - v.body.py) <= halfH) return v;
    }
    return null;
  }

  private wake(): void {
    if (this.app && !this.app.ticker.started) this.app.ticker.start();
  }

  private tick = (): void => {
    if (!this.app) return;
    const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05);
    let moving = false;
    for (const v of this.pool.all()) {
      v.body.step(dt);
      if (!v.body.isResting()) moving = true;
    }
    this.render();
    if (!moving) this.app.ticker.stop();
  };

  private render(): void {
    for (const v of this.pool.all()) {
      v.sprite.position.set(v.body.px, v.body.py);
      v.sprite.rotation = v.body.rotation;
      v.sprite.scale.set(v.body.scaleVal * this.baseScale);
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
