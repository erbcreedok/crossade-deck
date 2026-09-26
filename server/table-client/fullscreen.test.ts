import { describe, expect, it } from "vitest";
import { FULLSCREEN_KEY, startFullscreen, type FullscreenApp, type FullscreenShelf } from "./fullscreen.js";

/** Клиент Telegram: полный экран меняется только через событие, как в настоящем. */
function client(platform: string, version = "8.0", opts: { fails?: boolean } = {}) {
  const on: Record<string, (() => void)[]> = {};
  const fire = (name: string) => (on[name] ?? []).forEach((fn) => fn());
  const app: FullscreenApp & { asked: number; setFull(v: boolean): void } = {
    platform,
    isFullscreen: false,
    asked: 0,
    isVersionAtLeast: (v) => Number(version) >= Number(v),
    requestFullscreen() {
      app.asked += 1;
      if (opts.fails) fire("fullscreenFailed");
      else app.setFull(true);
    },
    onEvent: (name, fn) => void (on[name] ??= []).push(fn),
    setFull(v) {
      app.isFullscreen = v;
      fire("fullscreenChanged");
    },
  };
  return app;
}
const shelf = (): FullscreenShelf & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
};

describe("fullscreen.start", () => {
  it("телефон, первый запуск — во весь экран", () => {
    const app = client("ios");
    startFullscreen(app, shelf());
    expect(app.isFullscreen).toBe(true);
  });

  it("вышел из полного экрана (тумблер или кнопка Telegram) — следующий запуск обычный; вернул — снова полный", () => {
    const s = shelf();
    const first = client("android");
    startFullscreen(first, s);
    first.setFull(false);
    expect(s.data.get(FULLSCREEN_KEY)).toBe("off");
    const second = client("android");
    startFullscreen(second, s);
    expect(second.asked, "выбор человека уважается").toBe(0);
    second.setFull(true);
    const third = client("android");
    startFullscreen(third, s);
    expect(third.isFullscreen).toBe(true);
  });

  it("десктоп — всегда обычное окно, и ручное включение не запоминается", () => {
    const s = shelf();
    s.data.set(FULLSCREEN_KEY, "on");
    const app = client("tdesktop");
    startFullscreen(app, s);
    expect(app.asked).toBe(0);
    app.setFull(true);
    app.setFull(false);
    expect(s.data.get(FULLSCREEN_KEY), "выбор телефона десктоп не трогает").toBe("on");
  });

  it("клиент без полного экрана (до 8.0) — не просим; отказ API — не выбор человека", () => {
    const old = client("ios", "7.10");
    startFullscreen(old, shelf());
    expect(old.asked).toBe(0);
    const s = shelf();
    const failing = client("ios", "8.0", { fails: true });
    startFullscreen(failing, s);
    expect(failing.asked).toBe(1);
    expect(s.data.has(FULLSCREEN_KEY), "отказ не записан").toBe(false);
  });

  it("нет Telegram — ничего не делаем", () => {
    expect(() => startFullscreen(undefined, shelf())).not.toThrow();
  });
});
