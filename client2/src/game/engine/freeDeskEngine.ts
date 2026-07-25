import { Application, Container, Rectangle, Text } from "pixi.js";
import { CardTextureCache } from "../ui/CardTextureCache";
import { Card, type CardOptions } from "../ui/Card";
import { DropZone } from "../ui/DropZone";
import { DRAG_SCALE, PIXEL_FONT, TEX_H, TEX_W } from "./constants";

// UI-kit «/free-desk» — сторибук НА КАНВАСЕ. Композит из объектов Card и DropZone. Показывает
// ряд карт разных вариантов с подписями снизу и дропзону (основной элемент управления). Лист
// вертикально скроллится (тащишь пустоту — едет), при этом drag-and-drop карт работает:
// тащишь карту → берёшь её; занёс над зоной — зона показывает ГЛАГОЛ; бросил в зону —
// зона действует (тут: переворачивает), карта пружиной возвращается домой.

interface Story {
  caption: string;
  opts: CardOptions;
}

const STORIES: Story[] = [
  { caption: "открытая", opts: { faceUp: true } },
  { caption: "закрытая", opts: { faceUp: false } },
  { caption: "без переворота", opts: { faceUp: true, flippable: false } },
  { caption: "рубашка: изумруд", opts: { faceUp: false, back: "emerald" } },
  { caption: "лицо: символ", opts: { card: "K♥", faceStyle: "symbol" } },
  { caption: "4-цветная", opts: { card: "Q♦", fourColor: true } },
  { caption: "порванная", opts: { card: "10♦", torn: true } },
  { caption: "меньше ×0.7", opts: { size: 0.7 } },
];

interface Placed {
  card: Card;
  home: { x: number; y: number };
}

export class FreeDeskEngine {
  private app: Application | null = null;
  private destroyed = false;
  private tex!: CardTextureCache;
  private content!: Container; // скроллится
  private cardLayer!: Container;

  private W = 1;
  private H = 1;
  private baseScale = 1;
  private cardW = 1;
  private cardH = 1;
  private contentH = 1;
  private scrollY = 0;

  private cards: Placed[] = [];
  private flipZone!: DropZone;

  private drag: { card: Card; dx: number; dy: number } | null = null;
  private scroll: { startPointerY: number; startScroll: number } | null = null;

  async mount(container: HTMLElement, width: number, height: number): Promise<void> {
    if (this.destroyed) return;
    this.W = Math.max(1, Math.round(width));
    this.H = Math.max(1, Math.round(height));
    // Эталонный размер карты — как в игре (layout.ts): высота = min(w,h)*0.16 (пол/потолок).
    this.cardH = Math.max(48, Math.min(140, Math.min(this.W, this.H) * 0.16));
    this.baseScale = this.cardH / TEX_H;
    this.cardW = TEX_W * this.baseScale;

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
    this.tex = new CardTextureCache(app);

    this.content = new Container();
    app.stage.addChild(this.content);
    this.cardLayer = new Container();
    this.cardLayer.sortableChildren = true;

    this.buildContent();

    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, this.W, this.H);
    app.stage.on("pointerdown", this.onDown);
    app.stage.on("pointermove", this.onMove);
    app.stage.on("pointerup", this.onUp);
    app.stage.on("pointerupoutside", this.onUp);

