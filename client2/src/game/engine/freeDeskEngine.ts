import { Application, Container, Rectangle, Text } from "pixi.js";
import { CardTextureCache } from "../ui/CardTextureCache";
import { Card, type CardOptions, type CardState, type ShadowShape } from "../ui/Card";
import { DropZone } from "../ui/DropZone";
import { Button, type ButtonOptions } from "../ui/Button";
import { ShadowLayer } from "../ui/ShadowLayer";

type Level = "idle" | "floating" | "fan" | "drag";
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
  { caption: "удерживаемая", opts: { card: "8♦", rest: "held" } },
  { caption: "приподнятая (в руке)", opts: { card: "9♠", rest: "floating" } },
  { caption: "джокер", opts: { joker: true } },
];

interface Placed {
  card: Card;
  home: { x: number; y: number };
  depth: number; // z-индекс глубины в своём слое; после драга карта возвращается на него
  specIndex: number; // из какого CardSpec рождена — для снимка/восстановления при рестарте канваса
}

// Описание карты песочницы (позиция покоя + пропсы) — из него рождаются живые Card. Держим
// отдельно, чтобы «рестарт канваса» мог пересоздать канвас и воссоздать карты из тех же спеков.
interface CardSpec {
  opts: CardOptions;
  home: { x: number; y: number };
  depth: number;
  bobPhase: number;
}

// Снимок ИЗМЕНЯЕМОГО состояния карты — переживает пересоздание канваса (положение, лицевая
// сторона; сгоревшие карты в снимок не попадают и не воскресают).
interface CardRuntime {
  faceUp: boolean;
  x: number;
  y: number;
}

