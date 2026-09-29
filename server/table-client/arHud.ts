// HUD AR-СТОЛА — две круглые кнопки внизу справа, столбиком над 💬, и окно якоря. Только разметка и кнопки: что
// они делают, решает `ar.ts`.
//
//   ( якорь )
//   ( выход из AR )
//   ( 💬 )
//
// Кнопки — того же вида, что шестерёнка и журнал. Место — `--ar-right`/`--ar-top` от экрана (над 💬; без стула —
// у правого края внизу). Значок якоря говорит, за что держится стол: белый — перед собой, золотой — предмет виден,
// тусклый — предмет не виден; точка — камера смотрит на предмет. Выход из AR — куб, перечёркнутый крестом: это
// выход из режима, а не из комнаты (выход из комнаты — дверь слева сверху).
//
// Окно якоря — того же вида, что «Настройки»: строка «сейчас» (за что держится стол, что с камерой),
// предметы, «плашмя», «подогнать». Съёмка, сборка метки и подгонка — плашкой под
// верхним рядом: окно на это время уходит, чтобы не закрывать стол.
//
// СЪЁМКА ПОКАЗЫВАЕТ, ГОДИТСЯ ЛИ КАДР, ПОКА ЦЕЛИШЬСЯ: опорные точки — прямо в рамке, под ними — полоса и
// приговор (`arQuality.ts`), как на стенде. Обновляются они на месте, без пересборки плашки: кнопка
// «Снять» под пальцем не пересоздаётся.

import type { Quality } from "./arQuality.js";
import type { ArSeat } from "./arSeat.js";
import { BAR_LOOK, T } from "./screenConst.js";

export interface HudMarker { id: string; name: string; thumb: string; points: number }

export interface HudState {
  /** За что держится стол: гравитация или предмет из «моих». */
  anchor: "gravity" | "marker";
  seen: "search" | "seen" | "lost";
  /** Камера за столом: выключена, включается, включена, или словами — почему её нет. */
  camera: "off" | "starting" | "on" | { error: string };
  fitting: boolean;
  seat: ArSeat;
  markers: HudMarker[];
  active: string | null;
  /** Что открыто поверх стола: окно якоря, съёмка, сборка метки. */
  sheet: null | "menu" | "capture" | "compile";
  progress: number;
}

export interface HudActions {
  exit(): void;
  menu(open: boolean): void;
  /** Закрыть окно или бросить съёмку. */
  close(): void;
  fit(on: boolean): void;
  fitDone(): void;
  fitReset(): void;
  fitCancel(): void;
  gravity(): void;
  use(id: string): void;
  forget(id: string): void;
  shoot(): void;
  capture(): void;
  flat(): void;
  again(): void;
}

/** Правый край ряда — как левый у шестерёнки (`RIM_LEFT` экрана): у края телефон забирает касания себе. */
const RIGHT = "var(--ar-right, 28px)";
/** Верх нижней кнопки (выход); якорь — над ней. */
const LOW_TOP = "var(--ar-top, calc(100dvh - 240px))";
const DIM = "#cdb98f";
const plate = `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${BAR_LOOK.rim}`;
const panelLook = `background:${T.well};box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${T.wood},0 10px 0 rgba(11,7,4,.5)`;
const chip = (on: boolean): string => (on
  ? `color:${T.black};background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});box-shadow:inset 0 0 0 2px ${T.black}`
  : `color:${T.ink};background:transparent;box-shadow:inset 0 0 0 2px ${BAR_LOOK.rim}`);

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Квадрат съёмки на экране — там, где его рисует рамка «снять». */
export function captureBox(w: number, h: number): { x: number; y: number; side: number } {
  const side = Math.round(Math.min(w, h) * 0.72);
  return { x: (w - side) / 2, y: Math.max(180, h * 0.42 - side / 2), side };
}

const ANCHOR_ICON = `<circle cx="12" cy="5" r="2"/><path d="M12 7v14"/><path d="M8 11h8"/><path d="M5 13a7 7 0 0 0 14 0"/>`;
/** Выход из AR: куб режима AR, перечёркнутый крестом. */
const EXIT_ICON = `<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" opacity=".55"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" opacity=".55"/><path d="M7 7l10 10M17 7L7 17" stroke-width="2.6"/>`;

