import { Application, Container, Graphics, RenderTexture, Text } from "pixi.js";
import { createPixiApp, ensureFonts } from "./engine/canvasHost";
import { CensorField, type CensorSource } from "./engine/censorField";
import { CENSOR_PRESETS, type CensorSpec } from "./censorMotion";
import { COLORS, PIXEL_FONT, TEX_H, TEX_W } from "./engine/constants";
import { FINGER_PATH, FINGER_VIEWBOX, symbolCanvasSvg } from "./symbols";

// ВРЕМЕННАЯ витрина «цензурной» анимации скрытой карты (/censor). Показывает варианты в ряд, чтобы
// выбрать вид глазами. Реального в проде — модули censorMotion.ts + engine/censorField.ts; здесь только
// сборка источника-фака и раскладка карточек. Тестов нет намеренно — визуал сверяет человек.

const AMBER = 0xe8a200;

// Нарисовать фак-«масть» (SVG-силуэт, свой холст 124×171) в контейнер: центр (cx,cy), высота sizePx.
function drawFinger(root: Container, cx: number, cy: number, sizePx: number, flip = false): void {
  const g = new Graphics();
  g.svg(symbolCanvasSvg(FINGER_PATH, AMBER));
  g.pivot.set(FINGER_VIEWBOX.w / 2, FINGER_VIEWBOX.h / 2);
  g.scale.set(sizePx / FINGER_VIEWBOX.h);
  g.position.set(cx, cy);
  if (flip) g.rotation = Math.PI;
  root.addChild(g);
}

// Содержимое лица скрытой карты (без фона): «?» в углах + крупный фак по центру. Тот же макет, что
// makeHiddenFaceTexture, но как ИСТОЧНИК для пикселизации/анимации, а не запечённая текстура.
function buildContent(): Container {
  const content = new Container();
  const makeCorner = (): Container => {
    const c = new Container();
    const r = new Text({ text: "?", style: { fontFamily: PIXEL_FONT, fontSize: 40, fill: AMBER } });
    r.anchor.set(0.5);
    r.position.set(0, -12);
    c.addChild(r);
    drawFinger(c, 0, 20, 22);
    return c;
  };
  const tl = makeCorner();
  tl.position.set(28, 42);
  content.addChild(tl);
  const br = makeCorner();
  br.position.set(TEX_W - 28, TEX_H - 42);
  br.rotation = Math.PI;
  content.addChild(br);
  drawFinger(content, TEX_W / 2, TEX_H / 2 + 6, 118);
  return content;
}

// Извлечь из контента булеву пиксель-сетку под заданный размер блока: рендерим контент в маленькую
// RenderTexture (cols×rows) и читаем альфу. on = где есть контент.
function buildFingerSource(app: Application, block: number): CensorSource {
  const content = buildContent();
  const cols = Math.max(1, Math.round(TEX_W / block));
  const rows = Math.max(1, Math.round(TEX_H / block));
  content.scale.set(cols / TEX_W, rows / TEX_H);
  const rt = RenderTexture.create({ width: cols, height: rows });
  app.renderer.render({ container: content, target: rt });
  const { pixels } = app.renderer.extract.pixels(rt);
  const on: boolean[] = new Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) on[i] = pixels[i * 4 + 3]! > 100;
  content.destroy({ children: true });
  rt.destroy(true);
  return { cols, rows, block, on, color: AMBER };
}

interface DemoCard {
  field: CensorField | null; // null → статичная карточка (эталон)
  animated: boolean;
}

// Живые параметры настраиваемого танца — крутятся слайдерами на странице.
export interface DanceParams {
  block: number; // размер частицы (меньше → больше частиц, чётче)
  swapsPerSec: number; // реже свапы → силуэт цельнее
  jitterAmp: number; // «биас» смещения: меньше → пиксели ближе к дому, читаемее
  jitterFreq: number; // скорость дрожания
}
export const DANCE_DEFAULT: DanceParams = { block: 4, swapsPerSec: 26, jitterAmp: 1, jitterFreq: 6 };

export class CensorDemo {
  private app: Application | null = null;
  private cards: DemoCard[] = [];
  private t = 0;
  private tick = (): void => {
    if (!this.app) return;
    this.t += (this.app.ticker.deltaMS / 1000) * this.speed;
    for (const c of this.cards) if (c.animated) c.field?.update(this.t);
  };
  speed = 1; // глобальный множитель скорости (задел под 1x/2x/слайдер) — просто масштаб времени

