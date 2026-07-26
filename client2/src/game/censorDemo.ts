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

  async mount(host: HTMLElement, width: number, height: number): Promise<void> {
    await ensureFonts();
    const app = await createPixiApp(width, height);
    if (!app) return;
    this.app = app;
    host.appendChild(app.canvas);

    // Статичный эталон = row-shear с НУЛЕВЫМ движением (off=0 у всех рядов) → чистая пиксель-сетка.
    const staticSpec: CensorSpec = { kind: "row-shear", block: 2.4, speedPxSec: 0, flipEverySec: 1, rowBias: 0, swapsPerSec: 0, jitterAmp: 0, jitterFreq: 0, shearMix: 1 };
    const variants: Array<{ label: string; spec: CensorSpec; animated: boolean }> = [
      { label: "статика (пиксели)", spec: staticSpec, animated: false },
      { label: "танец / свапы", spec: CENSOR_PRESETS.swap!, animated: true },
      { label: "ряды ← → (крупно)", spec: CENSOR_PRESETS.shearCoarse!, animated: true },
      { label: "ряды ← → (мельче)", spec: CENSOR_PRESETS.shearFine!, animated: true },
      { label: "комбо (ряды+свапы)", spec: CENSOR_PRESETS.combo!, animated: true },
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
      app.stage.addChild(card);

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

      // Подпись под картой.
      const label = new Text({ text: v.label, style: { fontFamily: PIXEL_FONT, fontSize: 18, fill: 0xe8e0cc } });
      label.anchor.set(0.5, 0);
      label.position.set(x + cardW / 2, y + cardH + 8);
      app.stage.addChild(label);

      x += cardW + gap;
    }

    app.ticker.add(this.tick);
    app.start();
  }

  setSpeed(s: number): void {
    this.speed = s;
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
