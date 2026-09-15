// ВИБРАЦИЯ — `Telegram.WebApp.HapticFeedback`: работает в Telegram на iPhone и Android; вне Telegram молчит.
// Только своё: мои действия и то, что пришло в мою руку или на мой стул. Личная, выключается в настройках.

export type Haptic = "light" | "medium" | "heavy" | "rigid" | "soft" | "selection" | "success" | "warning" | "error";

interface HapticFeedback {
  impactOccurred(style: string): void;
  notificationOccurred(type: string): void;
  selectionChanged(): void;
}

const ON_KEY = "crossade.table.haptic";

export function readHapticOn(): boolean {
  try {
    return localStorage.getItem(ON_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeHapticOn(on: boolean): void {
  try {
    localStorage.setItem(ON_KEY, on ? "on" : "off");
  } catch {
    // Нет хранилища — живёт, пока открыт экран.
  }
}

/** Где Telegram умеет вибрировать: телефонные клиенты, Bot API 6.1+. На Mac, в Desktop и в вебе вызов пустой. */
export const HAPTIC_PLATFORMS = ["ios", "android", "android_x"];

export interface TableHaptic {
  on: boolean;
  /** Есть ли вибрация на этом устройстве — нет, так и тумблера нет. */
  supported: boolean;
  /** Клиент Telegram — строкой для настроек: платформа и версия Bot API. */
  client: string;
  buzz(kind: Haptic): void;
  /** Проверка из настроек: три отклика подряд и строка о том, как ушёл вызов. */
  probe(): string;
}

let one: TableHaptic | null = null;

/** Одна на экран: стол и клавиатура делят один тумблер. */
export function tableHaptic(): TableHaptic {
  if (one) return one;
  const log: Haptic[] = ((globalThis as { __tableHaptics?: Haptic[] }).__tableHaptics = []);
  const app = () => (globalThis as { Telegram?: { WebApp?: { platform?: string; version?: string; isVersionAtLeast?(v: string): boolean } } }).Telegram?.WebApp;
  const feedback = () => (globalThis as { Telegram?: { WebApp?: { HapticFeedback?: HapticFeedback } } }).Telegram?.WebApp?.HapticFeedback;
  const haptic: TableHaptic = {
    on: readHapticOn(),
    get supported() {
      const a = app();
      return Boolean(a?.isVersionAtLeast?.("6.1") && HAPTIC_PLATFORMS.includes(a.platform ?? ""));
    },
    get client() {
      const a = app();
      return a?.platform && a.platform !== "unknown" ? `Telegram ${a.platform} · ${a.version}` : "";
    },
    buzz(kind) {
      if (!haptic.on || !haptic.supported) return;
      log.push(kind);
      if (log.length > 50) log.shift();
      const f = feedback();
      if (!f) return;
      try {
        if (kind === "selection") f.selectionChanged();
        else if (kind === "success" || kind === "warning" || kind === "error") f.notificationOccurred(kind);
        else f.impactOccurred(kind);
      } catch {
        // Старый клиент Telegram без вибрации.
      }
    },
  };
  haptic.probe = () => {
    const w = globalThis as { webkit?: { messageHandlers?: { performAction?: unknown } }; external?: { notify?: unknown }; TelegramWebviewProxy?: unknown };
    const road = w.TelegramWebviewProxy ? "proxy" : w.webkit?.messageHandlers?.performAction ? "webkit" : w.external?.notify ? "external" : window.parent !== window ? "iframe" : "нет канала";
    const f = feedback();
    try {
      f?.impactOccurred("heavy");
      window.setTimeout(() => f?.notificationOccurred("success"), 400);
      window.setTimeout(() => f?.selectionChanged(), 800);
      return `отправлено · ${road}`;
    } catch (e) {
      return `ошибка ${(e as Error).message} · ${road}`;
    }
  };
  // Кнопки и клавиши — тик на касании; полосы эмодзи и стикеров отвечают сами, на отпускании без прокрутки.
  addEventListener("pointerdown", (e) => {
    const t = e.target as Element | null;
    if (t?.closest?.("button") && !t.closest("[data-scroll]")) haptic.buzz("selection");
  }, { capture: true });
  return (one = haptic);
}
