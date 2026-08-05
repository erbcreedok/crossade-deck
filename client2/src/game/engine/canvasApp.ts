import { Application } from "pixi.js";
import { createPixiApp, ensureFonts } from "./canvasHost";
import { FpsMeter } from "../anim/fpsMeter";
import { nextTier, resolveProfile, type ProfileOverride, type QualityTier } from "../anim/quality";

// Тонкая база канвас-приложения (Host): владеет ТОЛЬКО жизненным циклом Pixi и циклом кадра —
// монтирование свежего канваса (StrictMode-safe), тикер с wake/sleep, снос. Про карты/сцену НЕ
// знает: контент реализует хуки (template method). Один скелет вместо копии в каждом движке —
// новый канвас «наклеивается», реализовав build()/frame(). (REFACTOR E1.)

const MAX_DT = 0.05; // потолок шага: переключение вкладок/лаг не должны «телепортировать» физику

export abstract class CanvasApp {
  public app: Application | null = null;
  protected destroyed = false;
  private host: HTMLElement | null = null;
  public width = 1;
  public height = 1;
  /** Эффективный reduce-motion (OS + юзер-оверрайд, см. useReducedMotion) — единое поле для всех
   *  трёх движков (issue #7), контент решает сам, что заморозить (см. onReduceMotionChange). */
  public reduceMotion = false;
  /** Отдельный флаг «без вспышек» (issue #9, фото-чувствительность, см. useReduceFlash). */
  protected reduceFlash = false;
  /** Производное «гасить вспышки» = reduceMotion || reduceFlash: reduce-motion — надмножество,
   *  оно гасит и мерцание/дрожь. Контент читает его через onFlashChange (напр. Card.flashOff). */
  public flashOff = false;
  /** Профиль качества (issue #8): full ↔ reduced. Юзер-оверрайд (auto/full/reduced) поверх авто-тира,
   *  который считает FpsMeter в цикле кадра. Контент читает эффективный profile через onProfileChange. */
  protected profileOverride: ProfileOverride = "auto";
  protected profile: QualityTier = "full";
  private autoTier: QualityTier = "full";
  private fpsMeter = new FpsMeter();
  // Первый кадр после старта тикера — wall-clock разрыв (сон/переключение вкладки), не сэмплируем.
  private skipFpsSample = true;

  async mount(host: HTMLElement, width: number, height: number): Promise<void> {
    if (this.destroyed) return;
    this.host = host;
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.onLayout(this.width, this.height);
    await this.boot();
    this.observeResize();
  }

  /**
   * Перевесить ЖИВОЙ канвас в другой хост, не пересоздавая WebGL-контекст.
   *
   * Нужно там, где один движок обслуживает несколько сменяющихся мест монтирования — сейчас это
   * сторибук (переключение story размонтирует React-хост, но контекст обязан пережить это). Браузер
   * держит около 16 живых контекстов; вариант «на каждое монтирование новый» упирается в потолок
   * через десяток переключений и гасит все канвасы разом.
   *
   * Отличие от mount(): не зовёт boot() — сцена уже собрана и остаётся как есть.
   */
  reattach(host: HTMLElement, width: number, height: number): void {
    if (this.destroyed || !this.app) return;
    this.ro?.disconnect();
    this.ro = null;
    this.host = host;
    host.appendChild(this.app.canvas); // appendChild сам переносит узел из прежнего родителя
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.app.renderer.resize(this.width, this.height);
    this.onLayout(this.width, this.height);
    this.onResize(this.width, this.height);
    this.observeResize();
    this.wake(); // спящий тикер обязан перерисовать кадр в новом месте и размере
  }

  destroy(): void {
    this.destroyed = true;
    this.ro?.disconnect();
    this.ro = null;
    this.teardown();
  }

  // ——— ресайз (issue #49) ———
  //
  // Раньше размер читался ОДИН раз на mount и больше никогда: канвас оставался прежним при любом
  // изменении окна (утащили край, открыли консоль сайдбаром, повернули телефон). Следим за ХОСТОМ,
  // а не за window: движок и так монтируется в размеры хоста, и панели/врезки вокруг канваса
  // меняют его размер без всякого resize у окна.
  private ro: ResizeObserver | null = null;

  private observeResize(): void {
    if (this.ro || this.destroyed || !this.host) return;
    if (typeof ResizeObserver === "undefined") return; // jsdom/старые движки — просто без ресайза
    this.ro = new ResizeObserver(() => this.handleResize());
    this.ro.observe(this.host);
  }

  private handleResize(): void {
    if (this.destroyed || !this.app || !this.host) return;
    const w = Math.max(1, Math.round(this.host.clientWidth));
    const h = Math.max(1, Math.round(this.host.clientHeight));
    if (w === this.width && h === this.height) return; // ResizeObserver стреляет и на подписку
    this.width = w;
    this.height = h;
    this.app.renderer.resize(w, h);
    this.onLayout(w, h);
    this.onResize(w, h);
    this.wake(); // спящий тикер обязан перерисовать кадр в новом размере
  }

  // Поднять свежий Pixi-канвас (новый WebGL-контекст на каждый mount — иначе StrictMode «теряет
  // контекст») и собрать сцену. Повторный вызов допустим (рестарт канваса у контента).
  protected async boot(): Promise<void> {
    await ensureFonts();
    if (this.destroyed || !this.host) return;
    const app = await createPixiApp(this.width, this.height);
    if (!app) return;
    if (this.destroyed) {
      app.destroy({ removeView: true }, { children: true, texture: true });
      return;
    }
    this.app = app;
    this.host.appendChild(app.canvas);
    this.build(app);
    app.ticker.add(this.tick);
    this.onBooted(app);
  }

