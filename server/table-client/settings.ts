// ОКНО НАСТРОЕК — модальное, поверх стола, с кнопкой «закрыть». Открывается шестерёнкой и пунктом «Настройки» в меню
// Telegram (`SettingsButton`). Всё в нём личное и живёт на устройстве.
//
// Своим слоем, а не в разметке стола: та пересобирается каждым кадром, и ползунок громкости терял бы палец.

import { readBuild, sortBuilds } from "../src/table/builds.js";
import { SPEEDS, type Speed } from "../src/table/motion.js";
import { HOST } from "./host.js";
import type { DeckLook } from "./deckArt.js";
import type { TableHaptic } from "./haptic.js";
import type { Motion } from "./motion.js";
import { VOLUME_STEP, type TableSound } from "./sound.js";

const INK = { black: "#0b0704", ink: "#f5ead0", dim: "#cdb98f", off: "#6f6452", well: "#1c120b", wood: "#6b4d2c", plateHi: "#25321f", plateLo: "#16210f", rim: "#6b4d2c", goldHi: "#f8d885", goldLo: "#b08a26" };

interface TelegramApp {
  isVersionAtLeast?(v: string): boolean;
  isFullscreen?: boolean;
  requestFullscreen?(): void;
  exitFullscreen?(): void;
  onEvent?(name: string, fn: () => void): void;
  SettingsButton?: { show(): void; onClick(fn: () => void): void };
}

export interface SettingsWorld {
  sound: TableSound;
  haptic: TableHaptic;
  motion: Motion;
  look: DeckLook;
  /** Поменялся вид колоды — стол перерисовывается и догружает картинки. */
  lookChanged(): void;
  /** Строка внизу: номер сборки и клиент. */
  footer(): string;
  /** Открылось или закрылось — стол перерисовывает шестерёнку. */
  changed(): void;
}

export interface Settings {
  readonly open: boolean;
  show(): void;
  hide(): void;
}

