import { Application } from "pixi.js";
import { createPixiApp, ensureFonts } from "./canvasHost";

// Тонкая база канвас-приложения (Host): владеет ТОЛЬКО жизненным циклом Pixi и циклом кадра —
// монтирование свежего канваса (StrictMode-safe), тикер с wake/sleep, снос. Про карты/сцену НЕ
// знает: контент реализует хуки (template method). Один скелет вместо копии в каждом движке —
// новый канвас «наклеивается», реализовав build()/frame(). (REFACTOR E1.)

const MAX_DT = 0.05; // потолок шага: переключение вкладок/лаг не должны «телепортировать» физику

export abstract class CanvasApp {
  protected app: Application | null = null;
  protected destroyed = false;
  private host: HTMLElement | null = null;
  protected width = 1;
  protected height = 1;

  async mount(host: HTMLElement, width: number, height: number): Promise<void> {
    if (this.destroyed) return;
    this.host = host;
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.onLayout(this.width, this.height);
    await this.boot();
  }

  destroy(): void {
    this.destroyed = true;
    this.teardown();
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
  protected wake(): void {
    if (this.app && !this.app.ticker.started) this.app.ticker.start();
  }

  private tick = (): void => {
    if (!this.app) return;
    const dt = Math.min(this.app.ticker.deltaMS / 1000, MAX_DT);
    if (!this.frame(dt)) this.app.ticker.stop(); // ничто не движется → засыпаем
  };

  // ——— хуки контента (template method) ———
  /** Производные размеры до boot (напр. размер карты от экрана). Опц. */
  protected onLayout(_w: number, _h: number): void {}
  /** Собрать сцену в app.stage (+ навесить ввод). Обязателен. */
  protected abstract build(app: Application): void;
  /** После добавления тикера: первый render / wake / эмит вида. Опц. */
  protected onBooted(_app: Application): void {}
  /** Отвязать слушатели/жесты и почистить свои узлы перед сносом app. Опц. */
  protected onTeardown(_app: Application): void {}
  /** Кадр: шаг+рендер; вернуть moving (false → цикл засыпает). Обязателен. */
  protected abstract frame(dt: number): boolean;
}
