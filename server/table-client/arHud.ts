// HUD AR-СТОЛА — верхняя полоса и листы снизу. Только разметка и кнопки: что они делают, решает `ar.ts`.
//
//   [✕]  [⚓ якорь]  [подогнать]        — полоса слева сверху, вторым рядом под шапкой стола
//
// ЯКОРЬ говорит, за что держится стол: «перед собой» (гравитация), «картина ✓» (предмет виден),
// «картину не вижу», «ищу картину…». Тап по нему — лист якоря: перед собой, мои предметы, снять новый,
// «на предмет / плашмя», «поставить заново».
//
// ПОДГОНКА — свой лист и слой поверх стола (его держит `ar.ts`): один палец — сдвиг, два — размер и наклон.

import type { ArSeat } from "./arSeat.js";
import { BAR_LOOK, T } from "./screenConst.js";

export interface HudMarker { id: string; name: string; thumb: string; points: number }

export interface HudState {
  anchor: "gravity" | "marker";
  seen: "search" | "seen" | "lost";
  fitting: boolean;
  seat: ArSeat;
  markers: HudMarker[];
  active: string | null;
  /** Лист снизу: меню якоря, съёмка, сборка метки, ошибка словами. */
  sheet: null | "menu" | "capture" | "compile" | { error: string };
  progress: number;
}

