import { Application, Container, Graphics, Text } from "pixi.js";
import { CanvasApp } from "./engine/canvasApp";
import { CensorField } from "./engine/censorField";
import { buildFingerDustPoints, buildFingerGrid } from "./engine/censorSource";
import { GpuCensorCard } from "./engine/censorGpu";
import { ParticleField } from "./engine/censorParticles";
import { attachPanZoom, type PanZoomHandle } from "./engine/panZoom";
import { CENSOR_PRESETS, type CensorSpec } from "./censorMotion";
import type { ReduceMotionOverride } from "./anim/reduceMotion";
import type { ReduceFlashOverride } from "./anim/reduceFlash";
import type { ProfileOverride } from "./anim/quality";
import { COLORS, PIXEL_FONT, TEX_H, TEX_W } from "./engine/constants";
import { DANCE_DEFAULT, DUST_FLICKER, dustParams, type DanceParams } from "./censorConfig";
import { Button } from "./ui/Button";
import { attachControls, type Configurable, type Param } from "./ui/controls";
import type { ViewState } from "./engine/viewport";

// Стенд анимаций «/motion» — ЦЕЛИКОМ на канвасе (как весь client2). Секции-тесткейсы с заголовками,
// у каждой свои контролы (Stepper/Toggle) прямо в сцене; пан/зам — общий приклеиваемый attachPanZoom
// (тот же жест, что в песочнице). Единственный DOM — топбар-навигация и скроллбары (как в песочнице).

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
// Порядок вариантов сегмента «профиль» ↔ ProfileOverride (индекс в тумблере).
const PROFILE_OPTS: ProfileOverride[] = ["auto", "full", "reduced"];

interface DemoCard {
  field: CensorField | null;
  animated: boolean;
  live?: () => boolean; // доп. условие анимации (напр. «тряска только когда играет»)
}

export class CensorDemo extends CanvasApp {
  private content = new Container();
  private pz: PanZoomHandle | null = null;

  private cards: DemoCard[] = [];
  private gpuCards: GpuCensorCard[] = [];
  private particleCards: ParticleField[] = [];
  private buttons: Button[] = []; // все Button (в т.ч. внутри Stepper/Toggle) — для арбитража ввода

  private dance: DanceParams = { ...DANCE_DEFAULT };
  private speed = 1;
  // reduceMotion — поле базового CanvasApp (issue #7). Тумблер ниже — источник ОВЕРРАЙДА
  // поверх OS: React-хост резолвит auto/on через useReducedMotion и зовёт setReduceMotion().
  private override: ReduceMotionOverride = "auto";
  private onOverrideChange: ((o: ReduceMotionOverride) => void) | null = null;
  // «Без вспышек» (issue #9): тумблер — источник ОВЕРРАЙДА поверх OS, эффективный флаг решает
  // useReduceFlash и зовёт setReduceFlash(); база ORит его с reduceMotion в flashOff.
  private flashOverride: ReduceFlashOverride = "auto";
  private onFlashOverrideChange: ((o: ReduceFlashOverride) => void) | null = null;
  private flicker = DUST_FLICKER; // мерцание частиц (дефолт — выкл)
  private shearPlay = true; // «тряска рядов» играет
  // issue #6: интенсивность/скорость тряски рядов — настраиваемые множители поверх пресетов
  // shearCoarse/shearFine (дефолт 1 = 100% = поведение ДО этой правки, guard в censorMotion.test.ts).
  private shearIntensity = 1;
  private shearSpeed = 1;
  private shearCards: { spec: CensorSpec; baseSpeed: number }[] = [];
  // Профиль качества (issue #8): индикатор FPS+тир и dev-«нагрузка» — искусственно жжём N мс/кадр,
  // чтобы уронить FPS и увидеть авто-понижение до «лёгкий» вживую (стенд /motion не спит — метр всегда сэмплирует).
  private stressMs = 0;
  private fpsText: Text | null = null;

  private tunable: { card: Container; mask: Graphics; spec: CensorSpec; cardIdx: number } | null = null;
  private contentW = 1;
  private contentH = 1;
  private t = 0;
  private onView: ((v: ViewState) => void) | null = null;

