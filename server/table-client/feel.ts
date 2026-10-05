// ОЩУЩЕНИЕ ОТ КАРТЫ В РУКАХ — звук и вибрация на каждое движение: взял, понёс, положил, бросил, удар, перевернул, повернул, «нельзя», вернулась на место.
//
// Сцена сообщает событие в момент касания (`FeelEvent`: что, с какой силой, где на экране); здесь оно становится звуком (`sound.voice`: запись из тех же файлов, что
// играет стол, плюс слои синтеза) и вибрацией (Telegram `HapticFeedback` или `navigator.vibrate`). Всё, что можно подобрать на слух, лежит в пресете `FeelSpec` по
// событию: громкость, высота, разброс, длина обрыва, слои, рисунок вибрации. Стенд правит пресет ручками, игра читает тот же.

import type { Haptic, TableHaptic } from "./haptic.js";
import type { TableSound, VoiceLayer, VoiceSpec } from "./sound.js";

export const FEEL_KINDS = ["grab", "carry", "lay", "throw", "slam", "flip", "spin", "deny", "home"] as const;
export type FeelKind = (typeof FEEL_KINDS)[number];

/** Русские названия событий — для стенда. */
export const FEEL_NAMES: Record<FeelKind, string> = {
  grab: "Взял карту",
  carry: "Несу (шелест)",
  lay: "Положил",
  throw: "Бросил на скорости",
  slam: "Удар об стол",
  flip: "Перевернул",
  spin: "Поворот (тик каждые 15°)",
  deny: "Нельзя (отказ)",
  home: "Вернулась на место",
};

export interface FeelEvent {
  kind: FeelKind;
  /** Сила события, 0…1: высота падения, скорость броска, скорость руки. Тише и мягче при малой. */
  energy?: number;
  /** Где на экране, в долях от середины (−1 слева … 1 справа; −1 вверху … 1 внизу). */
  x?: number;
  z?: number;
}

export interface FeelSpec {
  /** Запись стола (`sound.ts`), если нужна. */
  file: "drop" | "hand" | "turn" | "gather" | "merge" | "shuffle" | "sort" | null;
  /** Громкость события при полной силе, 0…2. */
  gain: number;
  /** Высота записи: 1 — как есть, меньше — ниже и медленнее. */
  rate: number;
  /** Случайный разброс высоты ±, доли (0.08 — до ±8%): повторы не звучат пулемётом. */
  jitter: number;
  /** Во сколько раз слабее звук при нулевой силе (0 — нет звука, 1 — сила не влияет). */
  soft: number;
  /** Оборвать запись через столько мс; 0 — играть до конца. */
  cutMs: number;
  /** Слои синтеза поверх записи. */
  layers: VoiceLayer[];
  /** Рисунок вибрации, мс: вибрация, пауза, вибрация…; пусто — не вибрировать. `navigator.vibrate` (Android); у Telegram — `style`. */
  vibe: number[];
  /** Стиль Telegram `HapticFeedback` (iOS и Android в Telegram умеют только готовые стили). */
  style: Haptic;
}

export const FEEL_DEFAULT: Record<FeelKind, FeelSpec> = {
  grab: { file: "hand", gain: 0.5, rate: 1.25, jitter: 0.06, soft: 1, cutMs: 120, layers: [{ kind: "tick", from: 900, to: 500, ms: 25, gain: 0.2 }], vibe: [8], style: "light" },
  carry: { file: "hand", gain: 0.25, rate: 1.5, jitter: 0.1, soft: 0.2, cutMs: 90, layers: [], vibe: [], style: "soft" },
  lay: { file: "drop", gain: 0.8, rate: 1, jitter: 0.06, soft: 0.45, cutMs: 0, layers: [], vibe: [14], style: "medium" },
  throw: { file: "drop", gain: 1.1, rate: 0.85, jitter: 0.05, soft: 0.6, cutMs: 0, layers: [{ kind: "boom", from: 110, to: 60, ms: 90, gain: 0.35 }], vibe: [22], style: "rigid" },
  slam: { file: "drop", gain: 1.8, rate: 0.72, jitter: 0.03, soft: 1, cutMs: 0, layers: [{ kind: "boom", from: 95, to: 42, ms: 140, gain: 0.9 }, { kind: "noise", from: 180, ms: 90, gain: 0.5, q: 0.8 }], vibe: [40, 30, 60], style: "heavy" },
  flip: { file: "turn", gain: 0.8, rate: 1, jitter: 0.05, soft: 1, cutMs: 0, layers: [{ kind: "tick", from: 1800, to: 900, ms: 30, gain: 0.25 }], vibe: [10, 20, 10], style: "rigid" },
  spin: { file: null, gain: 1, rate: 1, jitter: 0.04, soft: 1, cutMs: 0, layers: [{ kind: "tick", from: 1400, to: 1000, ms: 18, gain: 0.35 }], vibe: [6], style: "selection" },
  deny: { file: null, gain: 1, rate: 1, jitter: 0, soft: 1, cutMs: 0, layers: [{ kind: "boom", from: 160, to: 110, ms: 90, gain: 0.5 }, { kind: "tick", from: 300, to: 200, ms: 60, gain: 0.3 }], vibe: [30, 40, 30], style: "error" },
  home: { file: "hand", gain: 0.6, rate: 0.8, jitter: 0.05, soft: 1, cutMs: 200, layers: [{ kind: "boom", from: 120, to: 80, ms: 70, gain: 0.25 }], vibe: [15], style: "soft" },
};

const KEY = "crossade.feel.v1";

type VibeMode = "telegram" | "vibrate" | "ios-switch" | "none";

