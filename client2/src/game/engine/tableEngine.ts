import { Application, Container, Graphics, Rectangle, Sprite, type Texture } from "pixi.js";
import { CardBody } from "../CardBody";
import { SUITS } from "../card";
import { ElementPool, type Slot } from "./elementPool";
import { createPixiApp, ensureFonts } from "./canvasHost";
import { assembleTable } from "./tableAssemble";
import { boxFaceUp } from "./tableSide";
import { makeCardBackTexture, makeCardFaceTexture, makeShadowTexture } from "./cardTextures";
import { DRAG_SCALE, SHADOW_ALPHA, TEX_H, TEX_W } from "./constants";
import type { CardVisual } from "./types";

// Новый движок стола (client2, автономный). Один пул карт по идентичности (TablePool):
// боксы — только якоря, переход между боксами = setTarget на ТОМ ЖЕ спрайте. Управление —
// НАСТОЯЩИЙ drag-and-drop: берёшь карту, она поднимается и едет за пальцем с тенью, бросил
// в зону — переезжает туда (и переворачивается по стороне бокса), мимо — пружинит назад.
//
// Пока один игрок и локальное состояние (deck/hand/play/discard). Сеть — следующим слоем.

const RANKS_36 = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function buildDeck(): string[] {
  const out: string[] = [];
  for (const s of SUITS) for (const r of RANKS_36) out.push(`${r}${s}`);
  return out;
}

interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class TableEngine {
  private app: Application | null = null;
  private destroyed = false;
  private pool!: ElementPool<CardVisual>;
  private cardLayer!: Container;
  private shadowLayer!: Container;

  private backTex!: Texture;
  private shadowTex!: Texture;
  private faceCache = new Map<string, Texture>();
  private shadowByCard = new Map<string, Sprite>();

  private W = 1;
  private H = 1;
  private cardW = 1;
  private cardH = 1;
  private baseScale = 1;

  // Локальное состояние стола (как четыре набора сервера).
  private deck: string[] = buildDeck();
  private hand: string[] = [];
  private play: string[][] = [];
  private discard: string[] = [];

  private drag: { card: string; dx: number; dy: number } | null = null;

  async mount(container: HTMLElement, width: number, height: number): Promise<void> {
    if (this.destroyed) return;
    this.W = Math.max(1, Math.round(width));
    this.H = Math.max(1, Math.round(height));
    this.cardW = Math.min(this.W * 0.16, this.H * 0.12);
    this.cardH = this.cardW * (TEX_H / TEX_W);
    this.baseScale = this.cardW / TEX_W;

    await ensureFonts();
    if (this.destroyed) return;
    const app = await createPixiApp(this.W, this.H);
    if (!app) return;
    if (this.destroyed) {
      app.destroy({ removeView: true }, { children: true, texture: true });
      return;
    }
    container.appendChild(app.canvas);
    this.app = app;
    this.backTex = makeCardBackTexture(app, "ruby");
    this.shadowTex = makeShadowTexture(app);

    const zonesG = new Graphics();
    zonesG.zIndex = 0;
    this.drawZones(zonesG);
    this.shadowLayer = new Container();
    this.cardLayer = new Container();
    this.cardLayer.sortableChildren = true;
    app.stage.addChild(zonesG, this.shadowLayer, this.cardLayer);

    this.pool = new ElementPool<CardVisual>({
      create: (card) => this.createCard(card),
      anchor: (s) => this.anchorFor(s),
      onEnter: (v, s) => this.paint(v, s),
      onPlace: (v, s) => this.paint(v, s),
      onLeave: (v, card) => this.retire(v, card),
    });

    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, this.W, this.H);
    app.stage.on("pointerdown", this.onDown);
    app.stage.on("pointermove", this.onMove);
    app.stage.on("pointerup", this.onUp);
    app.stage.on("pointerupoutside", this.onUp);

    this.rebuild(true);
    app.ticker.add(this.tick);
    this.render();
  }

  // ——— зоны ———

  private zones(): Record<"deck" | "hand" | "play" | "discard", Zone> {
    const W = this.W;
    const H = this.H;
    const pad = W * 0.03;
    const colW = this.cardW * 1.5;
    const topH = this.cardH * 1.4;
    const handH = this.cardH * 1.5;
    return {
      deck: { x: pad, y: pad, w: colW, h: topH },
      discard: { x: W - pad - colW, y: pad, w: colW, h: topH },
      play: { x: pad, y: pad + topH + pad, w: W - pad * 2, h: H - (pad + topH + pad) - (handH + pad) - pad },
      hand: { x: pad, y: H - pad - handH, w: W - pad * 2, h: handH },
    };
  }

  private drawZones(g: Graphics): void {
    g.clear();
    for (const z of Object.values(this.zones())) {
      g.roundRect(z.x, z.y, z.w, z.h, 12).stroke({ width: 2, color: 0x5f7a6d });
    }
  }

  // ——— якоря: место слота в его боксе ———

  private anchorFor(s: Slot) {
    const z = this.zones();
    if (s.box === "deck") return this.stackAnchor(z.deck, s.within, this.deck.length);
    if (s.box === "discard") return this.stackAnchor(z.discard, s.within, this.discard.length);
    if (s.box === "hand") return this.rowAnchor(z.hand, s.within, this.hand.length);
    // play:k — кучки в ряд, карты внутри кучки стопкой вверх
    const k = Number(s.box.slice(5));
    return this.playAnchor(z.play, k, this.play.length, s.within);
  }

  private stackAnchor(z: Zone, within: number, count: number) {
    // Небольшой сдвиг вверх-вправо на карту — «толщина» стопки.
    const c = (Math.max(1, count) - 1) / 2;
    return { x: z.x + z.w / 2 + (within - c) * 0.6, y: z.y + z.h / 2 - (within - c) * 0.9, rot: 0, scale: 1 };
  }

  private rowAnchor(z: Zone, within: number, count: number) {
    const step = Math.min(this.cardW * 0.72, (z.w - this.cardW) / Math.max(1, count - 1 || 1));
    const total = (count - 1) * step;
    const cx = z.x + z.w / 2;
    return { x: cx - total / 2 + within * step, y: z.y + z.h / 2, rot: 0, scale: 1 };
  }

  private playAnchor(z: Zone, k: number, stacks: number, within: number) {
    const step = this.cardW * 1.3;
    const cx = z.x + z.w / 2;
    const total = (stacks - 1) * step;
    return { x: cx - total / 2 + k * step, y: z.y + z.h / 2 - within * (this.cardH * 0.28), rot: 0, scale: 1 };
  }

  // ——— спрайты ———

  private createCard(card: string): CardVisual {
    const sprite = new Sprite(this.backTex);
    sprite.anchor.set(0.5);
    this.cardLayer.addChild(sprite);
    const shadow = new Sprite(this.shadowTex);
    shadow.anchor.set(0.5);
    shadow.alpha = SHADOW_ALPHA;
    shadow.visible = false;
    this.shadowLayer.addChild(shadow);
    this.shadowByCard.set(card, shadow);
    return { body: new CardBody(), sprite, card, phase: 0 };
  }

  private retire(v: CardVisual, card: string): void {
    v.sprite.destroy();
    this.shadowByCard.get(card)?.destroy();
    this.shadowByCard.delete(card);
  }

  private paint(v: CardVisual, s: Slot): void {
    v.sprite.zIndex = (s.box.startsWith("play") ? 1000 : 0) + s.within;
    v.sprite.texture = boxFaceUp(s.box) ? this.faceFor(v.card) : this.backTex;
  }

  private faceFor(card: string): Texture {
    let t = this.faceCache.get(card);
    if (!t && this.app) {
      t = makeCardFaceTexture(this.app, card, false, "pips");
      this.faceCache.set(card, t);
    }
    return t ?? this.backTex;
  }

  // ——— применить состояние к пулу ———

  private rebuild(snap = false): void {
    const slots = assembleTable(this.deck, this.hand, this.discard, this.play);
    this.pool.apply(slots);
    if (snap) for (const v of this.pool.all()) v.body.snapTo(this.anchorFor(this.slotOf(v.card)!));
    this.wake();
  }

  private slotOf(card: string): Slot | undefined {
    return this.pool.slots.find((s) => s.id === card);
  }

  // ——— drag-and-drop ———

  private hitCard(x: number, y: number): string | null {
    // Сверху вниз: перетаскиваемая/верхняя лежит выше.
    const hw = (this.cardW * DRAG_SCALE) / 2;
    const hh = (this.cardH * DRAG_SCALE) / 2;
    const all = this.pool.all();
    let best: { card: string; z: number } | null = null;
    for (const v of all) {
      if (Math.abs(x - v.body.px) <= hw && Math.abs(y - v.body.py) <= hh) {
        if (!best || v.sprite.zIndex >= best.z) best = { card: v.card, z: v.sprite.zIndex };
      }
    }
    return best?.card ?? null;
  }

  private onDown = (e: { global: { x: number; y: number } }): void => {
    const card = this.hitCard(e.global.x, e.global.y);
    if (!card) return;
    const v = this.pool.get(card);
    if (!v) return;
    this.drag = { card, dx: v.body.px - e.global.x, dy: v.body.py - e.global.y };
    v.sprite.zIndex = 100_000; // поверх всех, пока тащим
    v.sprite.texture = this.faceFor(card); // в руке видно, что берёшь
    v.body.setTarget({ x: e.global.x + this.drag.dx, y: e.global.y + this.drag.dy, scale: DRAG_SCALE, rot: 0 });
    this.wake();
  };

  private onMove = (e: { global: { x: number; y: number } }): void => {
    const d = this.drag;
    if (!d) return;
    const v = this.pool.get(d.card);
    if (!v) return;
    v.body.setTarget({ x: e.global.x + d.dx, y: e.global.y + d.dy, scale: DRAG_SCALE, rot: 0 });
    this.wake();
  };

  private onUp = (e: { global: { x: number; y: number } }): void => {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const zone = this.zoneAt(e.global.x, e.global.y);
    if (zone) this.moveCardTo(d.card, zone, e.global.x);
    // rebuild в любом случае: попал в зону — переедет туда; мимо — спружинит домой (scale
    // вернётся к 1). Тот же спрайт, реальный перелёт.
    this.rebuild();
  };

  private zoneAt(x: number, y: number): "deck" | "hand" | "play" | "discard" | null {
    const z = this.zones();
    for (const [name, r] of Object.entries(z)) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return name as "deck";
    }
    return null;
  }

  private moveCardTo(card: string, zone: "deck" | "hand" | "play" | "discard", dropX: number): void {
    // вынуть из текущего бокса
    this.deck = this.deck.filter((c) => c !== card);
    this.hand = this.hand.filter((c) => c !== card);
    this.discard = this.discard.filter((c) => c !== card);
    this.play = this.play.map((s) => s.filter((c) => c !== card)).filter((s) => s.length > 0);

    if (zone === "deck") this.deck.push(card);
    else if (zone === "hand") this.hand.push(card);
    else if (zone === "discard") this.discard.push(card);
    else {
      // play: доложить в ближайшую кучку (если палец рядом с ней), иначе новая кучка
      const pz = this.zones().play;
      const step = this.cardW * 1.3;
      const cx = pz.x + pz.w / 2;
      const total = (this.play.length - 1) * step;
      let nearest = -1;
      let bestDist = this.cardW * 0.7; // порог «попал в кучку»
      this.play.forEach((_, k) => {
        const sx = cx - total / 2 + k * step;
        const dist = Math.abs(dropX - sx);
        if (dist < bestDist) {
          bestDist = dist;
          nearest = k;
        }
      });
      if (nearest >= 0) this.play[nearest]!.push(card);
      else this.play.push([card]);
    }
  }

  // ——— цикл ———

  private wake(): void {
    if (this.app && !this.app.ticker.started) this.app.ticker.start();
  }

  private tick = (): void => {
    if (!this.app) return;
    const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05);
    let moving = this.drag !== null;
    for (const v of this.pool.all()) {
      v.body.step(dt);
      if (!v.body.isResting()) moving = true;
    }
    this.render();
    if (!moving) this.app.ticker.stop();
  };

  private render(): void {
    for (const v of this.pool.all()) {
      const s = v.body.scaleVal * this.baseScale;
      v.sprite.position.set(v.body.px, v.body.py);
      v.sprite.rotation = v.body.rotation;
      v.sprite.scale.set(s);
      const shadow = this.shadowByCard.get(v.card);
      if (!shadow) continue;
      const lift = v.body.scaleVal - 1;
      if (lift > 0.001) {
        shadow.visible = true;
        shadow.position.set(v.body.px - this.cardH * lift * 0.12, v.body.py + this.cardH * lift * 0.18);
        shadow.rotation = v.body.rotation;
        shadow.scale.set(s);
      } else {
        shadow.visible = false;
      }
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