  // Кадр стенда: время (со скоростью/reduce-motion) → поля/частицы + кнопки + инерция пан/зума.
  // Стенд крутится ВСЕГДА (return true) — idle-анимации цензуры не должны засыпать.
  protected frame(dt: number): boolean {
    if (this.stressMs > 0) this.burnMs(this.stressMs); // dev-нагрузка: роняем FPS для демонстрации авто-профиля
    if (!this.reduceMotion) {
      this.t += dt * this.speed;
      for (const c of this.cards) if (c.animated && (c.live?.() ?? true)) c.field?.update(this.t);
      for (const g of this.gpuCards) g.update(this.t);
      for (const p of this.particleCards) p.update(this.t);
    }
    for (const b of this.buttons) {
      b.step(dt);
      b.sync();
    }
    this.updateFpsText();
    if (this.pz?.step(dt * 1000)) this.emitView();
    return true;
  }

  // Синхронно «сжечь» ms миллисекунд — искусственная нагрузка кадра (только dev-стенд).
  private burnMs(ms: number): void {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      /* busy-wait */
    }
  }

  private updateFpsText(): void {
    if (!this.fpsText) return;
    const fps = this.currentFps();
    const tier = this.profile === "reduced" ? "лёгкий" : "полный";
    const src = this.profileOverride === "auto" ? "авто" : "форс";
    this.fpsText.text = `FPS: ${fps === null ? "—" : Math.round(fps)}   ·   профиль: ${tier} (${src})`;
  }

  protected build(app: Application): void {
    app.stage.addChild(this.content);
    this.buildSections(app);
    this.pz = attachPanZoom(app, this.content, {
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      contentSize: () => ({ w: this.contentW, h: this.contentH }),
      buttons: {
        pick: (cx, cy) => this.pickButton(cx, cy),
        contains: (b, cx, cy) => b.hitTest(cx, cy),
        down: (b) => b.setPressed(true),
        move: (b, inside) => b.setPressed(inside),
        up: (b, inside) => {
          if (inside) b.click();
          b.setPressed(false);
        },
        hover: (b) => {
          for (const x of this.buttons) x.hover(x === b);
        },
      },
      onChange: () => this.emitView(),
    });
  }

  protected onBooted(): void {
    this.pz?.fitWidth();
    this.emitView();
    this.wake(); // стенд анимирован сразу
  }

  // ——— сборка сцены: секции сверху вниз ———
  private buildSections(app: Application): void {
    let y = 24;
    const left = 28;

    // Секция «Общее»: ререндер + скорость + reduce-motion.
    y = this.title("Общее", left, y);
    const rerenderBtn = new Button({ label: "⟳ ререндер", variant: "secondary", size: "sm", onClick: () => this.rerender() });
    rerenderBtn.place(left + rerenderBtn.w / 2, y + rerenderBtn.h / 2);
    this.register(rerenderBtn);
    y = this.controls(this.globalCfg(), left + rerenderBtn.w + 28, y) + 12;
    // Живой индикатор FPS + текущий профиль (issue #8): обновляется каждый кадр в updateFpsText.
    this.fpsText = new Text({ text: "FPS: —", style: { fontFamily: PIXEL_FONT, fontSize: 18, fill: 0x9ad1a0 } });
    this.fpsText.position.set(left, y);
    this.content.addChild(this.fpsText);
    y += 34;

    // Секция «Цензура — пыль / мозаика».
    y = this.title("Цензура — пыль / мозаика", left, y);
    y = this.controls(this.censorCfg(), left, y) + 12;
    const dance: CensorSpec = { kind: "swap-dance", block: this.dance.block, speedPxSec: 0, flipEverySec: 0.3, rowBias: 0, swapsPerSec: this.dance.swapsPerSec, jitterAmp: this.dance.jitterAmp, jitterFreq: this.dance.jitterFreq, shearMix: 0, intensity: 1 };
    let x = left;
    const tun = this.fieldCard(app, dance, "мозаика (CPU)", x, y, true);
    this.tunable = { card: tun.card, mask: tun.mask, spec: dance, cardIdx: this.cards.length - 1 };
    x += TEX_W + 34;
    x = this.gpuCard(app, "remap", "GPU ремап", x, y);
    x = this.gpuCard(app, "pingpong", "GPU ping-pong", x, y);
    x = this.particleCard(app, "частицы (TG-пыль)", x, y);
    const censorRight = x;
    y += TEX_H + 40;

    // Секция «Тряска рядов».
    y = this.title("Тряска рядов", left, y);
    y = this.controls(this.shearCfg(), left, y) + 12;
    x = left;
    // Клонируем пресеты — spec живёт мутируемым внутри CensorField, править общий CENSOR_PRESETS
    // объект напрямую нельзя (расшатает другие места, где он переиспользуется как есть).
    const shearCoarse: CensorSpec = { ...CENSOR_PRESETS.shearCoarse! };
    const shearFine: CensorSpec = { ...CENSOR_PRESETS.shearFine! };
    this.shearCards = [
      { spec: shearCoarse, baseSpeed: shearCoarse.speedPxSec },
      { spec: shearFine, baseSpeed: shearFine.speedPxSec },
    ];
    x = this.fieldCard(app, shearCoarse, "крупно", x, y, true, () => this.shearPlay).right;
    x = this.fieldCard(app, shearFine, "мельче", x, y, true, () => this.shearPlay).right;
    y += TEX_H + 40;

    this.contentW = Math.max(censorRight, x) + 6;
    this.contentH = y + 6;
  }

  // Заголовок секции; возвращает y под ним.
  private title(text: string, x: number, y: number): number {
    const t = new Text({ text, style: { fontFamily: PIXEL_FONT, fontSize: 24, fill: 0xcdb98f } });
    t.position.set(x, y);
    this.content.addChild(t);
    return y + 40;
  }

  // Насадить контролы Configurable в точке; возвращает нижний край.
  private controls(cfg: Configurable, x: number, y: number): number {
    const { bottom } = attachControls(cfg, { layer: this.content, register: (b) => this.register(b), onChange: () => this.emitView() }, { x, y });
    return bottom;
  }

  private register(b: Button): void {
    this.buttons.push(b);
    this.content.addChild(b.root);
  }

  private pickButton(cx: number, cy: number): Button | null {
    for (let i = this.buttons.length - 1; i >= 0; i--) if (this.buttons[i]!.hitTest(cx, cy)) return this.buttons[i]!;
    return null;
  }

  // ——— карточки ———
  private cardChrome(x: number, y: number): { card: Container; mask: Graphics } {
    const card = new Container();
    card.position.set(x, y);
    this.content.addChild(card);
    const bg = new Graphics();
    bg.roundRect(0, 0, TEX_W, TEX_H, 16).fill({ color: COLORS.cardFace }).stroke({ width: 2, color: 0xcdbb90 });
    card.addChild(bg);
    const mask = new Graphics();
    mask.roundRect(0, 0, TEX_W, TEX_H, 16).fill({ color: 0xffffff });
    card.addChild(mask);
    return { card, mask };
  }

  private caption(text: string, cx: number, y: number): void {
    const t = new Text({ text, style: { fontFamily: PIXEL_FONT, fontSize: 16, fill: 0xe8e0cc } });
    t.anchor.set(0.5, 0);
    t.position.set(cx, y);
    this.content.addChild(t);
  }

  private fieldCard(app: Application, spec: CensorSpec, label: string, x: number, y: number, animated: boolean, live?: () => boolean): { card: Container; mask: Graphics; right: number } {
    const { card, mask } = this.cardChrome(x, y);
    const src = buildFingerGrid(app, spec.block);
    const field = new CensorField(src, spec);
    field.view.position.set((TEX_W - field.width) / 2, (TEX_H - field.height) / 2);
    field.view.mask = mask;
    card.addChild(field.view);
    field.update(0);
    this.cards.push({ field, animated, live });
    this.caption(label, x + TEX_W / 2, y + TEX_H + 8);
    return { card, mask, right: x + TEX_W + 34 };
  }

  private gpuCard(app: Application, mode: "remap" | "pingpong", label: string, x: number, y: number): number {
    const { card, mask } = this.cardChrome(x, y);
    const gpu = new GpuCensorCard(app, mode, DANCE_DEFAULT);
    gpu.view.mask = mask;
    card.addChild(gpu.view);
    gpu.update(0);
    this.gpuCards.push(gpu);
    this.caption(label, x + TEX_W / 2, y + TEX_H + 8);
    return x + TEX_W + 34;
  }

  private particleCard(app: Application, label: string, x: number, y: number): number {
    const { card, mask } = this.cardChrome(x, y);
    const pts = buildFingerDustPoints(app, 4, TEX_W / 2, TEX_H / 2); // облако с центром в центре карты (контейнер в левом-верхе)
    const pf = new ParticleField(pts, dustParams(this.dance, this.flickerOn()));
    pf.view.mask = mask;
    card.addChild(pf.view);
    pf.update(0);
    this.particleCards.push(pf);
    this.caption(label, x + TEX_W / 2, y + TEX_H + 8);
    return x + TEX_W + 34;
  }

  // ——— конфиги секций (декларативные params для attachControls) ———
  private globalCfg(): Configurable {
    return {
      params: (): Param[] => [
        { kind: "number", label: "скорость", min: 0, max: 30, format: (v) => (v / 10).toFixed(1) + "x", get: () => Math.round(this.speed * 10), set: (v) => (this.speed = v / 10) },
        { kind: "number", label: "нагрузка мс", min: 0, max: 40, get: () => this.stressMs, set: (v) => (this.stressMs = v) },
        { kind: "bool", label: "уменьшить движение", get: () => this.override === "on", set: (v) => this.setOverride(v ? "on" : "auto") },
        { kind: "bool", label: "без вспышек", get: () => this.flashOverride === "on", set: (v) => this.setFlashOverride(v ? "on" : "auto") },
        { kind: "choice", label: "профиль", options: ["авто", "полный", "лёгкий"], get: () => PROFILE_OPTS.indexOf(this.profileOverride), set: (i) => this.setProfileOverride(PROFILE_OPTS[i] ?? "auto") },
      ],
    };
  }
  private censorCfg(): Configurable {
    return {
      params: (): Param[] => [
        { kind: "number", label: "частица", min: 2, max: 10, get: () => this.dance.block, set: (v) => this.updateDance({ block: v }) },
        { kind: "number", label: "свапы/с", min: 0, max: 120, get: () => this.dance.swapsPerSec, set: (v) => this.updateDance({ swapsPerSec: v }) },
        { kind: "number", label: "дрожание", min: 0, max: 4, get: () => this.dance.jitterAmp, set: (v) => this.updateDance({ jitterAmp: v }) },
        { kind: "number", label: "частота", min: 0, max: 14, get: () => this.dance.jitterFreq, set: (v) => this.updateDance({ jitterFreq: v }) },
        { kind: "bool", label: "мерцание", get: () => this.flicker, set: (v) => ((this.flicker = v), this.applyParticles()) },
      ],
    };
  }
  private shearCfg(): Configurable {
    return {
      params: (): Param[] => [
        { kind: "bool", label: "двигать", get: () => this.shearPlay, set: (v) => (this.shearPlay = v) },
        { kind: "number", label: "интенсивность", min: 0, max: 200, format: (v) => `${v}%`, get: () => Math.round(this.shearIntensity * 100), set: (v) => this.updateShear({ intensity: v / 100 }) },
        { kind: "number", label: "скорость", min: 0, max: 200, format: (v) => `${v}%`, get: () => Math.round(this.shearSpeed * 100), set: (v) => this.updateShear({ speed: v / 100 }) },
      ],
    };
  }

  // issue #6: живая настройка тряски рядов — множители, а не пересборка карточек.
  private updateShear(p: Partial<{ intensity: number; speed: number }>): void {
    if (p.intensity !== undefined) this.shearIntensity = p.intensity;
    if (p.speed !== undefined) this.shearSpeed = p.speed;
    for (const c of this.shearCards) {
      c.spec.intensity = this.shearIntensity;
      c.spec.speedPxSec = c.baseSpeed * this.shearSpeed;
    }
  }

  // Эффективное мерцание: тумблер «мерцание» И не задавлено флагом «без вспышек» (issue #9).
  private flickerOn(): boolean {
    return this.flicker && !this.flashOff;
  }

  private applyParticles(): void {
    for (const p of this.particleCards) p.setParams(dustParams(this.dance, this.flickerOn()));
  }

  // Живая настройка «цензуры»: gpu + частицы + пересборка CPU-мозаики при смене block.
  updateDance(p: Partial<DanceParams>): void {
    Object.assign(this.dance, p);
    for (const g of this.gpuCards) g.setParams(p);
    this.applyParticles();
    const t = this.tunable;
    if (!t || !this.app) return;
    if (p.swapsPerSec !== undefined) t.spec.swapsPerSec = p.swapsPerSec;
    if (p.jitterAmp !== undefined) t.spec.jitterAmp = p.jitterAmp;
    if (p.jitterFreq !== undefined) t.spec.jitterFreq = p.jitterFreq;
    if (p.block !== undefined && p.block !== t.spec.block) {
      t.spec.block = p.block;
      this.cards[t.cardIdx]?.field?.destroy();
      const src = buildFingerGrid(this.app, p.block);
      const field = new CensorField(src, t.spec);
      field.view.position.set((TEX_W - field.width) / 2, (TEX_H - field.height) / 2);
      field.view.mask = t.mask;
      t.card.addChild(field.view);
      this.cards[t.cardIdx] = { field, animated: true };
    }
  }

  private rerenderCount = 0;
  rerender(): void {
    this.t = 0;
    this.rerenderCount++;
    for (const c of this.cards) {
      c.field?.reset(this.rerenderCount * 100003);
      c.field?.update(0);
    }
    for (const g of this.gpuCards) g.reset();
    for (const p of this.particleCards) p.reset();
  }

  // ——— reduce-motion: канвас-тумблер как источник оверрайда для React-хоста (issue #7) ———
  private setOverride(o: ReduceMotionOverride): void {
    if (this.override === o) return;
    this.override = o;
    this.onOverrideChange?.(o);
  }
  setOnOverrideChange(cb: ((o: ReduceMotionOverride) => void) | null): void {
    this.onOverrideChange = cb;
  }

  // ——— «без вспышек» (issue #9): тумблер-источник оверрайда, эффект пробрасывает база ———
  private setFlashOverride(o: ReduceFlashOverride): void {
    if (this.flashOverride === o) return;
    this.flashOverride = o;
    this.onFlashOverrideChange?.(o);
  }
  setOnFlashOverrideChange(cb: ((o: ReduceFlashOverride) => void) | null): void {
    this.onFlashOverrideChange = cb;
  }
  // База сменила производное flashOff → пересобрать частицы (мерцание могло погаснуть/вернуться).
  protected onFlashChange(): void {
    this.applyParticles();
  }

  // ——— DOM-мост: скроллбары/зум как в песочнице ———
  setOnView(cb: ((v: ViewState) => void) | null): void {
    this.onView = cb;
    this.emitView();
  }
  private emitView(): void {
    if (this.pz) this.onView?.(this.pz.viewport.state());
  }
  setZoom(z: number): void {
    if (!this.pz) return;
    this.pz.viewport.setZoom(z);
    this.pz.apply();
    this.emitView();
  }
  setScrollX(f: number): void {
    if (!this.pz) return;
    this.pz.viewport.setScrollX(f);
    this.pz.apply();
    this.emitView();
  }
  setScrollY(f: number): void {
    if (!this.pz) return;
    this.pz.viewport.setScrollY(f);
    this.pz.apply();
    this.emitView();
  }

  protected onTeardown(): void {
    this.pz?.detach();
    for (const c of this.cards) c.field?.destroy();
    for (const g of this.gpuCards) g.destroy();
    for (const p of this.particleCards) p.destroy();
    this.cards = [];
    this.gpuCards = [];
    this.particleCards = [];
    this.buttons = [];
    this.fpsText = null;
  }
}