export function mountSettings(host: HTMLElement, world: SettingsWorld): Settings {
  const app = () => (globalThis as { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp;
  const fullscreenable = () => Boolean(app()?.isVersionAtLeast?.("8.0") && app()?.requestFullscreen);

  const layer = document.createElement("div");
  layer.dataset.settingsLayer = "";
  layer.style.cssText = "position:fixed;inset:0;z-index:300;display:none;align-items:center;justify-content:center;box-sizing:border-box;"
    + "padding:calc(16px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px)) 16px calc(16px + env(safe-area-inset-bottom));"
    + "background:rgba(11,7,4,.62)";
  host.append(layer);

  const section = (title: string) => `<div style="font:400 11px Tiny5,monospace;color:${INK.dim};padding:14px 0 4px;letter-spacing:.04em">${title}</div>`;
  const toggle = (key: string, label: string, on: boolean) => {
    const knob = on
      ? `background:linear-gradient(${INK.goldHi},${INK.goldLo});box-shadow:inset 0 0 0 2px ${INK.black}`
      : `background:linear-gradient(${INK.plateHi},${INK.plateLo});box-shadow:inset 0 0 0 2px ${INK.black},inset 0 0 0 3px ${INK.rim}`;
    return `<button data-look="${key}" role="switch" aria-checked="${on}" style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:40px;border:0;padding:4px 0;background:none;cursor:pointer;color:${INK.ink};font:400 14px Tiny5,monospace;text-align:left">`
      + `<span>${label}</span><span style="flex:none;width:44px;height:24px;border-radius:12px;position:relative;${knob}">`
      + `<span style="position:absolute;top:4px;left:${on ? 24 : 4}px;width:16px;height:16px;border-radius:50%;background:${on ? INK.black : INK.dim}"></span></span></button>`;
  };

  function volumeHtml(which: "table" | "voice" = "table"): string {
    const p = world.sound.prefs;
    const volume = which === "voice" ? p.voiceVolume : p.volume;
    const muted = p.muted || (which === "voice" ? p.voiceMuted : p.uiMuted);
    const ink = muted ? INK.off : INK.goldHi;
    const steps = 100 / VOLUME_STEP;
    // ЛЕСЕНКА — столбики растут слева направо; залиты те, что не выше громкости.
    const bars = Array.from({ length: steps }, (_, i) => {
      const at = (i + 1) * VOLUME_STEP;
      const fill = at <= volume ? ink : "transparent";
      return `<span data-step="${at}" style="flex:1;height:${30 + (70 * (i + 1)) / steps}%;border-radius:2px;background:${fill};box-shadow:inset 0 0 0 1.5px ${muted ? INK.off : INK.rim}"></span>`;
    }).join("");
    return `<div data-volume-row="${which}" data-muted="${muted}" style="display:flex;align-items:center;gap:12px;min-height:44px">`
      + `<span style="flex:none;width:78px;font:400 14px Tiny5,monospace;color:${muted ? INK.off : INK.ink}">${which === "voice" ? "Голосовые" : "Громкость"}</span>`
      + `<label style="position:relative;flex:1;height:32px;display:flex;align-items:flex-end;gap:3px">${bars}`
      + `<input data-volume="${which}" type="range" min="0" max="100" step="${VOLUME_STEP}" value="${volume}" aria-label="Громкость" style="position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;touch-action:none"></label>`
      + `<span data-volume-value="${which}" style="flex:none;width:40px;text-align:right;font:400 13px Tiny5,monospace;color:${muted ? INK.off : INK.ink}">${volume}%</span></div>`;
  }

  // НОЧНЫЕ СБОРКИ — снимки клиента на маке. Список спрашивается у сервера один раз, при первом открытии окна.
  let builds: number[] | null = null;
  const chosen = () => readBuild(new URLSearchParams(location.search).get("build") ?? "");
  const goTo = (build: number | null) => {
    const url = new URL(location.href);
    if (build === null) url.searchParams.delete("build");
    else url.searchParams.set("build", String(build));
    location.replace(url.toString());
  };
  async function askBuilds(): Promise<void> {
    if (builds) return;
    try {
      const got = (await (await fetch(`${HOST}/table/builds.json`)).json()) as { builds?: unknown };
      builds = sortBuilds((Array.isArray(got.builds) ? got.builds : []).map(String));
    } catch {
      builds = [];
    }
    if (settings.open) render();
  }

  function buildsHtml(): string {
    if (!builds?.length) return "";
    const now = chosen();
    const chip = (build: number | null, label: string) => {
      const on = build === now;
      return `<button data-build="${build ?? ""}" aria-pressed="${on}" style="min-width:56px;height:32px;padding:0 10px;border:0;border-radius:8px;cursor:pointer;font:400 13px Tiny5,monospace;`
        + (on ? `color:${INK.black};background:linear-gradient(${INK.goldHi},${INK.goldLo});box-shadow:inset 0 0 0 2px ${INK.black}` : `color:${INK.ink};background:transparent;box-shadow:inset 0 0 0 2px ${INK.rim}`)
        + `">${label}</button>`;
    };
    return section("Ночные сборки")
      + `<div data-builds style="display:flex;flex-wrap:wrap;gap:6px">${chip(null, "последняя")}${builds.map((b) => chip(b, String(b))).join("")}</div>`
      + `<div style="font:400 10px Tiny5,monospace;color:${INK.dim};padding-top:6px">Сервер всегда последний: в старой сборке видно только её клиент.</div>`;
  }

  function speedHtml(): string {
    const off = world.motion.reduce;
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px">`
      + `<span style="font:400 14px Tiny5,monospace;color:${off ? INK.off : INK.ink}">Скорость</span><span style="display:flex;gap:6px">`
      + SPEEDS.map((sp) => {
        const on = world.motion.speed === sp;
        return `<button data-speed="${sp}" aria-pressed="${on}" style="width:44px;height:32px;border:0;border-radius:8px;cursor:pointer;font:400 13px Tiny5,monospace;`
          + (on ? `color:${INK.black};background:linear-gradient(${INK.goldHi},${INK.goldLo});box-shadow:inset 0 0 0 2px ${INK.black}` : `color:${INK.ink};background:transparent;box-shadow:inset 0 0 0 2px ${INK.rim}`)
          + `">${sp}x</button>`;
      }).join("") + `</span></div>`;
  }

  function render(): void {
    const { sound, haptic, motion, look } = world;
    // ОКНО ПРОКРУЧИВАЕТСЯ ПАЛЬЦЕМ. У страницы стола `touch-action:none` — палец там тянет карту, а не страницу;
    // здесь его надо вернуть, иначе на коротком экране низ настроек не достать. `data-scroll` — чтобы касание
    // внутри не считалось нажатием кнопки (вибрация).
    layer.innerHTML = `<div data-settings-panel data-scroll role="dialog" aria-modal="true" aria-label="Настройки" style="width:min(360px,100%);max-height:100%;min-height:0;overflow-y:auto;overflow-x:hidden;`
      + `touch-action:pan-y;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;box-sizing:border-box;padding:14px 18px 16px;border-radius:14px;`
      + `background:${INK.well};box-shadow:inset 0 0 0 3px ${INK.black},inset 0 0 0 5px ${INK.wood},0 10px 0 rgba(11,7,4,.5)">`
      + `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><span style="font:400 18px Tiny5,monospace;color:${INK.ink}">Настройки</span>`
      + `<button data-settings-close aria-label="Закрыть" style="width:40px;height:40px;border:0;border-radius:10px;cursor:pointer;color:${INK.ink};font:400 18px Tiny5,monospace;background:transparent;box-shadow:inset 0 0 0 2px ${INK.rim}">✕</button></div>`
      + (fullscreenable() ? section("Экран") + toggle("fullscreen", "Полный экран", app()?.isFullscreen === true) : "")
      + section(haptic.supported ? "Звук и вибрация" : "Звук")
      + toggle("mute", "Отключить все звуки", sound.prefs.muted)
      + toggle("uiMute", "Отключить звуки интерфейса", sound.prefs.uiMuted)
      + toggle("voiceMute", "Отключить голосовые", sound.prefs.voiceMuted)
      + volumeHtml("table")
      + volumeHtml("voice")
      + toggle("spatial", "Объёмный звук", sound.prefs.spatial)
      + (haptic.supported ? toggle("haptic", "Вибрация", haptic.on) : "")
      + section("Анимации")
      + speedHtml()
      + toggle("reduce", motion.chosen || !motion.reduce ? "Меньше анимаций" : "Меньше анимаций · авто", motion.reduce)
      + section("Колода")
      + toggle("fourColour", "4 цвета", look.fourColour) + toggle("cyrillic", "Кириллица", look.cyrillic)
      + buildsHtml()
      + `<div data-client style="font:400 10px Tiny5,monospace;color:${INK.dim};padding-top:14px">${world.footer()}</div></div>`;
  }

  layer.addEventListener("pointerdown", (e) => e.stopPropagation());
  layer.addEventListener("click", (e) => {
    const target = e.target as Element;
    if (target === layer || target.closest("[data-settings-close]")) return settings.hide();
    const build = target.closest<HTMLElement>("[data-build]");
    if (build) return goTo(readBuild(build.dataset.build ?? ""));
    const speed = target.closest<HTMLElement>("[data-speed]");
    if (speed) {
      world.motion.setSpeed(Number(speed.dataset.speed) as Speed);
      return render();
    }
    const el = target.closest<HTMLElement>("[data-look]");
    if (!el) return;
    const { sound, haptic, motion, look } = world;
    switch (el.dataset.look) {
      case "fullscreen":
        if (app()?.isFullscreen) app()?.exitFullscreen?.();
        else app()?.requestFullscreen?.();
        break;
      case "mute":
        sound.prefs.muted = !sound.prefs.muted;
        sound.save();
        break;
      case "uiMute":
        sound.prefs.uiMuted = !sound.prefs.uiMuted;
        sound.save();
        break;
      case "voiceMute":
        sound.prefs.voiceMuted = !sound.prefs.voiceMuted;
        sound.save();
        break;
      case "spatial":
        sound.prefs.spatial = !sound.prefs.spatial;
        sound.save();
        break;
      case "haptic":
        haptic.on = !haptic.on;
        haptic.save();
        break;
      case "reduce":
        motion.setReduce(!motion.reduce);
        break;
      case "fourColour":
      case "cyrillic":
        look[el.dataset.look] = !look[el.dataset.look];
        world.lookChanged();
        break;
    }
    render();
  });
  // Ползунок — без пересборки: палец остаётся на нём, меняются только столбики и число.
  layer.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.matches("[data-volume]")) return;
    const which = input.dataset.volume === "voice" ? "voice" : "table";
    const p = world.sound.prefs;
    const value = Number(input.value);
    if (which === "voice") p.voiceVolume = value;
    else p.volume = value;
    world.sound.save();
    const row = layer.querySelector<HTMLElement>(`[data-volume-row="${which}"]`)!;
    const muted = p.muted || (which === "voice" ? p.voiceMuted : p.uiMuted);
    for (const bar of row.querySelectorAll<HTMLElement>("[data-step]")) bar.style.background = Number(bar.dataset.step) <= value ? (muted ? INK.off : INK.goldHi) : "transparent";
    row.querySelector<HTMLElement>("[data-volume-value]")!.textContent = `${value}%`;
  });

  const settings: Settings = {
    get open() {
      return layer.style.display !== "none";
    },
    show() {
      void askBuilds();
      render();
      layer.style.display = "flex";
      world.changed();
    },
    hide() {
      layer.style.display = "none";
      layer.innerHTML = "";
      world.changed();
    },
  };

  // МЕНЮ TELEGRAM — пункт «Настройки» в «⋯»; полный экран, включённый или снятый жестом Telegram, — в тумблер.
  const tg = app();
  if (tg?.SettingsButton && tg.isVersionAtLeast?.("7.0")) {
    tg.SettingsButton.onClick(() => settings.show());
    tg.SettingsButton.show();
  }
  tg?.onEvent?.("fullscreenChanged", () => settings.open && render());
  world.motion.onChange(() => settings.open && render());
  return settings;
}
