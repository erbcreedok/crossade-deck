import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";
import { CardTextureCache } from "../ui/CardTextureCache";
import { Card, type CardOptions, type CardState, type ShadowShape } from "../ui/Card";
import { DropZone } from "../ui/DropZone";
import { Button, type ButtonOptions } from "../ui/Button";
import { SceneLayers, levelOf } from "./sceneLayers";
import type { TableElement } from "./element";
import { Viewport, type ViewState } from "./viewport";
import { createPixiApp, ensureFonts } from "./canvasHost";
import { InputRouter, type InputHandlers } from "./inputRouter";
import { DRAG_SCALE, PIXEL_FONT, TEX_H, TEX_W } from "./constants";

export type { ViewState };

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

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.6;
const BLOCK_PAD = 16; // внутренний отступ рамки блока «Управление»
const BLOCK_GAP = 12; // зазор между текст-кнопкой (названием) и картами блока
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

  private scene!: SceneLayers;

  private W = 1;
  private H = 1;
  private baseScale = 1;
  private cardW = 1;
  private cardH = 1;
  private contentW = 1;
  private contentH = 1;

  private container!: HTMLElement;
  private viewport = new Viewport(MIN_ZOOM, MAX_ZOOM);
  private cards: Placed[] = [];
  private cardSpecs: CardSpec[] = [];
  private controlCards: Card[] = []; // карты раздела «Управление» — двигаются API, не драгом
  private byId = new Map<string, Card>(); // реестр по id для публичного API
  private stackMove: { a: string[]; b: string[]; ax: number; bx: number; y: number; toB: boolean } | null = null;
  private buttons: Button[] = [];
  private zones: Array<{ zone: DropZone; onDrop: (card: Card) => void }> = [];

  private input = new InputRouter<Card, Button>(this.inputHandlers());
  private cardDrag: { card: Card; dx: number; dy: number } | null = null;
  private dragScreen = { x: 0, y: 0 }; // экранная позиция пальца при драге — для авто-скролла у кромки
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
  // канваса); без него песочница строится в исходном виде. Шрифты ждём до отрисовки (canvasHost).
  private async bootApp(restore?: Map<number, CardRuntime>): Promise<void> {
    await ensureFonts();
    if (this.destroyed) return;
    const app = await createPixiApp(this.W, this.H);
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
    this.input.reset();
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
    const savedView = { x: this.viewport.x, y: this.viewport.y, zoom: this.viewport.zoom };
    this.teardownApp();
    await this.bootApp(snap);
    if (this.app) {
      this.viewport.x = savedView.x;
      this.viewport.y = savedView.y;
      this.viewport.zoom = savedView.zoom;
      this.clampView();
      this.applyView();
      this.emitView();
    }
  }

  private buildLayers(): void {
    this.scene = new SceneLayers(this.content);
  }

  /** Положить элемент в слой его текущего плана. Тень рисует слитый ShadowLayer (см. render). */
  private placeCard(el: TableElement): void {
    this.scene.place(el.root, levelOf(el.state));
  }

  // ——— контент ———

  private label(text: string, x: number, y: number, size: number, fill: number, wrap?: number, anchorX = 0.5): Text {
    const t = new Text({
      text,
      style: { fontFamily: PIXEL_FONT, fontSize: size, fill, align: "center", wordWrap: wrap !== undefined, wordWrapWidth: wrap ?? 0 },
    });
    t.anchor.set(anchorX, 0);
    t.position.set(x, y);
    // На узком экране длинное слово без пробелов (напр. «удерживаемая») перенос не ловит и
    // вылезает за свою ячейку, налезая на соседа. Гарантия: если подпись всё же шире ячейки —
    // ужимаем её ровно до ширины (масштаб вокруг якоря, центровка под картой сохраняется).
    if (wrap !== undefined && t.width > wrap) t.scale.set(wrap / t.width);
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
      this.scene.surface.addChild(this.label(s.caption, cx, cardCY + this.cardH / 2 + 8, 14, 0x9aa89f, cellW * 0.9));
    });

    const rightEdge = pad + this.cardW / 2 + (STORIES.length - 1) * cellW + this.cardW / 2;
    this.contentW = rightEdge + pad;

    this.scene.surface.addChild(this.label("Карты — варианты", pad, pad, 26, 0xcdb98f, undefined, 0));

    // Стопки (ряд под картами). Первая — левитирующая: 6 карт внахлёст, верхняя справа.
    const stacksBottom = this.buildStacks(pad, cardCY + this.cardH / 2 + capH + 16);

    // Ряд «Дропзоны»: перевернуть и сжечь. Фон+название — на поверхности, глагол — над картами.
    const dzTitleY = stacksBottom + 6;
    this.scene.surface.addChild(this.label("Дропзоны", pad, dzTitleY, 26, 0xcdb98f, undefined, 0));
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

    // Раздел «Управление» — демонстрация публичного API (карты двигает движок, не палец).
    const controlBottom = this.buildControls(pad, buttonsBottom + 24);
    this.contentH = controlBottom + pad;

    // Карты рождаем ПОСЛЕ мебели — чтобы легли поверх подписей/зон.
    this.spawnCards(restore);
  }

  // ——— публичное API доски (то, чем СЕРВЕР или скрытая логика юзера двигает карты) ———
  // Все движения — та же пружина, что и при драге. Одиночные вызовы или пачкой (см. doStackMove).

  /** Перевернуть карту по id (напр. «игрок открыл карту»). */
  flipCard(id: string): void {
    if (this.byId.get(id)?.requestFlip()) this.wake();
  }

  /** Плавно (пружиной) переместить карту по id в точку контента (напр. «перенёс в дропзону»). */
  moveCard(id: string, x: number, y: number): void {
    const c = this.byId.get(id);
    if (!c) return;
    c.body.setTarget({ x, y, rot: 0 });
    this.wake();
  }

  // ——— раздел «Управление» (демо API) ———

  private buildControls(left: number, top: number): number {
    this.scene.surface.addChild(this.label("Управление", left, top, 26, 0xcdb98f, undefined, 0));
    let y = top + 46;
    y = this.buildFlipBlock(left, y) + 22;
    y = this.buildMoveBlock(left, y);
    return y;
  }

  // Блок 1: текст-кнопка «перевернуть карту» — по тапу переворачивает карту внутри блока.
  // Бокс подгоняется под контент (fit): ширина = max(кнопка, карта) + отступы.
  private buildFlipBlock(left: number, top: number): number {
    const btn = this.textButton("перевернуть карту", () => this.flipCard("ctl-flip"));
    const contentW = Math.max(btn.w, this.cardW);
    const boxW = contentW + BLOCK_PAD * 2;
    const boxH = BLOCK_PAD + btn.h + BLOCK_GAP + this.cardH + BLOCK_PAD;
    this.blockFrame(left, top, boxW, boxH);
    const cx = left + boxW / 2;
    btn.place(cx, top + BLOCK_PAD + btn.h / 2);
    this.registerButton(btn);
    const card = new Card({ id: "ctl-flip", card: "A♥", rest: "idle" }, this.tex, this.baseScale);
    card.body.snapTo({ x: cx, y: top + BLOCK_PAD + btn.h + BLOCK_GAP + this.cardH / 2, rot: 0, scale: card.restScale });
    this.addControlCard(card);
    return top + boxH;
  }

  // Блок 2: две стопки (5 и 4). Тап — случайная карта летит из одной в другую и остаётся там;
  // следующий тап — случайная летит обратно. Направление чередуется. Бокс подгоняется под контент.
  private buildMoveBlock(left: number, top: number): number {
    const step = this.cardW * 0.4;
    const footprint = this.cardW + 4 * step; // до 5 карт внахлёст
    const stacksGap = this.cardW * 0.7;
    const stacksW = footprint * 2 + stacksGap;
    const btn = this.textButton("перенос из стопки в стопку", () => this.doStackMove());
    const contentW = Math.max(btn.w, stacksW);
    const boxW = contentW + BLOCK_PAD * 2;
    const boxH = BLOCK_PAD + btn.h + BLOCK_GAP + this.cardH + BLOCK_PAD;
    this.blockFrame(left, top, boxW, boxH);
    const cx = left + boxW / 2;
    btn.place(cx, top + BLOCK_PAD + btn.h / 2);
    this.registerButton(btn);
    const y = top + BLOCK_PAD + btn.h + BLOCK_GAP + this.cardH / 2;
    const groupLeft = left + (boxW - stacksW) / 2; // группа стопок по центру блока
    const ax = groupLeft;
    const bx = groupLeft + footprint + stacksGap;
    const a = ["6♣", "7♣", "8♣", "9♣", "10♣"].map((r, i) => this.makeStackCard(`sa${i}`, r));
    const b = ["6♦", "7♦", "8♦", "9♦"].map((r, i) => this.makeStackCard(`sb${i}`, r));
    this.stackMove = { a, b, ax, bx, y, toB: true };
    this.relayoutStack(a, ax, y, true);
    this.relayoutStack(b, bx, y, true);
    return top + boxH;
  }

  private doStackMove(): void {
    const s = this.stackMove;
    if (!s) return;
    const [from, to, fromX, toX] = s.toB ? [s.a, s.b, s.ax, s.bx] : [s.b, s.a, s.bx, s.ax];
    if (from.length > 0) {
      const [id] = from.splice(Math.floor(Math.random() * from.length), 1); // случайная карта
      to.push(id); // ложится сверху (правее)
      this.relayoutStack(from, fromX, s.y);
      this.relayoutStack(to, toX, s.y);
    }
    s.toB = !s.toB; // следующий тап — в обратную сторону
  }

  // Разложить стопку: i-я карта левее→правее, правее = выше по z. snap — при первичной раскладке.
  private relayoutStack(ids: string[], originX: number, y: number, snap = false): void {
    const step = this.cardW * 0.4;
    ids.forEach((id, i) => {
      const c = this.byId.get(id);
      if (!c) return;
      c.root.zIndex = i;
      const x = originX + this.cardW / 2 + i * step;
      if (snap) c.body.snapTo({ x, y, rot: 0, scale: c.restScale });
      else this.moveCard(id, x, y);
    });
    this.wake();
  }

  private makeStackCard(id: string, rank: string): string {
    const card = new Card({ id, card: rank, rest: "idle" }, this.tex, this.baseScale);
    this.addControlCard(card);
    return id;
  }

  private addControlCard(card: Card): void {
    this.controlCards.push(card);
    if (card.id) this.byId.set(card.id, card);
    this.placeCard(card);
  }

  private textButton(label: string, onClick: () => void): Button {
    return new Button({ label, variant: "text", onClick }); // размещает вызывающий блок
  }

  private registerButton(b: Button): void {
    this.buttons.push(b);
    this.scene.surface.addChild(b.root);
  }

  private blockFrame(x: number, y: number, w: number, h: number): void {
    const g = new Graphics();
    g.roundRect(x, y, w, h, 12)
      .fill({ color: 0x000000, alpha: 0.1 })
      .stroke({ width: 1, color: 0x4a5b50 });
    this.scene.surface.addChild(g);
  }

  // Кладём зону: фон+название — на поверхность (под картами), глагол — в слой над лежащими картами.
  private registerZone(zone: DropZone, onDrop: (card: Card) => void): void {
    this.zones.push({ zone, onDrop });
    this.scene.surface.addChild(zone.base);
    this.scene.verb.addChild(zone.verb);
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
    this.scene.surface.addChild(this.label("Стопки", left, top, 26, 0xcdb98f, undefined, 0));
    const cy = top + 44 + this.cardH / 2;
    const step = this.cardW * 0.4; // сдвиг соседа вправо (перекрытие)
    const ranks = ["6♦", "7♦", "8♦", "9♦", "10♦", "J♦"];
    ranks.forEach((c, i) => {
      const cx = left + this.cardW / 2 + i * step;
      // правее = глубже по z; сюда карта и вернётся после драга
      this.cardSpecs.push({ opts: { card: c, rest: "floating" }, home: { x: cx, y: cy }, depth: i, bobPhase: i * 0.7 });
    });
    this.scene.surface.addChild(this.label("левитирующая стопка (верхняя справа)", left, cy + this.cardH / 2 + 12, 13, 0x9aa89f, undefined, 0));
    return cy + this.cardH / 2 + 44;
  }

  // Витрина кнопок: варианты, размеры, состояние «недоступна» — рядами с подписями.
  private buildButtons(left: number, startY: number): number {
    this.scene.surface.addChild(this.label("Кнопки", left, startY, 26, 0xcdb98f, undefined, 0));
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
      this.scene.surface.addChild(b.root);
      this.buttons.push(b);
      this.scene.surface.addChild(this.label(cap, cx, y + rowH + 8, 13, 0x9aa89f));
      x += b.w + gap;
    }
    return y + rowH + 42;
  }

  // ——— вьюпорт ———

  // Синхронизировать границы камеры перед операцией (экран/контент меняются в mount/buildContent).
  private syncVp(): void {
    this.viewport.setScreen(this.W, this.H);
    this.viewport.setContent(this.contentW, this.contentH);
  }

  private screenToContent(sx: number, sy: number): { x: number; y: number } {
    return this.viewport.screenToContent(sx, sy);
  }

  private clampView(): void {
    this.syncVp();
    this.viewport.clamp();
  }

  private applyView(): void {
    this.content.position.set(this.viewport.x, this.viewport.y);
    this.content.scale.set(this.viewport.zoom);
  }

  private zoomAround(sx: number, sy: number, factor: number): void {
    this.syncVp();
    this.viewport.zoomAround(sx, sy, factor);
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
      this.syncVp();
      this.viewport.panBy(-e.deltaX, -dy);
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
    this.syncVp();
    return this.viewport.state();
  }

  setZoom(z: number): void {
    this.syncVp();
    this.viewport.setZoom(z);
    this.applyView();
    this.wake();
    this.emitView();
  }

  setScrollX(fraction: number): void {
    this.syncVp();
    this.viewport.setScrollX(fraction);
    this.applyView();
    this.wake();
    this.emitView();
  }

  setScrollY(fraction: number): void {
    this.syncVp();
    this.viewport.setScrollY(fraction);
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

  private hitButton(cx: number, cy: number): Button | null {
    for (const b of this.buttons) if (b.hitTest(cx, cy)) return b;
    return null;
  }

  // Ввод: стейт-машину ведёт InputRouter, движок лишь форвардит события и отдаёт домен в колбэки.
  private onDown = (e: { global: { x: number; y: number }; pointerId: number }): void =>
    this.input.down(e.pointerId, e.global.x, e.global.y);
  private onMove = (e: { global: { x: number; y: number }; pointerId: number }): void =>
    this.input.move(e.pointerId, e.global.x, e.global.y);
  private onUp = (e: { global: { x: number; y: number }; pointerId: number }): void =>
    this.input.up(e.pointerId, e.global.x, e.global.y);

  // Хит-тесты и реакции на жесты (домен). Стейт-машина — в InputRouter.
  private inputHandlers(): InputHandlers<Card, Button> {
    return {
      screenToContent: (sx, sy) => this.screenToContent(sx, sy),
      pickCard: (cx, cy) => this.hitCard(cx, cy),
      cardDraggable: (c) => c.draggable,
      pickButton: (cx, cy) => this.hitButton(cx, cy),
      buttonContains: (b, cx, cy) => b.hitTest(cx, cy),
      onCardGrab: (card, cp, sp) => {
        this.cardDrag = { card, dx: card.body.px - cp.x, dy: card.body.py - cp.y };
        this.dragScreen = { x: sp.x, y: sp.y };
        card.setState("drag"); // подъём: масштаб/тень едут плавно
        card.root.zIndex = 1e6; // пока тащим — поверх всех
        this.placeCard(card);
        card.body.setTarget({ x: cp.x + this.cardDrag.dx, y: cp.y + this.cardDrag.dy, rot: 0 });
      },
      onCardMove: (card, cp, sp) => {
        this.dragScreen = { x: sp.x, y: sp.y };
        if (this.cardDrag) card.body.setTarget({ x: cp.x + this.cardDrag.dx, y: cp.y + this.cardDrag.dy, rot: 0 });
        for (const z of this.zones) z.zone.setHot(z.zone.contains(cp.x, cp.y));
      },
      onCardDrop: (card, cp) => {
        const hit = this.zones.find((z) => z.zone.contains(cp.x, cp.y));
        hit?.onDrop(card);
        // Сгорающая остаётся догорать на месте; иначе — возврат домой.
        if (!card.burning) this.releaseCard(card);
        this.cardDrag = null;
        for (const z of this.zones) z.zone.setHot(false);
      },
      onCardCancel: (card) => {
        this.releaseCard(card);
        this.cardDrag = null;
      },
      onCardBlocked: (card) => card.blockNudge(),
      onButtonDown: (b) => b.setPressed(true),
      onButtonMove: (b, inside) => b.setPressed(inside),
      onButtonUp: (b, inside) => {
        if (inside) b.click();
        b.setPressed(false);
      },
      onPan: (dx, dy) => {
        this.syncVp();
        this.viewport.panBy(dx, dy);
        this.applyView();
        this.emitView();
      },
      onPinchStart: (mx, my, dist) => {
        const c = this.screenToContent(mx, my);
        this.pinch = { dist, zoom: this.viewport.zoom, midContentX: c.x, midContentY: c.y };
      },
      onPinch: (mx, my, dist) => {
        this.viewport.zoom = clamp((this.pinch.zoom * dist) / this.pinch.dist, MIN_ZOOM, MAX_ZOOM);
        this.viewport.x = mx - this.pinch.midContentX * this.viewport.zoom;
        this.viewport.y = my - this.pinch.midContentY * this.viewport.zoom;
        this.clampView();
        this.applyView();
        this.emitView();
      },
      onHover: (b) => {
        for (const btn of this.buttons) btn.hover(btn === b);
        this.wake();
      },
      afterAny: () => this.wake(),
    };
  }

  // Авто-скролл у кромки: пока держишь элемент (карту) у края экрана, вид панится в ту сторону —
  // скорость растёт с глубиной захода в кромку. Карта остаётся ПОД пальцем (пересчёт по экранной
  // точке при новом виде), так что она «уезжает» на открывшуюся область стола.
  private edgeScroll(dt: number): void {
    if (this.input.gesture !== "drag" || !this.cardDrag) return;
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

    const bx = this.viewport.x;
    const by = this.viewport.y;
    this.viewport.x += dx * SPEED * dt;
    this.viewport.y += dy * SPEED * dt;
    this.clampView();
    if (this.viewport.x === bx && this.viewport.y === by) return; // упёрлись в край — двигать нечего
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
    let moving = this.input.gesture !== "none";
    for (const card of this.everyCard()) {
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
    for (const c of this.controlCards) c.destroy();
    this.cards = [];
    this.cardSpecs = [];
    this.controlCards = [];
    this.byId.clear();
    this.stackMove = null;
    this.buttons = [];
    this.zones = [];
    this.cardDrag = null;
    this.input.reset();
    this.scene.surface.removeChildren().forEach((c) => c.destroy());
    this.scene.verb.removeChildren().forEach((c) => c.destroy());
    this.scene.clearCards(this.contentW, this.contentH);
  }

  // Все карты сцены: перетаскиваемые (this.cards) + управляемые API (control). Для шага/рендера/
  // теней; драг-хит-тест (hitCard) работает только по this.cards — control картами двигает API.
  private everyCard(): Card[] {
    const out: Card[] = this.controlCards.slice();
    for (const p of this.cards) out.push(p.card);
    return out;
  }

  private render(): void {
    for (const card of this.everyCard()) card.sync();
    for (const b of this.buttons) b.sync();

    // Слитые тени по уровням: силуэты карт уровня → одна маска+заливка (без потемнения наложений).
    const shadows = this.everyCard()
      .filter((c) => c.shadowRect)
      .map((c) => ({ level: levelOf(c.state), rect: c.shadowRect! }));
    this.scene.paintShadows(shadows, this.contentW, this.contentH);
  }

  // Снести Pixi-app и живые узлы (для рестарта канваса и окончательного destroy). Логические
  // спеки не сохраняем — при рестарте канваса состояние берётся из снимка ДО вызова.
  private teardownApp(): void {
    if (!this.app) return;
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.ticker.remove(this.tick);
    for (const p of this.cards) p.card.destroy();
    for (const c of this.controlCards) c.destroy();
    this.cards = [];
    this.cardSpecs = [];
    this.controlCards = [];
    this.byId.clear();
    this.stackMove = null;
    this.buttons = [];
    this.zones = [];
    this.cardDrag = null;
    this.input.reset();
    this.tex?.destroy();
    this.app.destroy({ removeView: true }, { children: true, texture: true });
    this.app = null;
  }

  destroy(): void {
    this.destroyed = true;
    this.teardownApp();
  }
}
