import { Application, Container, Rectangle, Text } from "pixi.js";
import { CardTextureCache } from "../ui/CardTextureCache";
import { Card, type CardOptions, type CardState } from "../ui/Card";
import { DropZone } from "../ui/DropZone";
import { DRAG_SCALE, PIXEL_FONT, TEX_H, TEX_W } from "./constants";

// UI-kit «/free-desk» — сторибук на канвасе. Один горизонтальный ряд карт-вариантов с
// подписями; контент панится и зумится (жесты/колесо/полосы). Управление drag-and-drop.
//
// СЛОИ (снизу вверх) — «высота над столом» + тени выше на нижних (см. Card):
//   surface     — стол: тексты, фон+название дропзон;
//   idleShadow  → idleCards   — карты в покое (лежат на столе над текстом);
//   floatShadow → floatCards  — парящие;
//   fanShadow                 — тень веера (падает лишь на «настольные», ниже глагола/веера);
//   verb                      — глагол дропзоны (над лежащими картами);
//   fanCards                  — карты веера (задел);
//   dragShadow  → dragCards   — карта в драге (наивысшая, тень выше веера).
// Карта при смене плана переезжает в свою пару слоёв (reparent), а размер/тень/позиция едут
// плавно пружиной — переход между планами не рвётся.

interface Story {
  caption: string;
  opts: CardOptions;
}

const STORIES: Story[] = [
  { caption: "открытая", opts: { faceUp: true } },
  { caption: "закрытая", opts: { faceUp: false } },
  { caption: "скрытая 🖕", opts: { hidden: true, faceUp: false } },
  { caption: "рубашка: изумруд", opts: { faceUp: false, back: "emerald" } },
  { caption: "лицо: символ", opts: { card: "K♥", faceStyle: "symbol" } },
  { caption: "4-цветная", opts: { card: "Q♦", fourColor: true } },
  { caption: "порванная", opts: { card: "10♦", torn: true } },
  { caption: "меньше ×0.7", opts: { size: 0.7 } },
  { caption: "нельзя тащить", opts: { card: "7♣", draggable: false } },
  { caption: "джокер", opts: { joker: true } },
];

interface Placed {
  card: Card;
  home: { x: number; y: number };
}

export interface ViewState {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  scroll: number;
  thumb: number;
  scrollable: boolean;
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.6;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class FreeDeskEngine {
  private app: Application | null = null;
  private destroyed = false;
  private tex!: CardTextureCache;
  private content!: Container;

  private layers!: {
    surface: Container;
    idleShadow: Container;
    idleCards: Container;
    floatShadow: Container;
    floatCards: Container;
    fanShadow: Container;
    verb: Container;
    fanCards: Container;
    dragShadow: Container;
    dragCards: Container;
  };

  private W = 1;
  private H = 1;
  private baseScale = 1;
  private cardW = 1;
  private cardH = 1;
  private contentW = 1;
  private contentH = 1;

  private view = { x: 0, y: 0, zoom: 1 };
  private cards: Placed[] = [];
  private flipZone!: DropZone;

  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: "none" | "card" | "pan" | "pinch" = "none";
  private cardDrag: { card: Card; dx: number; dy: number } | null = null;
  private panLast = { x: 0, y: 0 };
  private pinch = { dist: 1, zoom: 1, midContentX: 0, midContentY: 0 };
  private onView: ((v: ViewState) => void) | null = null;

  async mount(container: HTMLElement, width: number, height: number): Promise<void> {
    if (this.destroyed) return;
    this.W = Math.max(1, Math.round(width));
    this.H = Math.max(1, Math.round(height));
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
    this.buildLayers();
    this.buildContent();

    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, this.W, this.H);
    app.stage.on("pointerdown", this.onDown);
    app.stage.on("pointermove", this.onMove);
    app.stage.on("pointerup", this.onUp);
    app.stage.on("pointerupoutside", this.onUp);
    app.canvas.addEventListener("wheel", this.onWheel, { passive: false });

    this.clampView();
    this.applyView();
    app.ticker.add(this.tick);
    this.render();
    this.wake();
    this.emitView();
  }

  private buildLayers(): void {
    const make = () => new Container();
    this.layers = {
      surface: make(),
      idleShadow: make(),
      idleCards: make(),
      floatShadow: make(),
      floatCards: make(),
      fanShadow: make(),
      verb: make(),
      fanCards: make(),
      dragShadow: make(),
      dragCards: make(),
    };
    // Порядок добавления = z-порядок (снизу вверх).
    for (const key of ["surface", "idleShadow", "idleCards", "floatShadow", "floatCards", "fanShadow", "verb", "fanCards", "dragShadow", "dragCards"] as const) {
      this.content.addChild(this.layers[key]);
    }
  }

