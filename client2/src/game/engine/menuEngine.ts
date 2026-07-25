import { Application, Container, Rectangle, Text } from "pixi.js";
import { Button } from "../ui/Button";
import { PIXEL_FONT } from "./constants";

// Главное меню — целиком на канвасе. Две кнопки по центру:
//  • «сосать» — кричит лейбл «соссаааатть»: появляется из центра (scale 0→1 с проскоком),
//    дрожит, затем уходит ВПЕРЁД ПО ГЛУБИНЕ (scale растёт, alpha гаснет — «летит на зрителя»);
//  • вторая — открывает песочницу (колбэк наружу → навигация).
// Ввод кнопок ведёт сам движок (hitTest + hover/press/click), как в песочнице.

const SHOUT_DUR = 1.15; // сек: появление → крик/дрожь → улёт вперёд
const SHOUT_APPEAR = 0.16;
const SHOUT_FORWARD = 0.5;

function easeOutBack(p: number): number {
  const s = 1.7;
  const q = p - 1;
  return 1 + q * q * ((s + 1) * q + s);
}

export class MenuEngine {
  private app: Application | null = null;
  private destroyed = false;
  private W = 1;
  private H = 1;
  private root!: Container;
  private buttons: Button[] = [];
  private shoutText!: Text;
  private shout: { t: number } | null = null;
  private onOpenSandbox: (() => void) | null = null;

  private pressed: Button | null = null;
  private hovered: Button | null = null;

  setOnOpenSandbox(cb: () => void): void {
    this.onOpenSandbox = cb;
  }

  async mount(container: HTMLElement, width: number, height: number): Promise<void> {
    if (this.destroyed) return;
    this.W = Math.max(1, Math.round(width));
    this.H = Math.max(1, Math.round(height));
    await this.ensureFonts();
    if (this.destroyed) return;

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

    this.root = new Container();
    app.stage.addChild(this.root);
    this.build();

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

  // Pixi рисует текст в текстуру один раз — ждём веб-шрифт (VT323) до отрисовки (см. песочницу).
  private async ensureFonts(): Promise<void> {
    const f = (document as unknown as { fonts?: FontFaceSet }).fonts;
    if (!f) return;
    try {
      await Promise.all([f.load("16px VT323"), f.load('16px "Press Start 2P"')]);
      await f.ready;
    } catch {
      /* оффлайн — рисуем фолбэком */
    }
  }

  private build(): void {
    const cx = this.W / 2;
    const cy = this.H / 2;
    const suck = new Button({ label: "сосать", variant: "primary", size: "lg", onClick: () => this.startShout() });
    suck.place(cx, cy - 36);
    const sandbox = new Button({ label: "песочница", variant: "secondary", size: "lg", onClick: () => this.onOpenSandbox?.() });
    sandbox.place(cx, cy + 36);
    this.buttons = [suck, sandbox];
    for (const b of this.buttons) this.root.addChild(b.root);

    // Лейбл-крик — ПОВЕРХ всего, скрыт до вызова.
    this.shoutText = new Text({
      text: "соссаааатть",
      style: {
        fontFamily: PIXEL_FONT,
        fontSize: Math.min(this.W, this.H) * 0.14,
        fill: 0xf2c14e,
        align: "center",
        dropShadow: { color: 0x000000, alpha: 0.6, blur: 4, distance: 3, angle: Math.PI / 4 },
      },
    });
    this.shoutText.anchor.set(0.5);
    this.shoutText.position.set(cx, cy);
    this.shoutText.visible = false;
    this.app!.stage.addChild(this.shoutText);
  }

  private startShout(): void {
    this.shout = { t: 0 };
    this.shoutText.visible = true;
    this.wake();
  }

  // ——— ввод ———

  private hit(x: number, y: number): Button | null {
    for (const b of this.buttons) if (b.hitTest(x, y)) return b;
    return null;
  }

  private onDown = (e: { global: { x: number; y: number } }): void => {
    const b = this.hit(e.global.x, e.global.y);
    if (b) {
      this.pressed = b;
      b.setPressed(true);
    }
    this.wake();
  };

  private onMove = (e: { global: { x: number; y: number } }): void => {
    if (this.pressed) {
      this.pressed.setPressed(this.pressed.hitTest(e.global.x, e.global.y));
    } else {
      const b = this.hit(e.global.x, e.global.y);
      if (b !== this.hovered) {
        this.hovered = b;
        for (const x of this.buttons) x.hover(x === b);
        this.wake();
      }
    }
  };

  private onUp = (e: { global: { x: number; y: number } }): void => {
    if (this.pressed) {
      if (this.pressed.hitTest(e.global.x, e.global.y)) this.pressed.click();
      this.pressed.setPressed(false);
      this.pressed = null;
    }
    this.wake();
  };

  // ——— цикл ———

  private wake(): void {
    if (this.app && !this.app.ticker.started) this.app.ticker.start();
  }

  private tick = (): void => {
    if (!this.app) return;
    const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05);
    let moving = false;
    for (const b of this.buttons) {
      b.step(dt);
      if (!b.resting) moving = true;
    }
    if (this.shout) {
      this.shout.t += dt;
      if (this.shout.t >= SHOUT_DUR) {
        this.shout = null;
        this.shoutText.visible = false;
      } else {
        moving = true;
      }
    }
    this.render();
    if (!moving) this.app.ticker.stop();
  };

  private render(): void {
    for (const b of this.buttons) b.sync();
    this.syncShout();
  }

  private syncShout(): void {
    if (!this.shout) return;
    const t = this.shout.t;
    let scale = 1;
    let alpha = 1;
    if (t < SHOUT_APPEAR) {
      scale = easeOutBack(t / SHOUT_APPEAR); // 0→1 с лёгким проскоком (из центра)
    } else if (t < SHOUT_FORWARD) {
      scale = 1; // держим и дрожим
    } else {
      const p = (t - SHOUT_FORWARD) / (SHOUT_DUR - SHOUT_FORWARD);
      scale = 1 + p * p * 2.6; // ускоряющийся вылет ВПЕРЁД по глубине
      alpha = 1 - p * p; // и растворение
    }
    // Дрожь — постоянно, крупнее с масштабом.
    const amp = Math.min(this.W, this.H) * 0.013 * scale;
    const jx = Math.sin(t * 80) * amp + Math.sin(t * 53) * amp * 0.5;
    const jy = Math.cos(t * 67) * amp;
    this.shoutText.scale.set(scale);
    this.shoutText.alpha = alpha;
    this.shoutText.position.set(this.W / 2 + jx, this.H / 2 + jy);
  }

  destroy(): void {
    this.destroyed = true;
    if (!this.app) return;
    this.app.ticker.remove(this.tick);
    this.app.destroy({ removeView: true }, { children: true, texture: true });
    this.app = null;
  }
}