  // Снести Pixi-узлы (для повторного boot и окончательного destroy). Свои узлы контент чистит в onTeardown.
  protected teardown(): void {
    if (!this.app) return;
    this.app.ticker.remove(this.tick);
    this.onTeardown(this.app);
    this.app.destroy({ removeView: true }, { children: true, texture: true });
    this.app = null;
  }

  // autoStart=false → тикер спит, пока его не запустят. Будим при изменениях; будить ли на старте —
  // решает контент в onBooted (стол спит в покое, стенд крутится всегда).
  public wake(): void {
    if (this.app && !this.app.ticker.started) this.app.ticker.start();
  }

  // Единая точка входа для reduce-motion во всех движках (React-хост зовёт после useReducedMotion).
  // wake() обязателен: спящий тикер обязан перерисовать кадр в новом (за)мороженном виде — иначе
  // выключение reduce-motion среди сна оставило бы старый статичный кадр висеть на экране.
  setReduceMotion(v: boolean): void {
    if (this.reduceMotion === v) return;
    this.reduceMotion = v;
    this.onReduceMotionChange(v);
    this.refreshFlash(); // reduce-motion гасит и вспышки — пересчитать производное flashOff
    this.wake();
  }

  /** Юзер-флаг «без вспышек» (issue #9). Отдельный вход от reduce-motion, но итог — общий flashOff. */
  setReduceFlash(v: boolean): void {
    if (this.reduceFlash === v) return;
    this.reduceFlash = v;
    this.refreshFlash();
    this.wake();
  }

  // Пересчёт производного flashOff из двух источников; хук зовём только на реальную смену.
  private refreshFlash(): void {
    const eff = this.reduceMotion || this.reduceFlash;
    if (eff === this.flashOff) return;
    this.flashOff = eff;
    this.onFlashChange(eff);
  }

  /** Контент пробрасывает флаг в свои декоративные элементы (напр. Card.reduceMotion). Опц. */
  protected onReduceMotionChange(_v: boolean): void {}

  /** Контент пробрасывает «без вспышек» в свои вспышечные элементы (напр. Card.flashOff). Опц. */
  protected onFlashChange(_v: boolean): void {}

  /** Юзер-оверрайд профиля качества (issue #8): auto — следовать замеру FPS, full/reduced — форс. */
  setProfileOverride(o: ProfileOverride): void {
    if (this.profileOverride === o) return;
    this.profileOverride = o;
    this.refreshProfile();
    this.wake(); // спящий тикер обязан применить новый профиль (тени/idle) хотя бы одним кадром
  }

  /** Сглаженный FPS (null пока мало данных) — для индикатора стенда. */
  protected currentFps(): number | null {
    return this.fpsMeter.fps();
  }

  // Один кадр в метр: замер → пересчёт авто-тира (гистерезис) → эффективный профиль. Вынесено из
  // tick, чтобы тестировать авто-понижение без Pixi (см. canvasApp.profile.test.ts).
  protected feedFrameSample(deltaMs: number): void {
    this.fpsMeter.sample(deltaMs);
    const t = nextTier(this.fpsMeter.fps(), this.autoTier);
    if (t === this.autoTier) return;
    this.autoTier = t;
    this.refreshProfile();
  }

  private refreshProfile(): void {
    const eff = resolveProfile(this.profileOverride, this.autoTier);
    if (eff === this.profile) return;
    this.profile = eff;
    this.onProfileChange(eff);
  }

  /** Контент применяет профиль к своим элементам/пассам (напр. тени off, idle заморожен). Опц. */
  protected onProfileChange(_p: QualityTier): void {}

  private tick = (): void => {
    if (!this.app) return;
    const raw = this.app.ticker.deltaMS;
    const dt = Math.min(raw / 1000, MAX_DT);
    // FPS-профиль (issue #8): первый кадр после пробуждения пропускаем (разрыв ≠ просадка).
    if (this.skipFpsSample) this.skipFpsSample = false;
    else this.feedFrameSample(raw);
    if (!this.frame(dt)) {
      this.app.ticker.stop(); // ничто не движется → засыпаем
      this.skipFpsSample = true; // следующий кадр (на wake) — разрыв
    }
  };

  // ——— хуки контента (template method) ———
  /** Производные размеры до boot (напр. размер карты от экрана). Опц. */
  protected onLayout(_w: number, _h: number): void {}

  /** Экран изменился ПОСЛЕ сборки сцены (issue #49). Вызывается сразу за onLayout. Контент, чья
   *  геометрия не зависит от экрана (песочница — размер карты из конфига), обходится обновлением
   *  камеры и хит-зоны; движкам, считающим раскладку от W/H, здесь нужен пересчёт. */
  protected onResize(_w: number, _h: number): void {}
  /** Собрать сцену в app.stage (+ навесить ввод). Обязателен. */
  protected abstract build(app: Application): void;
  /** После добавления тикера: первый render / wake / эмит вида. Опц. */
  protected onBooted(_app: Application): void {}
  /** Отвязать слушатели/жесты и почистить свои узлы перед сносом app. Опц. */
  protected onTeardown(_app: Application): void {}
  /** Кадр: шаг+рендер; вернуть moving (false → цикл засыпает). Обязателен. */
  protected abstract frame(dt: number): boolean;
}