  /** Положить карту (root + тень) в слои её текущего плана. */
  private placeCard(card: Card): void {
    const map: Record<CardState, { cards: Container; shadow: Container }> = {
      idle: { cards: this.layers.idleCards, shadow: this.layers.idleShadow },
      floating: { cards: this.layers.floatCards, shadow: this.layers.floatShadow },
      fan: { cards: this.layers.fanCards, shadow: this.layers.fanShadow },
      drag: { cards: this.layers.dragCards, shadow: this.layers.dragShadow },
    };
    const dst = map[card.state];
    dst.cards.addChild(card.root);
    dst.shadow.addChild(card.shadow);
  }

  // ——— контент ———

  private label(text: string, x: number, y: number, size: number, fill: number, wrap?: number, anchorX = 0.5): Text {
    const t = new Text({
      text,
      style: { fontFamily: PIXEL_FONT, fontSize: size, fill, align: "center", wordWrap: wrap !== undefined, wordWrapWidth: wrap ?? 0 },
    });
    t.anchor.set(anchorX, 0);
    t.position.set(x, y);
    return t;
  }

  private buildContent(): void {
    const pad = 40;
    const gap = this.cardW * 1.15;
    const cellW = this.cardW + gap;
    const capH = 40;
    const titleH = 40;
    const cardCY = pad + titleH + this.cardH / 2;

    STORIES.forEach((s, i) => {
      const cx = pad + this.cardW / 2 + i * cellW;
      const card = new Card(s.opts, this.tex, this.baseScale);
      card.bobPhase = i * 0.9;
      card.body.snapTo({ x: cx, y: cardCY, rot: 0, scale: 1 });
      this.placeCard(card); // idle → на стол
      this.cards.push({ card, home: { x: cx, y: cardCY } });
      // Подпись — на ПОВЕРХНОСТИ (под картами).
      this.layers.surface.addChild(this.label(s.caption, cx, cardCY + this.cardH / 2 + 8, 14, 0x9aa89f, cellW * 0.9));
    });

    const rightEdge = pad + this.cardW / 2 + (STORIES.length - 1) * cellW + this.cardW / 2;
    this.contentW = rightEdge + pad;

    this.layers.surface.addChild(this.label("Карты — варианты", pad, pad, 26, 0xcdb98f, undefined, 0));

    // Дропзона: фон+название — на поверхности, глагол — в слое над лежащими картами.
    const zoneW = this.cardW * 3;
    const zoneRect = { x: pad, y: cardCY + this.cardH / 2 + capH + 24, w: zoneW, h: this.cardH };
    this.flipZone = new DropZone({ name: "ПЕРЕВОРОТ", verb: "перевернуть", rect: zoneRect });
    this.layers.surface.addChild(this.flipZone.base);
    this.layers.verb.addChild(this.flipZone.verb);

    this.contentH = zoneRect.y + zoneRect.h + pad;
  }

  // ——— вьюпорт ———