export function mountHud(on: HudActions): { render(s: HudState): void; quality(q: Quality, side: number): void; dispose(): void } {
  const bar = document.createElement("div");
  bar.dataset.arBar = "";
  bar.style.cssText = "position:fixed;inset:0;z-index:61;pointer-events:none;";
  const layer = document.createElement("div");
  layer.dataset.arSheet = "";
  layer.style.cssText = "position:fixed;inset:0;z-index:300;display:none;align-items:center;justify-content:center;box-sizing:border-box;"
    + "padding:calc(16px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px)) 16px calc(16px + env(safe-area-inset-bottom));"
    + "touch-action:pan-y;background:rgba(11,7,4,.62)";
  const strip = document.createElement("div");
  strip.dataset.arStrip = "";
  strip.style.cssText = `position:fixed;left:12px;right:12px;top:calc(60px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px));z-index:62;display:none;`
    + `flex-direction:column;gap:8px;box-sizing:border-box;padding:12px 14px;border-radius:14px;${panelLook};color:${T.ink};font:400 13px/1.4 Tiny5,monospace`;
  const frame = document.createElement("div");
  frame.dataset.arFrame = "";
  frame.style.cssText = `position:fixed;z-index:44;display:none;border:3px solid ${T.gold};border-radius:14px;box-shadow:0 0 0 100vmax rgba(11,7,4,.45);pointer-events:none;`;
  const dots = document.createElement("canvas");
  dots.dataset.arDots = "";
  dots.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  frame.append(dots);
  const ring = document.createElement("div");
  ring.dataset.arFitRing = "";
  ring.style.cssText = `position:fixed;inset:0;z-index:43;display:none;pointer-events:none;box-shadow:inset 0 0 0 3px ${T.gold};`;
  document.body.append(bar, layer, strip, frame, ring);

  let state: HudState | null = null;
  const html: Record<string, string> = {};
  /** Разметка переписывается, только если изменилась: кнопка, пересозданная под пальцем, клика не получает. */
  const put = (el: HTMLElement, key: string, next: string): void => {
    if (html[key] === next) return;
    html[key] = next;
    el.innerHTML = next;
  };
  const act = (what: string, id: string | undefined): void => {
    if (what === "exit") on.exit();
    else if (what === "menu") on.menu(state?.sheet !== "menu");
    else if (what === "close") on.close();
    else if (what === "fit") on.fit(true);
    else if (what === "done") on.fitDone();
    else if (what === "reset") on.fitReset();
    else if (what === "cancel") on.fitCancel();
    else if (what === "gravity") on.gravity();
    else if (what === "use" && id) on.use(id);
    else if (what === "forget" && id) on.forget(id);
    else if (what === "new") on.capture();
    else if (what === "shoot") on.shoot();
    else if (what === "flat") on.flat();
    else if (what === "again") on.again();
  };
  // Делегат на корне, а не на кнопке: пересобранная разметка не теряет обработчик.
  for (const root of [bar, layer, strip]) {
    root.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (root === layer && t === layer) return void on.close(); // мимо окна — закрыть
      const b = t.closest<HTMLElement>("[data-ar-do]");
      if (!b) return;
      e.stopPropagation();
      const [what, id] = (b.dataset.arDo ?? "").split(":");
      act(what ?? "", id);
    });
    root.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  const status = (s: HudState): string => {
    const cam = s.camera === "on" ? "камера включена" : s.camera === "starting" ? "камера включается…" : s.camera === "off" ? "камера выключена" : `камеры нет: ${esc(s.camera.error)}`;
    if (s.anchor === "gravity") return `стол перед тобой, держится гироскопом${typeof s.camera === "object" ? ` · камеры нет: ${esc(s.camera.error)}` : ""} · ходить — зажми компас на секунду`;
    const name = s.markers.find((m) => m.id === s.active)?.name ?? "предмет";
    const seen = s.seen === "seen" ? "виден" : s.seen === "lost" ? "не виден — стол держит гироскоп" : "ищу его в кадре…";
    return `стол на «${esc(name)}»: ${seen} · ${cam}`;
  };

  function render(s: HudState): void {
    state = s;
    // ── кнопки ряда ─────────────────────────────────────────────────────────────────────────────
    const colour = s.anchor === "marker" ? (s.seen === "seen" ? T.gold : "rgba(255,255,255,.45)") : "white";
    const round = (up: number, what: string, label: string, icon: string, stroke: string, extra = ""): string =>
      `<button data-ar-do="${what}" aria-label="${label}" style="position:absolute;right:${RIGHT};top:calc(${LOW_TOP} - ${up}px);width:40px;height:40px;border:0;padding:0;`
      + `border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;${plate}">`
      + `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>${extra}</button>`;
    const dot = s.camera === "on" ? `<span data-ar-cam-dot style="position:absolute;right:6px;bottom:6px;width:8px;height:8px;border-radius:50%;background:${T.gold};box-shadow:0 0 0 2px ${T.black}"></span>` : "";
    const anchorSays = s.anchor === "gravity" ? "перед собой" : s.seen === "seen" ? "предмет виден" : "предмет не виден";
    put(bar, "bar", round(52, "menu", `Якорь стола: ${anchorSays}`, ANCHOR_ICON, colour, dot) + round(0, "exit", "Выйти из AR", EXIT_ICON, "white"));

    // ── окно якоря ──────────────────────────────────────────────────────────────────────────────
    const section = (title: string): string => `<div style="font:400 11px Tiny5,monospace;color:${DIM};padding:14px 0 4px;letter-spacing:.04em">${title}</div>`;
    const button = (what: string, label: string, onNow = false): string =>
      `<button data-ar-do="${what}" aria-pressed="${onNow}" style="height:32px;border:0;border-radius:8px;cursor:pointer;padding:0 12px;font:400 13px Tiny5,monospace;${chip(onNow)}">${label}</button>`;
    const toggle = (what: string, label: string, onNow: boolean): string => {
      const knob = onNow
        ? `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});box-shadow:inset 0 0 0 2px ${T.black}`
        : `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 3px ${BAR_LOOK.rim}`;
      return `<button data-ar-do="${what}" role="switch" aria-checked="${onNow}" style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:40px;border:0;padding:4px 0;background:none;cursor:pointer;color:${T.ink};font:400 14px Tiny5,monospace;text-align:left">`
        + `<span>${label}</span><span style="flex:none;width:44px;height:24px;border-radius:12px;position:relative;${knob}">`
        + `<span style="position:absolute;top:4px;left:${onNow ? 24 : 4}px;width:16px;height:16px;border-radius:50%;background:${onNow ? T.black : DIM}"></span></span></button>`;
    };
    const row = (inner: string): string => `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${inner}</div>`;
    let menu = "";
    if (s.sheet === "menu") {
      const markers = s.markers.map((m) => {
        const onNow = s.anchor === "marker" && m.id === s.active;
        return `<div style="display:flex;gap:10px;align-items:center;min-height:48px">`
          + `<button data-ar-do="use:${m.id}" aria-pressed="${onNow}" style="flex:1;min-width:0;display:flex;gap:10px;align-items:center;border:0;border-radius:8px;padding:4px;cursor:pointer;text-align:left;font:400 13px Tiny5,monospace;${chip(onNow)}">`
          + `<img src="${m.thumb}" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex:none"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name)}</span></button>`
          + `<button data-ar-do="forget:${m.id}" aria-label="Удалить ${esc(m.name)}" style="flex:none;width:32px;height:32px;border:0;border-radius:8px;cursor:pointer;font:400 14px Tiny5,monospace;${chip(false)}">✕</button></div>`;
      }).join("");
      menu = `<div role="dialog" aria-modal="true" aria-label="Якорь стола" data-scroll style="width:min(360px,100%);max-height:100%;overflow-y:auto;box-sizing:border-box;padding:14px 18px 16px;border-radius:14px;${panelLook}">`
        + `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><span style="font:400 18px Tiny5,monospace;color:${T.ink}">Якорь стола</span>`
        + `<button data-ar-do="close" aria-label="Закрыть" style="width:40px;height:40px;border:0;border-radius:10px;cursor:pointer;color:${T.ink};font:400 18px Tiny5,monospace;background:transparent;box-shadow:inset 0 0 0 2px ${BAR_LOOK.rim}">✕</button></div>`
        + `<div data-ar-now style="font:400 12px/1.5 Tiny5,monospace;color:${DIM};padding-top:8px">Сейчас: ${status(s)}</div>`
        + section("Стол держится за") + row(button("gravity", "Перед собой", s.anchor === "gravity") + button("new", "Снять предмет"))
        + (markers ? `<div style="display:flex;flex-direction:column;gap:6px;padding-top:8px">${markers}</div>` : "")
        + (s.anchor === "marker" ? section("На предмете") + toggle("flat", "Стол плашмя", s.seat.flat) + row(button("again", "Поставить заново")) : "")
        + section("Посадка") + row(button("fit", "Подогнать"))
        + `</div>`;
    }
    put(layer, "menu", menu);
    layer.style.display = menu ? "flex" : "none";

    // ── плашка: подгонка, съёмка, сборка ────────────────────────────────────────────────────────
    let note = "";
    const small = (t: string): string => `<div style="color:${DIM};font-size:12px">${t}</div>`;
    const title = (t: string): string => `<div style="font:400 15px Tiny5,monospace;color:${T.ink}">${t}</div>`;
    if (s.fitting) {
      const st = s.seat;
      note = title("Подгонка") + small("один палец — сдвиг · два: развести — размер, вместе вверх-вниз — наклон")
        + `<div data-ar-seat style="color:${DIM};font-size:12px">наклон <span style="color:${T.gold}">${Math.round(st.tilt)}°</span> · размер <span style="color:${T.gold}">×${st.zoom.toFixed(2)}</span> · сдвиг <span style="color:${T.gold}">${st.x.toFixed(1)}, ${st.y.toFixed(1)}</span></div>`
        + row(button("done", "Готово", true) + button("reset", "Сброс") + button("cancel", "Отмена"));
    } else if (s.sheet === "capture") {
      note = title("Новый предмет") + small("наведи рамку на плоскую вещь с рисунком — картину, доску, журнал")
        + `<div style="height:10px;border-radius:5px;background:${T.black};overflow:hidden"><i data-ar-meter style="display:block;height:100%;width:0;background:#e0483f"></i></div>`
        + `<div data-ar-verdict style="font-size:13px"></div><div data-ar-nums style="color:${DIM};font-size:12px"></div>`
        + row(button("shoot", "Снять", true) + button("close", "Отмена"));
    } else if (s.sheet === "compile") {
      note = title("Собираю метку…") + `<div style="height:10px;border-radius:5px;background:${T.black};overflow:hidden"><i style="display:block;height:100%;width:${Math.round(s.progress)}%;background:${T.gold}"></i></div>`
        + small(`${Math.round(s.progress)}% · всё считается на телефоне`);
    }
    put(strip, "note", note);
    strip.style.display = note ? "flex" : "none";

    const box = captureBox(innerWidth, innerHeight);
    frame.style.display = s.sheet === "capture" ? "block" : "none";
    Object.assign(frame.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.side}px`, height: `${box.side}px` });
    ring.style.display = s.fitting ? "block" : "none";
  }

  const VERDICT: Record<Quality["verdict"], [string, string]> = {
    ok: ["годится — жми «Снять»", "#7fd1b9"],
    few: ["мало рисунка — нужен узор по всей рамке", "#e0483f"],
    blur: ["смазано — замри или добавь света", "#e08b3f"],
    glare: ["блик — наклони, убери отражение", "#e08b3f"],
  };
  /** Годность кадра в рамке съёмки: точки поверх рамки, полоса, приговор, числа. `side` — сторона разбора, px. */
  function quality(q: Quality, side: number): void {
    const px = frame.clientWidth * (devicePixelRatio || 1);
    if (dots.width !== px) { dots.width = px; dots.height = px; }
    const g = dots.getContext("2d")!, k = px / side;
    g.clearRect(0, 0, px, px);
    g.fillStyle = q.verdict === "ok" ? "#7fd1b9" : T.gold;
    for (const p of q.points) { g.beginPath(); g.arc(p.x * k, p.y * k, 2.5 * (devicePixelRatio || 1), 0, Math.PI * 2); g.fill(); }
    const [text, colour] = VERDICT[q.verdict];
    frame.style.borderColor = q.verdict === "ok" ? "#7fd1b9" : T.gold;
    const meter = strip.querySelector<HTMLElement>("[data-ar-meter]"), verdict = strip.querySelector<HTMLElement>("[data-ar-verdict]"), nums = strip.querySelector<HTMLElement>("[data-ar-nums]");
    if (meter) { meter.style.width = `${Math.round(q.score * 100)}%`; meter.style.background = colour; }
    if (verdict) { verdict.textContent = text; verdict.style.color = colour; verdict.dataset.verdict = q.verdict; }
    if (nums) nums.textContent = `углов ${q.count} · покрытие ${Math.round(q.coverage * 100)}% · резкость ${q.sharp.toFixed(2)} · блик ${Math.round(q.glare * 100)}%`;
  }

  return {
    render,
    quality,
    dispose() { bar.remove(); layer.remove(); strip.remove(); frame.remove(); ring.remove(); },
  };
}
