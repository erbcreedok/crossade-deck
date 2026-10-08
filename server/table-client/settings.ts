// ОКНО НАСТРОЕК — модальное, поверх стола, с кнопкой «закрыть». Открывается шестерёнкой и пунктом «Настройки» в меню
// Telegram (`SettingsButton`). Всё в нём личное и живёт на устройстве.
//
// Своим слоем, а не в разметке стола: та пересобирается каждым кадром, и ползунок громкости терял бы палец.

import { SPEEDS, type Speed } from "../src/table/motion.js";
import type { DeckLook } from "./deckArt.js";
import { fullscreenable as canFullscreen } from "./fullscreen.js";
import type { TableHaptic } from "./haptic.js";
import type { Motion } from "./motion.js";
import { VOLUME_STEP, type TableSound } from "./sound.js";

const INK = { black: "#0b0704", ink: "#f5ead0", dim: "#cdb98f", off: "#6f6452", well: "#1c120b", wood: "#6b4d2c", plateHi: "#25321f", plateLo: "#16210f", rim: "#6b4d2c", goldHi: "#f8d885", goldLo: "#b08a26", gold: "#f0c86a" };

/** Открыт 3D-вид (`/table/3d`), а не обычный. */
const in3d = (): boolean => /\/3d\/?$/.test(location.pathname);

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
  /** Тронули громкость или выключатель звука — тем, кто звучит ПРЯМО СЕЙЧАС, её надо переложить. */
  soundChanged(): void;
  /** Строка внизу: номер сборки и клиент. */
  footer(): string;
  /** Открылось или закрылось — стол перерисовывает шестерёнку. */
  changed(): void;
  /**
   * ЗАПИСЬ ПАРТИИ — каждому за столом. `may` говорит, показывать ли раздел; `ask` просит у стола
   * пропуск, `link` отдаёт готовый адрес, когда пропуск пришёл.
   *
   * Ссылку собирает экран, а не сервер: страница открыта по тому имени, по которому стол виден
   * снаружи, а сервер своего внешнего имени может и не знать — он живёт за туннелем.
   */
  replay: {
    may(): boolean;
    ask(): void;
    link(): string | null;
  };
  /**
   * НАТИВНОЕ ПРИЛОЖЕНИЕ (Crossade) — тем же человеком за этот же стол. `ask` просит у стола пропуск,
   * `link` отдаёт адрес перехода, когда пропуск пришёл, `open` открывает его наружу — в Safari, откуда
   * он передаётся приложению.
   */
  app: {
    may(): boolean;
    ask(): void;
    link(): string | null;
    open(url: string): void;
  };
  /** Измерители поверх стола: пинг, кадры, камера (`meters.ts`). */
  meters: { on(): boolean; toggle(): void };
  /** Фигуры за столом (`figures.ts`): выключены — кружки на стульях, как до фигур; для слабых телефонов. */
  figures: { on(): boolean; toggle(): void };
  /** Показ натяжения шеи в 3D: виньетка по краям экрана и датчик у рейки камеры; у остальных видов нет. */
  neckViz?: { vignette: { on(): boolean; toggle(): void }; gauge: { on(): boolean; toggle(): void } };
  /** ВИД АВАТАРА — как меня видят за столом (`bodies.ts`, `MODELS`): стул или спрайты короля. */
  /** Выбор вида аватара; нет — раздела нет (пока у всех один вид). */
  avatar?: { model(): string; set(model: string): void };
  /** Обзор камеры — угол зрения в градусах; нет — раздела нет (у 2D-стола камеры нет). */
  view?: { min: number; max: number; get(): number; set(deg: number): void };
  /** Размер карт в своей руке, в процентах от обычного. */
  cardSize?: { min: number; max: number; get(): number; set(pct: number): void };
  /** DEV, только локально: размер людей за столом в 3D, проценты. */
  dollSize?: { min: number; max: number; get(): number; set(pct: number): void };
  /** СЛИЯНИЕ СТОПОК (настройки стола, ставит тот, кто может стопкам): времена удержания, режимы сторон, ручки тряски. Нет или `may()` ложно — раздела нет. */
  merge?: {
    may(): boolean;
    knobs: { key: string; label: string; min: number; max: number; step: number; get(): number; set(value: number): void }[];
    modes: { key: string; label: string; options: [string, string][]; get(): string; set(value: string): void }[];
  };
  /** Запись моего экрана — камера, нажатия, звук (`SCREEN_PRIVATE`); по умолчанию выключена. */
  record: { on(): boolean; toggle(): void };
}