/**
 * ВИБРАЦИЯ БЕЗ TELEGRAM. Android и Chrome: `navigator.vibrate(рисунок)`. iPhone в Safari его не знает; единственный путь — тик, который Safari 17.4+ даёт, когда
 * переключается `<input type="checkbox" switch>`: скрытый переключатель щёлкаем через его подпись. Сила и длительность не настраиваются (один тик на толчок),
 * и работает только внутри жеста пальца (отпускание, касание), а не из таймера или движения.
 */
const isIOS = (): boolean => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let switchLabel: HTMLLabelElement | null = null;
function iosSwitchTick(): void {
  if (!switchLabel) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.setAttribute("switch", "");
    label.style.cssText = "position:fixed;left:-40px;top:-40px;width:30px;height:30px;opacity:0.01;pointer-events:none";
    label.append(box);
    document.body.append(label);
    switchLabel = label;
  }
  switchLabel.click();
}
function vibeMode(haptic: TableHaptic): VibeMode {
  if (haptic.supported) return "telegram";
  if (typeof navigator.vibrate === "function") return "vibrate";
  return isIOS() ? "ios-switch" : "none";
}


export interface FeelPrefs {
  /** Звук событий включён. */
  sound: boolean;
  /** Вибрация включена. */
  vibe: boolean;
}

export interface FeelLogged {
  kind: FeelKind;
  energy: number;
  /** Что ушло: звук (и каким gain), вибрация (рисунок). */
  gain: number;
  vibe: number[];
}

export interface TableFeel {
  /** Рабочий пресет (по умолчанию плюс то, что подобрали ручками). */
  preset: Record<FeelKind, FeelSpec>;
  prefs: FeelPrefs;
  /** Сыграть событие. */
  play(e: FeelEvent): void;
  /** Сохранить пресет и настройки в браузере. */
  save(): void;
  /** Вернуть заводской пресет одного события (или всех). */
  reset(kind?: FeelKind): void;
  /** Пресет целиком — для переноса в игру. */
  exportPreset(): string;
  /** Чем здесь вибрирует устройство: Telegram, `navigator.vibrate`, переключатель Safari на iPhone или никак. */
  readonly vibeMode: VibeMode;
  /** Последние события — для проверок. */
  readonly log: FeelLogged[];
}

const clone = (spec: FeelSpec): FeelSpec => ({ ...spec, layers: spec.layers.map((l) => ({ ...l })), vibe: [...spec.vibe] });

/** Один пресет на страницу: звук и вибрация — те, что уже держит экран (`tableSound`, `tableHaptic`). */
export function tableFeel(sound: TableSound, haptic: TableHaptic): TableFeel {
  const preset = Object.fromEntries(FEEL_KINDS.map((k) => [k, clone(FEEL_DEFAULT[k])])) as Record<FeelKind, FeelSpec>;
  const prefs: FeelPrefs = { sound: true, vibe: true };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as { preset?: Partial<Record<FeelKind, Partial<FeelSpec>>>; prefs?: Partial<FeelPrefs> } | null;
    for (const k of FEEL_KINDS) if (raw?.preset?.[k]) Object.assign(preset[k], raw.preset[k]);
    if (raw?.prefs) Object.assign(prefs, raw.prefs);
  } catch { /* нет хранилища или битое — заводской */ }
  const log: FeelLogged[] = ((globalThis as { __feelLog?: FeelLogged[] }).__feelLog = []);

  const feel: TableFeel = {
    preset,
    prefs,
    log,
    get vibeMode() { return vibeMode(haptic); },
    play(e) {
      const spec = preset[e.kind], energy = Math.max(0, Math.min(1, e.energy ?? 1));
      const gain = spec.gain * (spec.soft + (1 - spec.soft) * energy);
      const rate = spec.rate * (1 + (Math.random() * 2 - 1) * spec.jitter);
      const vibe = prefs.vibe && spec.vibe.length ? spec.vibe.map((ms) => Math.max(1, Math.round(ms * (0.5 + 0.5 * energy)))) : [];
      log.push({ kind: e.kind, energy: +energy.toFixed(2), gain: prefs.sound ? +gain.toFixed(3) : 0, vibe });
      if (log.length > 60) log.shift();
      if (prefs.sound && gain > 0.001) {
        const voice: VoiceSpec = { file: spec.file, rate, gain, x: e.x ?? 0, z: e.z ?? 0, layers: spec.layers.map((l) => ({ ...l, gain: l.gain * (spec.soft + (1 - spec.soft) * energy) })), ...(spec.cutMs ? { cutMs: spec.cutMs } : {}) };
        sound.voice(voice);
      }
      if (vibe.length) {
        const mode = vibeMode(haptic);
        // Telegram умеет только готовые стили; без него — рисунок в миллисекундах там, где есть `navigator.vibrate`; на iPhone — тики переключателя Safari.
        if (mode === "telegram") haptic.buzz(spec.style);
        else if (mode === "vibrate") { try { navigator.vibrate(vibe); } catch { /* нет вибрации */ } }
        else if (mode === "ios-switch") {
          let at = 0;
          vibe.forEach((ms, i) => { if (i % 2 === 0) { if (at === 0) iosSwitchTick(); else setTimeout(iosSwitchTick, at); } at += ms; });
        }
      }
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify({ preset, prefs })); } catch { /* нет хранилища */ }
    },
    reset(kind) {
      for (const k of kind ? [kind] : FEEL_KINDS) preset[k] = clone(FEEL_DEFAULT[k]);
    },
    exportPreset: () => JSON.stringify(preset, null, 2),
  };
  return feel;
}
