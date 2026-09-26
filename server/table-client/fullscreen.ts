// ПОЛНЫЙ ЭКРАН НА СТАРТЕ — телефон открывает стол во весь экран, пока человек сам из него не вышел.
//
// `expand()` и полный экран — разные вещи: `expand` лишь поднимает окно Telegram до верха, шапка
// Telegram остаётся; настоящий полный экран — `requestFullscreen` (Bot API 8.0+), и его может не быть.
//
// Выбор человека — это `fullscreenChanged`, откуда бы он ни пришёл: тумблер в настройках стола или
// кнопка самого Telegram. Отказ API (`fullscreenFailed`) — не выбор и не записывается.
//
// Выбор живёт только для телефона и только на этом устройстве. Десктоп каждый раз открывается обычным
// окном; включить полный экран там можно руками, но это не запоминается.

/** Телефонные клиенты Telegram. */
export const PHONE_PLATFORMS = ["ios", "android", "android_x"];

export const FULLSCREEN_KEY = "crossade.table.fullscreen.phone";

export interface FullscreenApp {
  platform?: string;
  isVersionAtLeast?(v: string): boolean;
  isFullscreen?: boolean;
  requestFullscreen?(): void;
  onEvent?(name: string, fn: () => void): void;
}

export interface FullscreenShelf {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const deviceShelf: FullscreenShelf = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Нет хранилища — следующий запуск снова во весь экран.
    }
  },
};

/** Умеет ли клиент настоящий полный экран. */
export function fullscreenable(app: FullscreenApp | undefined): boolean {
  return Boolean(app?.isVersionAtLeast?.("8.0") && app.requestFullscreen);
}

export function startFullscreen(app: FullscreenApp | undefined, shelf: FullscreenShelf = deviceShelf): void {
  if (!app || !PHONE_PLATFORMS.includes(app.platform ?? "") || !fullscreenable(app)) return;
  app.onEvent?.("fullscreenChanged", () => shelf.set(FULLSCREEN_KEY, app.isFullscreen ? "on" : "off"));
  if (shelf.get(FULLSCREEN_KEY) !== "off" && !app.isFullscreen) app.requestFullscreen!();
}