export interface HudActions {
  exit(): void;
  menu(open: boolean): void;
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

/** Вторым рядом, под шестерёнкой, журналом и именем стола (они — 12…52 px). */
const TOP = "calc(60px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px))";
const plate = `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});color:${T.ink};box-shadow:inset 0 0 0 2px ${T.black},inset 0 0 0 3px ${BAR_LOOK.rim};`;
const gold = `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});color:${T.black};box-shadow:inset 0 0 0 2px ${T.black};`;
const btn = "border:0;border-radius:8px;height:40px;padding:0 12px;font:400 12px/1 Tiny5,monospace;white-space:nowrap;cursor:pointer;touch-action:manipulation;";

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Квадрат съёмки на экране — там, где его рисует лист «снять». */
export function captureBox(w: number, h: number): { x: number; y: number; side: number } {
  const side = Math.round(Math.min(w, h) * 0.72);
  return { x: (w - side) / 2, y: Math.max(96, h * 0.38 - side / 2), side };
}

export function mountHud(on: HudActions): { render(s: HudState): void; dispose(): void } {
  const bar = document.createElement("div");
  bar.dataset.arBar = "";
  bar.style.cssText = `position:fixed;left:12px;top:${TOP};z-index:45;display:flex;gap:6px;align-items:center;`;
  const sheet = document.createElement("div");
  sheet.dataset.arSheet = "";
  sheet.style.cssText = `position:fixed;left:0;right:0;bottom:0;z-index:48;display:none;flex-direction:column;gap:10px;padding:14px 14px calc(14px + env(safe-area-inset-bottom,0px));`
    + `background:linear-gradient(${T.panel},${T.well});box-shadow:0 -3px 0 ${T.black},0 -5px 0 ${BAR_LOOK.rim};color:${T.ink};font:400 13px/1.45 Tiny5,monospace;max-height:64dvh;overflow:auto;`;
  const frame = document.createElement("div");
  frame.dataset.arFrame = "";
  frame.style.cssText = `position:fixed;z-index:46;display:none;border:3px solid ${T.gold};border-radius:14px;box-shadow:0 0 0 100vmax rgba(11,7,4,.45);pointer-events:none;`;
  const fitRing = document.createElement("div");
  fitRing.dataset.arFitRing = "";
  fitRing.style.cssText = `position:fixed;inset:0;z-index:42;display:none;pointer-events:none;box-shadow:inset 0 0 0 3px ${T.gold};`;
  document.body.append(bar, sheet, frame, fitRing);

  let state: HudState | null = null;
  let sheetHtml = "";
  const click = (root: HTMLElement): void => {
    root.querySelectorAll<HTMLElement>("[data-ar-do]").forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        const [what, id] = (el.dataset.arDo ?? "").split(":");
        if (what === "exit") on.exit();
        else if (what === "menu") on.menu(state?.sheet !== "menu");
        else if (what === "close") on.menu(false);
        else if (what === "fit") on.fit(!state?.fitting);
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
    });
  };
  // Касание HUD не должно доставаться столу: ни хвату, ни камере, ни тапу по сукну.
  for (const el of [bar, sheet]) for (const kind of ["pointerdown", "pointerup", "pointermove"]) el.addEventListener(kind, (e) => e.stopPropagation());

  const anchorText = (s: HudState): string => {
    if (s.anchor === "gravity") return "⚓ перед собой";
    return s.seen === "seen" ? "⚓ предмет ✓" : s.seen === "lost" ? "⚓ предмет не вижу" : "⚓ ищу предмет…";
  };

  function render(s: HudState): void {
    state = s;
    const lit = s.anchor === "marker" && s.seen === "seen";
    const barHtml = `<button data-ar-do="exit" aria-label="Выйти из AR" style="${btn}${plate}width:40px;padding:0;font-size:16px">✕</button>`
      + `<button data-ar-do="menu" data-ar-anchor="${s.anchor}:${s.seen}" style="${btn}${lit || s.sheet === "menu" ? gold : plate}">${anchorText(s)}</button>`
      + `<button data-ar-do="fit" style="${btn}${s.fitting ? gold : plate}">подогнать</button>`;
    // Разметка переписывается, только если изменилась: иначе кнопка, пересозданная между касанием и
    // отпусканием, клика не получает (стол перерисовывается десятки раз в секунду).
    if (bar.innerHTML !== barHtml) { bar.innerHTML = barHtml; click(bar); }
    fitRing.style.display = s.fitting ? "block" : "none";

    const box = captureBox(innerWidth, innerHeight);
    frame.style.display = s.sheet === "capture" ? "block" : "none";
    Object.assign(frame.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.side}px`, height: `${box.side}px` });

    let html = "";
    const row = (inner: string): string => `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${inner}</div>`;
    const b = (what: string, text: string, main = false): string => `<button data-ar-do="${what}" style="${btn}${main ? gold : plate}">${text}</button>`;
    const title = (t: string): string => `<div style="font:400 18px/1.2 Tiny5,monospace;color:${T.gold}">${t}</div>`;
    const small = (t: string): string => `<div style="color:${T.inkDim}">${t}</div>`;
    if (s.fitting) {
      const st = s.seat;
      html = title("Подгонка")
        + small("один палец — сдвиг · два пальца: развести — размер, вместе вверх-вниз — наклон")
        + `<div data-ar-seat style="color:${T.inkDim}">наклон <b style="color:${T.gold};font-weight:400">${Math.round(st.tilt)}°</b> · размер <b style="color:${T.gold};font-weight:400">×${st.zoom.toFixed(2)}</b> · сдвиг <b style="color:${T.gold};font-weight:400">${st.x.toFixed(1)}, ${st.y.toFixed(1)}</b></div>`
        + row(b("done", "готово", true) + b("reset", "сброс") + b("cancel", "отмена"));
    } else if (s.sheet === "menu") {
      const list = s.markers.map((m) => `<div style="display:flex;gap:10px;align-items:center;padding:6px;border-radius:8px;${m.id === s.active && s.anchor === "marker" ? `box-shadow:inset 0 0 0 2px ${T.gold}` : `box-shadow:inset 0 0 0 2px ${BAR_LOOK.rim}`}">`
        + `<button data-ar-do="use:${m.id}" style="display:flex;gap:10px;align-items:center;flex:1;border:0;background:none;color:${T.ink};font:inherit;text-align:left;cursor:pointer;padding:0">`
        + `<img src="${m.thumb}" alt="" style="width:48px;height:48px;border-radius:6px;object-fit:cover"><span>${esc(m.name)}<br><span style="color:${T.inkDim}">точек ${m.points}</span></span></button>`
        + `<button data-ar-do="forget:${m.id}" aria-label="Удалить" style="${btn}background:none;color:#e0483f;box-shadow:none">✕</button></div>`).join("");
      html = title("Якорь стола")
        + small("Стол держится за то, что ты выберешь. Предмет — картина, доска, журнал: всё плоское с рисунком.")
        + row(b("gravity", "перед собой", s.anchor === "gravity") + b("new", "снять предмет"))
        + list
        + (s.anchor === "marker" ? row(b("flat", s.seat.flat ? "стол: плашмя" : "стол: на предмете") + b("again", "поставить заново")) : "")
        + row(b("close", "закрыть"));
    } else if (s.sheet === "capture") {
      html = title("Новый предмет") + small("Наведи рамку на плоскую вещь с рисунком и сними. Метка собирается на телефоне, в сеть не уходит.")
        + row(b("shoot", "снять", true) + b("close", "отмена"));
    } else if (s.sheet === "compile") {
      html = title("Собираю метку…") + `<div style="height:12px;border-radius:6px;background:${T.black};overflow:hidden"><i style="display:block;height:100%;width:${Math.round(s.progress)}%;background:${T.gold}"></i></div>`
        + small(`${Math.round(s.progress)}%`);
    } else if (s.sheet && typeof s.sheet === "object") {
      html = title("Не вышло") + small(esc(s.sheet.error)) + row(b("close", "закрыть"));
    }
    if (sheetHtml !== html) { sheetHtml = html; sheet.innerHTML = html; click(sheet); }
    sheet.style.display = html ? "flex" : "none";
  }

  return {
    render,
    dispose() { bar.remove(); sheet.remove(); frame.remove(); fitRing.remove(); },
  };
}