  private screenToContent(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.view.x) / this.view.zoom, y: (sy - this.view.y) / this.view.zoom };
  }

  private clampView(): void {
    const cw = this.contentW * this.view.zoom;
    const ch = this.contentH * this.view.zoom;
    this.view.x = cw <= this.W ? (this.W - cw) / 2 : clamp(this.view.x, this.W - cw, 0);
    this.view.y = ch <= this.H ? 24 : clamp(this.view.y, this.H - ch, 0);
  }

  private applyView(): void {
    this.content.position.set(this.view.x, this.view.y);
    this.content.scale.set(this.view.zoom);
  }

  private zoomAround(sx: number, sy: number, factor: number): void {
    const focal = this.screenToContent(sx, sy);
    this.view.zoom = clamp(this.view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.view.x = sx - focal.x * this.view.zoom;
    this.view.y = sy - focal.y * this.view.zoom;
    this.clampView();
    this.applyView();
    this.wake();
    this.emitView();
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.app!.canvas.getBoundingClientRect();
    this.zoomAround(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  setOnView(cb: ((v: ViewState) => void) | null): void {
    this.onView = cb;
    this.emitView();
  }

  private emitView(): void {
    this.onView?.(this.viewState());
  }

  private viewState(): ViewState {
    const cw = this.contentW * this.view.zoom;
    const overflow = Math.max(0, cw - this.W);
    return {
      zoom: this.view.zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      scroll: overflow > 0 ? -this.view.x / overflow : 0,
      thumb: cw > 0 ? Math.min(1, this.W / cw) : 1,
      scrollable: overflow > 1,
    };
  }

  setZoom(z: number): void {
    this.zoomAround(this.W / 2, this.H / 2, clamp(z, MIN_ZOOM, MAX_ZOOM) / this.view.zoom);
  }

  setScroll(fraction: number): void {
    const overflow = Math.max(0, this.contentW * this.view.zoom - this.W);
    this.view.x = -clamp(fraction, 0, 1) * overflow;
    this.clampView();
    this.applyView();
    this.wake();
    this.emitView();
  }

  // ——— ввод ———

  private hitCard(cx: number, cy: number): Card | null {
    // Драг-карта (если есть) поверх всех; иначе первая, что накрыла точку (в покое не overlap).
    for (const { card } of this.cards) {
      const hw = (card.width * DRAG_SCALE) / 2;
      const hh = (card.height * DRAG_SCALE) / 2;
      if (Math.abs(cx - card.body.px) <= hw && Math.abs(cy - card.body.py) <= hh) return card;
    }
    return null;
  }

  private onDown = (e: { global: { x: number; y: number }; pointerId: number }): void => {
    this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
    if (this.pointers.size === 2) {
      this.beginPinch();
    } else if (this.pointers.size === 1) {
      const p = this.screenToContent(e.global.x, e.global.y);
      const card = this.hitCard(p.x, p.y);
      if (card && !card.draggable) {
        // Заблокированную карту не тащим и стол не панимаем — только лёгкий «стоп»-кивок,
        // чтобы игрок понял: это механика блока, а не залипший драг.
        card.blockNudge();
        this.gesture = "none";
      } else if (card) {
        this.gesture = "card";
        this.cardDrag = { card, dx: card.body.px - p.x, dy: card.body.py - p.y };
        card.setState("drag"); // подъём: масштаб/тень едут плавно
        this.placeCard(card); // и переезд в верхний слой
        card.body.setTarget({ x: p.x + this.cardDrag.dx, y: p.y + this.cardDrag.dy, rot: 0 });
      } else {
        this.gesture = "pan";
        this.panLast = { x: e.global.x, y: e.global.y };
      }
    }
    this.wake();
  };

  private beginPinch(): void {
    if (this.cardDrag) {
      this.releaseCard(this.cardDrag.card);
      this.cardDrag = null;
    }
    this.gesture = "pinch";
    const [a, b] = [...this.pointers.values()];
    const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
    const c = this.screenToContent(mid.x, mid.y);
    this.pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: this.view.zoom, midContentX: c.x, midContentY: c.y };
  }

  private onMove = (e: { global: { x: number; y: number }; pointerId: number }): void => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });

    if (this.gesture === "pinch" && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.view.zoom = clamp((this.pinch.zoom * dist) / this.pinch.dist, MIN_ZOOM, MAX_ZOOM);
      this.view.x = mid.x - this.pinch.midContentX * this.view.zoom;
      this.view.y = mid.y - this.pinch.midContentY * this.view.zoom;
      this.clampView();
      this.applyView();
      this.emitView();
    } else if (this.gesture === "card" && this.cardDrag) {
      const p = this.screenToContent(e.global.x, e.global.y);
      this.cardDrag.card.body.setTarget({ x: p.x + this.cardDrag.dx, y: p.y + this.cardDrag.dy, rot: 0 });
      this.flipZone.setHot(this.flipZone.contains(p.x, p.y));
    } else if (this.gesture === "pan") {
      this.view.x += e.global.x - this.panLast.x;
      this.view.y += e.global.y - this.panLast.y;
      this.panLast = { x: e.global.x, y: e.global.y };
      this.clampView();
      this.applyView();
      this.emitView();
    }
  };

  private onUp = (e: { global: { x: number; y: number }; pointerId: number }): void => {
    this.pointers.delete(e.pointerId);
    if (this.gesture === "card" && this.cardDrag) {
      const p = this.screenToContent(e.global.x, e.global.y);
      if (this.flipZone.contains(p.x, p.y)) this.cardDrag.card.requestFlip();
      this.releaseCard(this.cardDrag.card);
      this.cardDrag = null;
      this.flipZone.setHot(false);
    }
    if (this.pointers.size === 1) {
      const only = [...this.pointers.values()][0]!;
      this.gesture = "pan";
      this.panLast = { x: only.x, y: only.y };
    } else if (this.pointers.size === 0) {
      this.gesture = "none";
    }
    this.wake();
  };

  private releaseCard(card: Card): void {
    const placed = this.cards.find((c) => c.card === card)!;
    card.setState("idle"); // опускается на стол — размер/тень плавно назад
    this.placeCard(card);
    card.body.setTarget({ x: placed.home.x, y: placed.home.y, rot: 0 });
  }

  // ——— цикл ———

  private wake(): void {
    if (this.app && !this.app.ticker.started) this.app.ticker.start();
  }

  private tick = (): void => {
    if (!this.app) return;
    const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05);
    let moving = this.gesture !== "none";
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
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.ticker.remove(this.tick);
    this.tex?.destroy();
    this.app.destroy({ removeView: true }, { children: true, texture: true });
    this.app = null;
  }
}