    app.ticker.add(this.tick);
    this.render();
    this.wake();
  }

  private label(text: string, x: number, y: number, size: number, fill: number): Text {
    const t = new Text({ text, style: { fontFamily: PIXEL_FONT, fontSize: size, fill, align: "center" } });
    t.anchor.set(0.5, 0);
    t.position.set(x, y);
    return t;
  }

  private buildContent(): void {
    const pad = this.W * 0.05;
    const title = this.label("UI-kit — карты и дропзоны", this.W / 2, 20, 24, 0xcdb98f);
    this.content.addChild(title);

    // Сетка вариантов: столбцов столько, сколько влезает; подпись под каждой картой.
    const gap = this.cardW * 0.45;
    const capH = 18;
    const cellW = this.cardW + gap;
    const cellH = this.cardH + 10 + capH;
    const cols = Math.max(1, Math.floor((this.W - pad * 2 + gap) / cellW));
    const gridW = cols * cellW - gap;
    const left = (this.W - gridW) / 2 + this.cardW / 2;
    const top = 64;

    this.content.addChild(this.cardLayer);
    STORIES.forEach((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = left + col * cellW;
      const cy = top + row * (cellH + 14) + this.cardH / 2;
      const card = new Card(s.opts, this.tex, this.baseScale);
      card.body.snapTo({ x: cx, y: cy, rot: 0, scale: 1 });
      card.root.zIndex = i;
      this.cardLayer.addChild(card.root);
      this.cards.push({ card, home: { x: cx, y: cy } });
      this.content.addChild(this.label(s.caption, cx, cy + this.cardH / 2 + 8, 15, 0x9aa89f));
    });

    const rows = Math.ceil(STORIES.length / cols);
    const gridBottom = top + rows * (cellH + 14);

    // Дропзона: занеси карту — «перевернуть», бросил — карта перевернётся и вернётся домой.
    const zoneW = Math.min(this.W - pad * 2, this.cardW * 3);
    const zoneRect = { x: (this.W - zoneW) / 2, y: gridBottom + 20, w: zoneW, h: this.cardH };
    this.flipZone = new DropZone({ name: "ПЕРЕВОРОТ", verb: "перевернуть", rect: zoneRect });
    this.content.addChild(this.flipZone.root);

    this.contentH = Math.max(this.H, zoneRect.y + zoneRect.h + 40);
  }

  // ——— ввод ———

  private toContent(sx: number, sy: number): { x: number; y: number } {
    return { x: sx, y: sy + this.scrollY };
  }

  private hitCard(cx: number, cy: number): Card | null {
    let best: { card: Card; z: number } | null = null;
    for (const { card } of this.cards) {
      const hw = (card.width * DRAG_SCALE) / 2;
      const hh = (card.height * DRAG_SCALE) / 2;
      if (Math.abs(cx - card.body.px) <= hw && Math.abs(cy - card.body.py) <= hh) {
        if (!best || card.root.zIndex >= best.z) best = { card, z: card.root.zIndex };
      }
    }
    return best?.card ?? null;
  }

  private onDown = (e: { global: { x: number; y: number } }): void => {
    const p = this.toContent(e.global.x, e.global.y);
    const card = this.hitCard(p.x, p.y);
    if (card) {
      this.drag = { card, dx: card.body.px - p.x, dy: card.body.py - p.y };
      card.root.zIndex = 100_000;
      card.body.setTarget({ x: p.x + this.drag.dx, y: p.y + this.drag.dy, scale: DRAG_SCALE, rot: 0 });
    } else {
      this.scroll = { startPointerY: e.global.y, startScroll: this.scrollY };
    }
    this.wake();
  };

  private onMove = (e: { global: { x: number; y: number } }): void => {
    if (this.drag) {
      const p = this.toContent(e.global.x, e.global.y);
      this.drag.card.body.setTarget({ x: p.x + this.drag.dx, y: p.y + this.drag.dy, scale: DRAG_SCALE, rot: 0 });
      this.flipZone.setHot(this.flipZone.contains(p.x, p.y));
      this.wake();
    } else if (this.scroll) {
      const max = Math.max(0, this.contentH - this.H);
      this.scrollY = Math.min(max, Math.max(0, this.scroll.startScroll + (this.scroll.startPointerY - e.global.y)));
      this.content.y = -this.scrollY;
    }
  };

  private onUp = (e: { global: { x: number; y: number } }): void => {
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      const p = this.toContent(e.global.x, e.global.y);
      if (this.flipZone.contains(p.x, p.y)) d.card.requestFlip(); // действие зоны
      // Возврат домой в любом случае (мимо зоны — просто пружинит назад).
      const home = this.cards.find((c) => c.card === d.card)!.home;
      d.card.body.setTarget({ x: home.x, y: home.y, scale: 1, rot: 0 });
      d.card.root.zIndex = this.cards.findIndex((c) => c.card === d.card);
      this.flipZone.setHot(false);
      this.wake();
    }
    this.scroll = null;
  };

  // ——— цикл ———

  private wake(): void {
    if (this.app && !this.app.ticker.started) this.app.ticker.start();
  }

  private tick = (): void => {
    if (!this.app) return;
    const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05);
    let moving = this.drag !== null;
    for (const { card } of this.cards) {
      card.step(dt);
      if (!card.resting) moving = true;
    }
    this.render();
    if (!moving) this.app.ticker.stop();
  };

  private render(): void {
    for (const { card } of this.cards) card.sync();
  }

  destroy(): void {
    this.destroyed = true;
    if (!this.app) return;
    this.app.ticker.remove(this.tick);
    this.tex?.destroy();
    this.app.destroy({ removeView: true }, { children: true, texture: true });
    this.app = null;
  }
}