  // Мини-камера: весь контент в `world`, жесты двигают/масштабируют его. Не тащим связанный
  // freeDeskEngine ради временной страницы — тут хватает контейнера + пары обработчиков.
  private world = new Container();
  private cam = { scale: 1, x: 0, y: 0 };
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  // Настраиваемый танец: держим карту/маску/спек, чтобы менять параметры вживую (block → пересборка).
  private tunable: { card: Container; mask: Graphics; spec: CensorSpec; cardIdx: number } | null = null;

  async mount(host: HTMLElement, width: number, height: number): Promise<void> {
    await ensureFonts();
    const app = await createPixiApp(width, height);
    if (!app) return;
    this.app = app;
    host.appendChild(app.canvas);
    app.stage.addChild(this.world);

    // Статичный эталон = row-shear с НУЛЕВЫМ движением (off=0 у всех рядов) → чистая пиксель-сетка.
    const staticSpec: CensorSpec = { kind: "row-shear", block: 2.4, speedPxSec: 0, flipEverySec: 1, rowBias: 0, swapsPerSec: 0, jitterAmp: 0, jitterFreq: 0, shearMix: 1 };
    // Настраиваемый танец: swap-dance с дефолтом «чётче» (мельче блок, реже свапы, меньше дрожание).
    const danceSpec: CensorSpec = { kind: "swap-dance", block: DANCE_DEFAULT.block, speedPxSec: 0, flipEverySec: 0.3, rowBias: 0, swapsPerSec: DANCE_DEFAULT.swapsPerSec, jitterAmp: DANCE_DEFAULT.jitterAmp, jitterFreq: DANCE_DEFAULT.jitterFreq, shearMix: 0 };
    const variants: Array<{ label: string; spec: CensorSpec; animated: boolean; tunable?: boolean }> = [
      { label: "статика (пиксели)", spec: staticSpec, animated: false },
      { label: "танец / свапы", spec: CENSOR_PRESETS.swap!, animated: true },
      { label: "ряды ← → (крупно)", spec: CENSOR_PRESETS.shearCoarse!, animated: true },
      { label: "ряды ← → (мельче)", spec: CENSOR_PRESETS.shearFine!, animated: true },
      { label: "комбо (ряды+свапы)", spec: CENSOR_PRESETS.combo!, animated: true },
      { label: "танец ⚙ слайдеры", spec: danceSpec, animated: true, tunable: true },
    ];

    const gap = 34;
    const scale = 1;
    const cardW = TEX_W * scale;
    const cardH = TEX_H * scale;
    let x = 28;
    const y = 40;

    for (const v of variants) {
      const card = new Container();
      card.position.set(x, y);
      card.scale.set(scale);
      this.world.addChild(card);

      // Фон карты + рамка (статичные, чёткие).
      const bg = new Graphics();
      bg.roundRect(0, 0, TEX_W, TEX_H, 16).fill({ color: COLORS.cardFace }).stroke({ width: 2, color: 0xcdbb90 });
      card.addChild(bg);

      const src = buildFingerSource(app, v.spec.block);
      const field = new CensorField(src, v.spec);
      // Центрируем сетку в карте (сетка ≈ TEX по размеру, но округление блоков даёт пару px).
      field.view.position.set((TEX_W - field.width) / 2, (TEX_H - field.height) / 2);
      // Маскируем по форме карты, чтобы сдвиг рядов не вылезал за края.
      const mask = new Graphics();
      mask.roundRect(0, 0, TEX_W, TEX_H, 16).fill({ color: 0xffffff });
      card.addChild(mask);
      field.view.mask = mask;
      card.addChild(field.view);
      field.update(0); // первый статичный кадр

      this.cards.push({ field, animated: v.animated });
      if (v.tunable) this.tunable = { card, mask, spec: v.spec, cardIdx: this.cards.length - 1 };

      // Подпись под картой.
      const label = new Text({ text: v.label, style: { fontFamily: PIXEL_FONT, fontSize: 18, fill: 0xe8e0cc } });
      label.anchor.set(0.5, 0);
      label.position.set(x + cardW / 2, y + cardH + 8);
      this.world.addChild(label);

      x += cardW + gap;
    }

    // Фит-по-ширине: на входе весь ряд помещается в экран (на телефоне видно все 5 карт).
    const contentW = x; // правый край последней карты + запас справа
    const pad = 14;
    const s0 = Math.min(1, (width - pad) / contentW);
    this.cam = { scale: s0, x: Math.max(pad, (width - contentW * s0) / 2), y: 8 };
    this.applyCam();
    this.bindCamera(app.canvas);

    app.ticker.add(this.tick);
    app.start();
  }