export interface Settings {
  readonly open: boolean;
  show(): void;
  hide(): void;
  /** Перерисовать, если открыто: пришло то, что окно показывает (ссылка на запись). */
  refresh(): void;
}

export function mountSettings(host: HTMLElement, world: SettingsWorld): Settings {
  const app = () => (globalThis as { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp;
  // Полный экран: в Telegram — его собственный (`requestFullscreen` Bot API), в обычном браузере — Fullscreen API страницы (на айфоне в Safari его нет — тумблера тогда нет).
  type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?(): void };
  type FsEl = HTMLElement & { webkitRequestFullscreen?(): void };
  const pageFs = (): boolean => !!document.documentElement && (typeof document.documentElement.requestFullscreen === "function" || typeof (document.documentElement as FsEl).webkitRequestFullscreen === "function");
  const pageFsOn = (): boolean => !!(document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement);
  const fullscreenable = () => canFullscreen(app()) || pageFs();
  const fullscreenIs = (): boolean => (canFullscreen(app()) ? app()?.isFullscreen === true : pageFsOn());
  const fullscreenFlip = (): void => {
    if (canFullscreen(app())) { if (app()?.isFullscreen) app()?.exitFullscreen?.(); else app()?.requestFullscreen?.(); return; }
    if (pageFsOn()) { if (document.exitFullscreen) void document.exitFullscreen(); else (document as FsDoc).webkitExitFullscreen?.(); }
    else { const el = document.documentElement as FsEl; if (el.requestFullscreen) void el.requestFullscreen().catch(() => {}); else el.webkitRequestFullscreen?.(); }
  };

  const layer = document.createElement("div");
  layer.dataset.settingsLayer = "";
  layer.style.cssText = "position:fixed;inset:0;z-index:300;display:none;align-items:center;justify-content:center;box-sizing:border-box;"
    + "padding:calc(16px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px)) 16px calc(16px + env(safe-area-inset-bottom));"
    + "touch-action:pan-y;background:rgba(11,7,4,.62)";
  host.append(layer);

  /**
   * ЗАПИСЬ ПАРТИИ: кнопка просит ссылку, и она же показывает её, когда та пришла.
   *
   * Ссылка показывается целиком, а не прячется за «скопировано»: её пересылают из Telegram, где
   * буфер обмена работает не везде, и увидеть её глазами надо всегда.
   */
  const replayHtml = () => {
    const адрес = world.replay.link();
    const кнопка = `<button data-look="replay" style="width:100%;min-height:40px;border:0;cursor:pointer;border-radius:10px;padding:8px 12px;`
      + `background:linear-gradient(${INK.goldHi},${INK.goldLo});color:${INK.black};font:400 13px Tiny5,monospace">`
      + `${адрес === null ? "Получить ссылку" : "Обновить ссылку"}</button>`;
    const строка = адрес === null
      ? `<div style="font:400 11px Tiny5,monospace;color:${INK.dim};padding-top:6px">Ссылку можно переслать: она открывает только эту запись.</div>`
      : `<a data-replay-link href="${адрес}" target="_blank" rel="noreferrer" style="display:block;word-break:break-all;font:400 11px Tiny5,monospace;color:${INK.gold};padding-top:6px">${адрес}</a>`;
    return кнопка + строка;
  };

  /**
   * ПРИЛОЖЕНИЕ: первая кнопка просит пропуск, вторая открывает приложение. В два нажатия, потому что
   * Telegram открывает внешнюю ссылку только прямо из нажатия, а пропуск приходит с сервера позже.
   */
  const appHtml = () => {
    const адрес = world.app.link();
    return `<button data-look="${адрес === null ? "app" : "appOpen"}" style="width:100%;min-height:40px;border:0;cursor:pointer;border-radius:10px;padding:8px 12px;`
      + `background:linear-gradient(${INK.goldHi},${INK.goldLo});color:${INK.black};font:400 13px Tiny5,monospace">`
      + `${адрес === null ? "Получить пропуск" : "Открыть в приложении"}</button>`
      + `<div style="font:400 11px Tiny5,monospace;color:${INK.dim};padding-top:6px">`
      + `${адрес === null ? "Приложение сядет за этот стол тобой, на твой стул." : "Пропуск на 12 часов. Не пересылай: с ним за стол садятся тобой."}</div>`;
  };

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
      + `<input data-volume="${which}" type="range" min="0" max="100" step="${VOLUME_STEP}" value="${volume}" aria-label="Громкость" style="position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;touch-action:pan-y"></label>`
      + `<span data-volume-value="${which}" style="flex:none;width:40px;text-align:right;font:400 13px Tiny5,monospace;color:${muted ? INK.off : INK.ink}">${volume}%</span></div>`;
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

  function cardSizeHtml(v: NonNullable<SettingsWorld["cardSize"]>): string {
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 2px">`
      + `<input data-card-size type="range" min="${v.min}" max="${v.max}" step="5" value="${Math.round(v.get())}" aria-label="Размер карт в руке" style="flex:1;min-width:0;margin:0;cursor:pointer;touch-action:pan-y;accent-color:${INK.goldHi}">`
      + `<span data-card-size-value style="flex:none;width:48px;text-align:right;font:400 13px Tiny5,monospace;color:${INK.ink}">${Math.round(v.get())}%</span></div>`;
  }
  function dollSizeHtml(v: NonNullable<SettingsWorld["dollSize"]>): string {
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 2px">`
      + `<input data-doll-size type="range" min="${v.min}" max="${v.max}" step="5" value="${Math.round(v.get())}" aria-label="Размер людей (DEV)" style="flex:1;min-width:0;margin:0;cursor:pointer;touch-action:pan-y;accent-color:${INK.goldHi}">`
      + `<span data-doll-size-value style="flex:none;width:48px;text-align:right;font:400 13px Tiny5,monospace;color:${INK.ink}">${Math.round(v.get())}%</span></div>`;
  }
  function viewHtml(v: NonNullable<SettingsWorld["view"]>): string {
    return `<div style="display:flex;align-items:center;gap:12px;min-height:44px"><span style="flex:none;width:78px;font:400 14px Tiny5,monospace;color:${INK.ink}">Обзор</span>`
      + `<input data-view type="range" min="${v.min}" max="${v.max}" step="1" value="${Math.round(v.get())}" aria-label="Обзор камеры" style="flex:1;min-width:0;margin:0;cursor:pointer;touch-action:pan-y;accent-color:${INK.goldHi}">`
      + `<span data-view-value style="flex:none;width:40px;text-align:right;font:400 13px Tiny5,monospace;color:${INK.ink}">${Math.round(v.get())}°</span></div>`;
  }

  function mergeHtml(m: NonNullable<SettingsWorld["merge"]>): string {
    const row = (label: string, body: string) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:40px;padding:2px 0"><span style="flex:1;min-width:0;font:400 12px Tiny5,monospace;color:${INK.ink}">${label}</span>${body}</div>`;
    const field = `width:70px;background:${INK.black};color:${INK.ink};border:0;box-shadow:inset 0 0 0 2px ${INK.rim};padding:6px;font:400 13px Tiny5,monospace`;
    return m.modes.map((o) => row(o.label, `<span style="display:flex;gap:4px">` + o.options.map(([v, t]) => `<button data-merge-mode="${o.key}:${v}" style="border:0;cursor:pointer;padding:6px 8px;font:400 11px Tiny5,monospace;color:${INK.ink};${o.get() === v ? `background:linear-gradient(${INK.goldHi},${INK.goldLo});color:${INK.black}` : `background:${INK.plateLo}`}">${t}</button>`).join("") + `</span>`)).join("")
      + m.knobs.map((k) => row(k.label, `<input data-merge-knob="${k.key}" type="number" min="${k.min}" max="${k.max}" step="${k.step}" value="${k.get()}" style="${field}">`)).join("");
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
      + section("Экран") + (fullscreenable() ? toggle("fullscreen", "Полный экран", fullscreenIs()) : "")
      + toggle("figures", "Фигуры за столом", world.figures.on())
      + (world.replay.may() ? section("Запись партии") + replayHtml() : "")
      + toggle("record", "Записывать мой экран", world.record.on())
      + (world.app.may() ? section("Приложение Crossade") + appHtml() : "")
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
      + (world.view ? section("Камера") + viewHtml(world.view) : "")
      + (world.neckViz ? toggle("neck-vignette", "Виньетка натяжения шеи", world.neckViz.vignette.on()) + toggle("neck-gauge", "Датчик натяжения у рейки", world.neckViz.gauge.on()) : "")
      + (world.cardSize ? section("Карты в руке") + cardSizeHtml(world.cardSize) : "")
      + (world.dollSize ? section("Люди за столом (DEV)") + dollSizeHtml(world.dollSize) : "")
      + (world.avatar ? section("Аватар")
        + toggle("avatar-seat", "Стул", world.avatar.model() === "seat")
        + toggle("avatar-king", "Король треф", world.avatar.model() === "king") : "")
      + (world.merge?.may() ? section("Слияние стопок") + mergeHtml(world.merge) : "")
      + section("Вид стола")
      + toggle("view3d", "3D-вид (вместо обычного)", in3d())
      + section("Колода")
      + toggle("fourColour", "4 цвета", look.fourColour) + toggle("cyrillic", "Кириллица", look.cyrillic)
      + section("Отладка")
      + toggle("meters", "Пинг, кадры и камера", world.meters.on())
      + `<div data-client style="font:400 10px Tiny5,monospace;color:${INK.dim};padding-top:14px">${world.footer()}</div></div>`;
  }

  layer.addEventListener("pointerdown", (e) => e.stopPropagation());
  layer.addEventListener("click", (e) => {
    const target = e.target as Element;
    if (target === layer || target.closest("[data-settings-close]")) return settings.hide();
    const mode = target.closest<HTMLElement>("[data-merge-mode]");
    if (mode && world.merge) {
      const [key, value] = mode.dataset.mergeMode!.split(":");
      world.merge.modes.find((o) => o.key === key)?.set(value!);
      return render();
    }
    const speed = target.closest<HTMLElement>("[data-speed]");
    if (speed) {
      world.motion.setSpeed(Number(speed.dataset.speed) as Speed);
      return render();
    }
    const el = target.closest<HTMLElement>("[data-look]");
    if (!el) return;
    const { sound, haptic, motion, look } = world;
    switch (el.dataset.look) {
      case "replay":
        world.replay.ask();
        break;
      case "app":
        world.app.ask();
        break;
      case "appOpen": {
        const адрес = world.app.link();
        if (адрес !== null) world.app.open(адрес);
        break;
      }
      case "meters":
        world.meters.toggle();
        break;
      case "figures":
        world.figures.toggle();
        break;
      case "neck-vignette":
        world.neckViz?.vignette.toggle();
        break;
      case "neck-gauge":
        world.neckViz?.gauge.toggle();
        break;
      case "avatar-seat":
      case "avatar-king":
        world.avatar?.set(el.dataset.look.slice("avatar-".length));
        break;
      case "record":
        world.record.toggle();
        break;
      case "fullscreen":
        fullscreenFlip();
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
      case "view3d":
        // Та же комната, тот же вход: меняется только экран. Адрес с `#` (подпись Telegram) уходит целиком.
        location.href = `${in3d() ? "/table/" : "/table/3d"}${location.search}${location.hash}`;
        return;
      case "fourColour":
      case "cyrillic":
        look[el.dataset.look] = !look[el.dataset.look];
        world.lookChanged();
        break;
    }
    // Зовём на любой переключатель, а не только на звуковые: перекладывать громкость дёшево, а забыть
    // добавить сюда новый выключатель звука — легко.
    world.soundChanged();
    render();
  });
  // Ползунок — без пересборки: палец остаётся на нём, меняются только столбики и число.
  layer.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.matches("[data-merge-knob]") || !world.merge) return;
    const k = world.merge.knobs.find((x) => x.key === input.dataset.mergeKnob);
    if (k) k.set(Math.max(k.min, Math.min(k.max, Math.round(Number(input.value) || k.get()))));
  });
  layer.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.matches("[data-card-size]") && world.cardSize) {
      world.cardSize.set(Number(input.value));
      layer.querySelector<HTMLElement>("[data-card-size-value]")!.textContent = `${Math.round(world.cardSize.get())}%`;
      return;
    }
    if (input.matches("[data-doll-size]") && world.dollSize) {
      world.dollSize.set(Number(input.value));
      layer.querySelector<HTMLElement>("[data-doll-size-value]")!.textContent = `${Math.round(world.dollSize.get())}%`;
      return;
    }
    if (input.matches("[data-view]") && world.view) {
      world.view.set(Number(input.value));
      layer.querySelector<HTMLElement>("[data-view-value]")!.textContent = `${Math.round(world.view.get())}°`;
      return;
    }
    if (!input.matches("[data-volume]")) return;
    const which = input.dataset.volume === "voice" ? "voice" : "table";
    const p = world.sound.prefs;
    const value = Number(input.value);
    if (which === "voice") p.voiceVolume = value;
    else p.volume = value;
    world.sound.save();
    world.soundChanged();
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
      render();
      layer.style.display = "flex";
      world.changed();
    },
    refresh() {
      if (layer.style.display !== "none") render();
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
  document.addEventListener("fullscreenchange", () => settings.open && render());
  world.motion.onChange(() => settings.open && render());
  return settings;
}
