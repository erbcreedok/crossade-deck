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

export interface TableHaptic {
  on: boolean;
  buzz(kind: Haptic): void;
}

let one: TableHaptic | null = null;

/** Одна на экран: стол и клавиатура делят один тумблер. */
export function tableHaptic(): TableHaptic {
  if (one) return one;
  const log: Haptic[] = ((globalThis as { __tableHaptics?: Haptic[] }).__tableHaptics = []);
  const feedback = () => (globalThis as { Telegram?: { WebApp?: { HapticFeedback?: HapticFeedback } } }).Telegram?.WebApp?.HapticFeedback;
  const haptic: TableHaptic = {
    on: readHapticOn(),
    buzz(kind) {
      if (!haptic.on) return;
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
  // Кнопки и клавиши — тик на касании; полосы эмодзи и стикеров отвечают сами, на отпускании без прокрутки.
  addEventListener("pointerdown", (e) => {
    const t = e.target as Element | null;
    if (t?.closest?.("button") && !t.closest("[data-scroll]")) haptic.buzz("selection");
  }, { capture: true });
  return (one = haptic);
}