  private applyCam(): void {
    this.world.scale.set(this.cam.scale);
    this.world.position.set(this.cam.x, this.cam.y);
  }

  // Драг-пан (1 палец) + пинч-зум (2 пальца) + колесо (десктоп). Зум вокруг точки под курсором/центром.
  private bindCamera(canvas: HTMLCanvasElement): void {
    canvas.style.touchAction = "none";
    const zoomAt = (sx: number, sy: number, factor: number): void => {
      const ns = Math.max(0.15, Math.min(4, this.cam.scale * factor));
      const wx = (sx - this.cam.x) / this.cam.scale;
      const wy = (sy - this.cam.y) / this.cam.scale;
      this.cam.scale = ns;
      this.cam.x = sx - wx * ns;
      this.cam.y = sy - wy * ns;
      this.applyCam();
    };
    const mid = (): { x: number; y: number } => {
      const p = [...this.pointers.values()];
      return { x: (p[0]!.x + p[1]!.x) / 2, y: (p[0]!.y + p[1]!.y) / 2 };
    };
    const dist = (): number => {
      const p = [...this.pointers.values()];
      return Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y);
    };
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (this.pointers.size === 2) this.pinchDist = dist();
    });
    canvas.addEventListener("pointermove", (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const now = { x: e.offsetX, y: e.offsetY };
      if (this.pointers.size === 1) {
        this.cam.x += now.x - prev.x; // пан
        this.cam.y += now.y - prev.y;
        this.applyCam();
      }
      this.pointers.set(e.pointerId, now);
      if (this.pointers.size === 2 && this.pinchDist > 0) {
        const d = dist();
        const m = mid();
        zoomAt(m.x, m.y, d / this.pinchDist); // пинч
        this.pinchDist = d;
      }
    });
    const up = (e: PointerEvent): void => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
  }

  setSpeed(s: number): void {
    this.speed = s;
  }

  // Ререндер: перезапуск с t=0 + новый узор свапов (seed) у всех полей.
  private rerenderCount = 0;
  rerender(): void {
    this.t = 0;
    this.rerenderCount++;
    for (const c of this.cards) {
      c.field?.reset(this.rerenderCount * 100003); // простое смещение → непересекающаяся последовательность
      c.field?.update(0);
    }
  }

  // Живая настройка «танец ⚙». swaps/jitter — просто мутируем спек (CensorField читает его каждый кадр).
  // block меняет размер частиц → нужна пересборка источника-сетки и поля (в той же карте/маске).
  updateDance(p: Partial<DanceParams>): void {
    const t = this.tunable;
    if (!t || !this.app) return;
    if (p.swapsPerSec !== undefined) t.spec.swapsPerSec = p.swapsPerSec;
    if (p.jitterAmp !== undefined) t.spec.jitterAmp = p.jitterAmp;
    if (p.jitterFreq !== undefined) t.spec.jitterFreq = p.jitterFreq;
    if (p.block !== undefined && p.block !== t.spec.block) {
      t.spec.block = p.block;
      this.cards[t.cardIdx]?.field?.destroy();
      const src = buildFingerSource(this.app, p.block);
      const field = new CensorField(src, t.spec);
      field.view.position.set((TEX_W - field.width) / 2, (TEX_H - field.height) / 2);
      field.view.mask = t.mask;
      t.card.addChild(field.view);
      this.cards[t.cardIdx] = { field, animated: true };
    }
  }

  destroy(): void {
    if (!this.app) return;
    this.app.ticker.remove(this.tick);
    for (const c of this.cards) c.field?.destroy();
    this.cards = [];
    this.app.destroy(true, { children: true });
    this.app = null;
  }
}