export interface ViewState {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  scrollX: number;
  thumbX: number;
  scrollableX: boolean;
  scrollY: number;
  thumbY: number;
  scrollableY: boolean;
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.6;
// Чувствительность зума колесом: множитель = exp(-deltaY·ZOOM_SENS) по нормализованному в
// пиксели deltaY. ~0.0015 даёт ~14% на щелчок.
const ZOOM_SENS = 0.0015;

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
    verb: Container;
    cards: Record<Level, Container>;
    shadows: Record<Level, ShadowLayer>;
  };

  private W = 1;
  private H = 1;
  private baseScale = 1;
  private cardW = 1;
  private cardH = 1;
  private contentW = 1;
  private contentH = 1;

  private container!: HTMLElement;
  private view = { x: 0, y: 0, zoom: 1 };
  private cards: Placed[] = [];
  private cardSpecs: CardSpec[] = [];
  private buttons: Button[] = [];
  private zones: Array<{ zone: DropZone; onDrop: (card: Card) => void }> = [];

  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: "none" | "card" | "pan" | "pinch" | "button" = "none";
  private cardDrag: { card: Card; dx: number; dy: number } | null = null;
  private dragScreen = { x: 0, y: 0 }; // экранная позиция пальца при драге — для авто-скролла у кромки
  private pressedButton: Button | null = null;
  private hovered: Button | null = null;
  private panLast = { x: 0, y: 0 };
  private pinch = { dist: 1, zoom: 1, midContentX: 0, midContentY: 0 };
  private onView: ((v: ViewState) => void) | null = null;

  async mount(container: HTMLElement, width: number, height: number): Promise<void> {
    if (this.destroyed) return;
    this.container = container;
    this.W = Math.max(1, Math.round(width));
    this.H = Math.max(1, Math.round(height));
    this.cardH = Math.max(48, Math.min(140, Math.min(this.W, this.H) * 0.16));
    this.baseScale = this.cardH / TEX_H;
    this.cardW = TEX_W * this.baseScale;
    await this.bootApp();
  }

  private async createApp(): Promise<Application | null> {
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
      return null;
    }
    return app;
  }

  private wire(app: Application): void {
    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, this.W, this.H);
    app.stage.on("pointerdown", this.onDown);
    app.stage.on("pointermove", this.onMove);
    app.stage.on("pointerup", this.onUp);
    app.stage.on("pointerupoutside", this.onUp);
    app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  // Поднять новый Pixi-канвас и собрать сцену. restore — снимок состояния карт (для рестарта
  // канваса); без него песочница строится в исходном виде.
  private async bootApp(restore?: Map<number, CardRuntime>): Promise<void> {
    const app = await this.createApp();
    if (!app) return;
    if (this.destroyed) {
      app.destroy({ removeView: true }, { children: true, texture: true });
      return;
    }
    this.container.appendChild(app.canvas);
    this.app = app;
    this.tex = new CardTextureCache(app);

    this.content = new Container();
    app.stage.addChild(this.content);
    this.buildLayers();
    this.buildContent(restore);
    this.wire(app);

    this.clampView();
    this.applyView();
    app.ticker.add(this.tick);
    this.render();
    this.wake();
    this.emitView();
  }

  // Полный сброс песочницы к исходному состоянию (карты, стопки, зоны) — канвас не пересоздаём.
  restartSandbox(): void {
    if (!this.app || this.destroyed) return;
    this.clearContent();
    this.buildContent();
    this.gesture = "none";
    this.clampView();
    this.applyView();
    this.render();
    this.wake();
    this.emitView();
  }

  // Пересоздать сам канвас (свежий WebGL-контекст), СОХРАНИВ состояние песочницы: снимаем
  // положение/лицо живых карт и вид, сносим app, поднимаем новый и восстанавливаемся.
  async restartCanvas(): Promise<void> {
    if (!this.app || this.destroyed) return;
    const snap = this.snapshotCards();
    const savedView = { ...this.view };
    this.teardownApp();
    await this.bootApp(snap);
    if (this.app) {
      this.view = savedView;
      this.clampView();
      this.applyView();
      this.emitView();
    }
  }

  private buildLayers(): void {
    this.layers = {
      surface: new Container(),
      verb: new Container(),
      cards: { idle: new Container(), floating: new Container(), fan: new Container(), drag: new Container() },
      shadows: { idle: new ShadowLayer(), floating: new ShadowLayer(), fan: new ShadowLayer(), drag: new ShadowLayer() },
    };
    const L = this.layers;
    // Слои карт сортируются по zIndex (глубине): после драга карта встаёт на свою глубину,
    // а не поверх всех (addChild дописывает в конец).
    for (const lvl of ["idle", "floating", "fan", "drag"] as const) L.cards[lvl].sortableChildren = true;
    // z-порядок снизу вверх: под каждым уровнем карт — его СЛИТАЯ тень (маска+заливка).
    // Удержание живёт в слоях драга (сверху). Веер — задел.
    this.content.addChild(
      L.surface,
      L.shadows.idle.root,
      L.cards.idle,
      L.shadows.floating.root,
      L.cards.floating,
      L.shadows.fan.root,
      L.verb,
      L.cards.fan,
      L.shadows.drag.root,
      L.cards.drag,
    );
  }

  // Удержание — в слоях драга (сверху); остальные — по своему плану.
  private levelOf(s: CardState): Level {
    if (s === "held" || s === "drag") return "drag";
    if (s === "floating") return "floating";
    if (s === "fan") return "fan";
    return "idle";
  }

  /** Положить карту в слой её текущего плана. Тень рисует слитый ShadowLayer (см. render). */
  private placeCard(card: Card): void {
    this.layers.cards[this.levelOf(card.state)].addChild(card.root);
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

  // Собрать песочницу: мебель (тексты, дропзоны, кнопки) — всегда заново; карты — из спеков,
  // при restore восстанавливая их положение/лицо (рестарт канваса), иначе в исходном виде.
  private buildContent(restore?: Map<number, CardRuntime>): void {
    const pad = 40;
    const gap = this.cardW * 1.15;
    const cellW = this.cardW + gap;
    const capH = 40;
    const titleH = 40;
    const cardCY = pad + titleH + this.cardH / 2;

    // Ряд «Карты — варианты»: копим спеки (позиция+пропсы), рисуем подписи.
    STORIES.forEach((s, i) => {
      const cx = pad + this.cardW / 2 + i * cellW;
      this.cardSpecs.push({ opts: s.opts, home: { x: cx, y: cardCY }, depth: i, bobPhase: i * 0.9 });
      this.layers.surface.addChild(this.label(s.caption, cx, cardCY + this.cardH / 2 + 8, 14, 0x9aa89f, cellW * 0.9));
    });

    const rightEdge = pad + this.cardW / 2 + (STORIES.length - 1) * cellW + this.cardW / 2;
    this.contentW = rightEdge + pad;

    this.layers.surface.addChild(this.label("Карты — варианты", pad, pad, 26, 0xcdb98f, undefined, 0));

    // Стопки (ряд под картами). Первая — левитирующая: 6 карт внахлёст, верхняя справа.
    const stacksBottom = this.buildStacks(pad, cardCY + this.cardH / 2 + capH + 16);

    // Ряд «Дропзоны»: перевернуть и сжечь. Фон+название — на поверхности, глагол — над картами.
    const dzTitleY = stacksBottom + 6;
    this.layers.surface.addChild(this.label("Дропзоны", pad, dzTitleY, 26, 0xcdb98f, undefined, 0));
    const zoneY = dzTitleY + 44;
    const zoneW = this.cardW * 2.4;
    const zoneGap = this.cardW * 0.5;
    this.registerZone(new DropZone({ name: "ПЕРЕВОРОТ", verb: "перевернуть", rect: { x: pad, y: zoneY, w: zoneW, h: this.cardH } }), (c) =>
      c.requestFlip(),
    );
    this.registerZone(new DropZone({ name: "СЖЕЧЬ", verb: "сжечь", rect: { x: pad + zoneW + zoneGap, y: zoneY, w: zoneW, h: this.cardH } }), (c) =>
      c.burn(),
    );

    const buttonsBottom = this.buildButtons(pad, zoneY + this.cardH + 30);
    this.contentH = buttonsBottom + pad;

    // Карты рождаем ПОСЛЕ мебели — чтобы легли поверх подписей/зон.
    this.spawnCards(restore);
  }

  // Кладём зону: фон+название — на поверхность (под картами), глагол — в слой над лежащими картами.
  private registerZone(zone: DropZone, onDrop: (card: Card) => void): void {
    this.zones.push({ zone, onDrop });
    this.layers.surface.addChild(zone.base);
    this.layers.verb.addChild(zone.verb);
  }

  // Живые Card из накопленных спеков. restore — снимок (положение/лицо), сгоревшие пропускаем.
  private spawnCards(restore?: Map<number, CardRuntime>): void {
    this.cardSpecs.forEach((spec, i) => {
      const r = restore?.get(i);
      if (restore && !r) return; // сгоревшую карту при рестарте канваса не воскрешаем
      const card = new Card(r ? { ...spec.opts, faceUp: r.faceUp } : spec.opts, this.tex, this.baseScale);
      card.bobPhase = spec.bobPhase;
      card.root.zIndex = spec.depth;
      card.body.snapTo({ x: r ? r.x : spec.home.x, y: r ? r.y : spec.home.y, rot: 0, scale: card.restScale });
      this.placeCard(card);
      this.cards.push({ card, home: spec.home, depth: spec.depth, specIndex: i });
    });
  }

  private snapshotCards(): Map<number, CardRuntime> {
    const m = new Map<number, CardRuntime>();
    for (const p of this.cards) {
      if (p.card.dead || p.card.burning) continue; // сгоревшие/догорающие не восстанавливаем
      m.set(p.specIndex, { faceUp: p.card.faceUp, x: p.card.body.px, y: p.card.body.py });
    }
    return m;
  }

  // Стопки. Первая — ЛЕВИТИРУЮЩАЯ: 6 карт стоят внахлёст рядом, каждая сдвинута вправо;
  // негласное правило — верхняя карта СПРАВА (правее = выше по z). Без веера/арки/перестановок.
  private buildStacks(left: number, top: number): number {
    this.layers.surface.addChild(this.label("Стопки", left, top, 26, 0xcdb98f, undefined, 0));
    const cy = top + 44 + this.cardH / 2;
    const step = this.cardW * 0.4; // сдвиг соседа вправо (перекрытие)
    const ranks = ["6♦", "7♦", "8♦", "9♦", "10♦", "J♦"];
    ranks.forEach((c, i) => {
      const cx = left + this.cardW / 2 + i * step;
      // правее = глубже по z; сюда карта и вернётся после драга
      this.cardSpecs.push({ opts: { card: c, rest: "floating" }, home: { x: cx, y: cy }, depth: i, bobPhase: i * 0.7 });
    });
    this.layers.surface.addChild(this.label("левитирующая стопка (верхняя справа)", left, cy + this.cardH / 2 + 12, 13, 0x9aa89f));
    return cy + this.cardH / 2 + 44;
  }

  // Витрина кнопок: варианты, размеры, состояние «недоступна» — рядами с подписями.
  private buildButtons(left: number, startY: number): number {
    this.layers.surface.addChild(this.label("Кнопки", left, startY, 26, 0xcdb98f, undefined, 0));
    let y = startY + 48;
    y = this.buttonRow(left, y, [
      { opts: { label: "Основная", variant: "primary" }, cap: "primary" },
      { opts: { label: "Вторичная", variant: "secondary" }, cap: "secondary" },
      { opts: { label: "Опасно", variant: "danger" }, cap: "danger" },
      { opts: { label: "Призрак", variant: "ghost" }, cap: "ghost" },
    ]);
    y = this.buttonRow(left, y, [
      { opts: { label: "Мелкая", size: "sm" }, cap: "sm" },
      { opts: { label: "Средняя", size: "md" }, cap: "md" },
      { opts: { label: "Крупная", size: "lg" }, cap: "lg" },
    ]);
    y = this.buttonRow(left, y, [{ opts: { label: "Недоступна", disabled: true }, cap: "disabled" }]);
    return y;
  }

  private buttonRow(left: number, y: number, items: Array<{ opts: ButtonOptions; cap: string }>): number {
    const gap = 26;
    const made = items.map((it) => ({ b: new Button(it.opts), cap: it.cap }));
    const rowH = Math.max(...made.map((m) => m.b.h));
    let x = left;
    for (const { b, cap } of made) {
      const cx = x + b.w / 2;
      b.place(cx, y + rowH / 2);
      this.layers.surface.addChild(b.root);
      this.buttons.push(b);
      this.layers.surface.addChild(this.label(cap, cx, y + rowH + 8, 13, 0x9aa89f));
      x += b.w + gap;
    }
    return y + rowH + 42;
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

  // Зум колесом — ТОЛЬКО с модификатором (кроссплатформенно): Ctrl на Windows/Linux/Mac или
  // Cmd на Mac. Пинч тачпада браузер шлёт как колесо с ctrlKey — тоже зум. Без модификатора
  // любое колесо/скролл (мышь и тачпад) — это ПАН. Shift не берём: в браузерах это гориз.скролл.
  private wheelIsZoom(e: WheelEvent): boolean {
    return e.ctrlKey || e.metaKey;
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // deltaY в пиксели: в строчном/страничном режиме домножаем.
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * this.H : e.deltaY;
    if (this.wheelIsZoom(e)) {
      const rect = this.app!.canvas.getBoundingClientRect();
      this.zoomAround(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-dy * ZOOM_SENS));
    } else {
      // Тачпад: двумя пальцами тащим канвас (пан), а не зумим.
      this.view.x -= e.deltaX;
      this.view.y -= dy;
      this.clampView();
      this.applyView();
      this.wake();
      this.emitView();
    }
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
    const ch = this.contentH * this.view.zoom;
    const ox = Math.max(0, cw - this.W);
    const oy = Math.max(0, ch - this.H);
    return {
      zoom: this.view.zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      scrollX: ox > 0 ? -this.view.x / ox : 0,
      thumbX: cw > 0 ? Math.min(1, this.W / cw) : 1,
      scrollableX: ox > 1,
      scrollY: oy > 0 ? -this.view.y / oy : 0,
      thumbY: ch > 0 ? Math.min(1, this.H / ch) : 1,
      scrollableY: oy > 1,
    };
  }

  setZoom(z: number): void {
    this.zoomAround(this.W / 2, this.H / 2, clamp(z, MIN_ZOOM, MAX_ZOOM) / this.view.zoom);
  }

  setScrollX(fraction: number): void {
    const overflow = Math.max(0, this.contentW * this.view.zoom - this.W);
    this.view.x = -clamp(fraction, 0, 1) * overflow;
    this.clampView();
    this.applyView();
    this.wake();
    this.emitView();
  }

  setScrollY(fraction: number): void {
    const overflow = Math.max(0, this.contentH * this.view.zoom - this.H);
    this.view.y = -clamp(fraction, 0, 1) * overflow;
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
        this.dragScreen = { x: e.global.x, y: e.global.y };
        card.setState("drag"); // подъём: масштаб/тень едут плавно
        card.root.zIndex = 1e6; // пока тащим — поверх всех в слое драга
        this.placeCard(card); // и переезд в верхний слой
        card.body.setTarget({ x: p.x + this.cardDrag.dx, y: p.y + this.cardDrag.dy, rot: 0 });
      } else {
        const btn = this.hitButton(p.x, p.y);
        if (btn) {
          this.gesture = "button";
          this.pressedButton = btn;
          btn.setPressed(true);
        } else {
          this.gesture = "pan";
          this.panLast = { x: e.global.x, y: e.global.y };
        }
      }
    }
    this.wake();
  };

  private hitButton(cx: number, cy: number): Button | null {
    for (const b of this.buttons) if (b.hitTest(cx, cy)) return b;
    return null;
  }

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
      this.dragScreen = { x: e.global.x, y: e.global.y };
      const p = this.screenToContent(e.global.x, e.global.y);
      this.cardDrag.card.body.setTarget({ x: p.x + this.cardDrag.dx, y: p.y + this.cardDrag.dy, rot: 0 });
      for (const z of this.zones) z.zone.setHot(z.zone.contains(p.x, p.y));
    } else if (this.gesture === "button" && this.pressedButton) {
      // Ушёл пальцем с кнопки — отжимаем; вернулся — снова нажата (клик только при отпускании на ней).
      const p = this.screenToContent(e.global.x, e.global.y);
      this.pressedButton.setPressed(this.pressedButton.hitTest(p.x, p.y));
    } else if (this.gesture === "pan") {
      this.view.x += e.global.x - this.panLast.x;
      this.view.y += e.global.y - this.panLast.y;
      this.panLast = { x: e.global.x, y: e.global.y };
      this.clampView();
      this.applyView();
      this.emitView();
    } else if (this.gesture === "none") {
      // Ховер кнопок (комп): подсветка той, что под курсором.
      const p = this.screenToContent(e.global.x, e.global.y);
      const hovered = this.hitButton(p.x, p.y);
      if (hovered !== this.hovered) {
        this.hovered = hovered;
        for (const b of this.buttons) b.hover(b === hovered);
        this.wake();
      }
    }
  };

  private onUp = (e: { global: { x: number; y: number }; pointerId: number }): void => {
    this.pointers.delete(e.pointerId);
    if (this.gesture === "card" && this.cardDrag) {
      const card = this.cardDrag.card;
      const p = this.screenToContent(e.global.x, e.global.y);
      const hit = this.zones.find((z) => z.zone.contains(p.x, p.y));
      hit?.onDrop(card);
      // Сгорающая карта остаётся на месте (в зоне) и догорает; движок уберёт её сам. Иначе —
      // возврат домой.
      if (!card.burning) this.releaseCard(card);
      this.cardDrag = null;
      for (const z of this.zones) z.zone.setHot(false);
    } else if (this.gesture === "button" && this.pressedButton) {
      const p = this.screenToContent(e.global.x, e.global.y);
      if (this.pressedButton.hitTest(p.x, p.y)) this.pressedButton.click();
      this.pressedButton.setPressed(false);
      this.pressedButton = null;
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

  // Авто-скролл у кромки: пока держишь элемент (карту) у края экрана, вид панится в ту сторону —
  // скорость растёт с глубиной захода в кромку. Карта остаётся ПОД пальцем (пересчёт по экранной
  // точке при новом виде), так что она «уезжает» на открывшуюся область стола.
  private edgeScroll(dt: number): void {
    if (this.gesture !== "card" || !this.cardDrag) return;
    const margin = Math.max(48, Math.min(this.W, this.H) * 0.12);
    const SPEED = 780; // экранных px/сек на самой кромке
    const { x: sx, y: sy } = this.dragScreen;
    const ramp = (d: number): number => {
      const r = clamp(d / margin, 0, 1);
      return r * r; // мягче у границы зоны, резче у самого края
    };
    let dx = 0;
    let dy = 0;
    if (sx < margin) dx = ramp(margin - sx);
    else if (sx > this.W - margin) dx = -ramp(sx - (this.W - margin));
    if (sy < margin) dy = ramp(margin - sy);
    else if (sy > this.H - margin) dy = -ramp(sy - (this.H - margin));
    if (dx === 0 && dy === 0) return;

    const bx = this.view.x;
    const by = this.view.y;
    this.view.x += dx * SPEED * dt;
    this.view.y += dy * SPEED * dt;
    this.clampView();
    if (this.view.x === bx && this.view.y === by) return; // упёрлись в край — двигать нечего
    this.applyView();
    const p = this.screenToContent(sx, sy);
    this.cardDrag.card.body.setTarget({ x: p.x + this.cardDrag.dx, y: p.y + this.cardDrag.dy, rot: 0 });
    for (const z of this.zones) z.zone.setHot(z.zone.contains(p.x, p.y));
    this.emitView();
  }

  private releaseCard(card: Card): void {
    const placed = this.cards.find((c) => c.card === card)!;
    card.setState(card.rest); // возврат в СВОЙ план покоя (стол / левитация / удержание)
    card.root.zIndex = placed.depth; // и на свою глубину — не поверх соседей по стопке
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
    this.edgeScroll(dt);
    let moving = this.gesture !== "none";
    for (const { card } of this.cards) {
      card.step(dt);
      if (!card.resting) moving = true;
    }
    this.reapDead();
    for (const b of this.buttons) {
      b.step(dt);
      if (!b.resting) moving = true;
    }
    this.render();
    if (!moving) this.app.ticker.stop();
  };

  // Убрать догоревшие карты (dead) — уничтожить их узлы и вычистить из списка.
  private reapDead(): void {
    if (!this.cards.some((p) => p.card.dead)) return;
    for (const p of this.cards) if (p.card.dead) p.card.destroy();
    this.cards = this.cards.filter((p) => !p.card.dead);
  }

  // Снести весь контент песочницы (карты + мебель), оставив сами слои — для рестарта песочницы.
  private clearContent(): void {
    for (const p of this.cards) p.card.destroy();
    this.cards = [];
    this.cardSpecs = [];
    this.buttons = [];
    this.zones = [];
    this.cardDrag = null;
    this.pressedButton = null;
    this.hovered = null;
    this.layers.surface.removeChildren().forEach((c) => c.destroy());
    this.layers.verb.removeChildren().forEach((c) => c.destroy());
    for (const lvl of ["idle", "floating", "fan", "drag"] as const) {
      this.layers.cards[lvl].removeChildren();
      this.layers.shadows[lvl].update([], this.contentW, this.contentH);
    }
  }

  private render(): void {
    for (const { card } of this.cards) card.sync();
    for (const b of this.buttons) b.sync();

    // Слитые тени по уровням: силуэты карт уровня → одна маска+заливка (без потемнения наложений).
    const byLevel: Record<Level, ShadowShape[]> = { idle: [], floating: [], fan: [], drag: [] };
    for (const { card } of this.cards) {
      if (card.shadowRect) byLevel[this.levelOf(card.state)].push(card.shadowRect);
    }
    for (const lvl of ["idle", "floating", "fan", "drag"] as const) {
      this.layers.shadows[lvl].update(byLevel[lvl], this.contentW, this.contentH);
    }
  }

  // Снести Pixi-app и живые узлы (для рестарта канваса и окончательного destroy). Логические
  // спеки не сохраняем — при рестарте канваса состояние берётся из снимка ДО вызова.
  private teardownApp(): void {
    if (!this.app) return;
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.ticker.remove(this.tick);
    for (const p of this.cards) p.card.destroy();
    this.cards = [];
    this.cardSpecs = [];
    this.buttons = [];
    this.zones = [];
    this.gesture = "none";
    this.cardDrag = null;
    this.pressedButton = null;
    this.hovered = null;
    this.pointers.clear();
    this.tex?.destroy();
    this.app.destroy({ removeView: true }, { children: true, texture: true });
    this.app = null;
  }

  destroy(): void {
    this.destroyed = true;
    this.teardownApp();
  }
}
