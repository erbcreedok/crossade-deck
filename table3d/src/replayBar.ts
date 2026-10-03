// ЛЕНТА РЕПЛЕЯ НА ХУДЕ — как «Фото» на айфоне: плитки событий едут под неподвижной жёлтой линией «сейчас смотрю», ленту тянут пальцем, она катится по инерции.
//
//   ┌ РЕПЛЕЙ −0:42 ┐        [ Шаги | Время ]        [ ● К живому ]
//   ┊  ┊  ┊ ╷ ┊  ▮  ┊   ┊                         плитки: мини-вид сверху на момент хода + цвет и имя ходившего
//   [⏮] [◀] [▶/⏸] [⏭] [1×]                        ход назад/вперёд — по событиям; ◀ ▶ — играть в обе стороны; скорость
//
// Два режима ленты. ШАГИ — плитки одной ширины, только события. ВРЕМЯ — ширина плитки по длительности хода, а длинная пауза сворачивается в плитку «пауза 5:12»: так
// видно, кто сколько думал, а пятнадцать минут не растягиваются на экран.
//
// Своего вида не придумано: плашки, значки и краски — те же, что у остального худа (`chrome.ts`, `pixel.ts`).

import { seatPoint, TABLE_RADIUS } from "../../server/src/table/ring.js";
import type { Snapshot } from "../../server/src/table/contract.js";
import { anchor, type Moment } from "../../server/table-client/tape.js";
import { SPEEDS, type ReplayControl } from "../../server/table-client/replayable.js";
import { BAR_LOOK, T } from "../../server/table-client/screenConst.js";
import type { TableStore } from "../../server/table-client/store.js";
import type { SceneApi } from "./scene.js";
import { pixelIcon } from "./pixel.js";

/** Ширина плитки и зазор между ними, px. */
const TILE = 58, GAP = 4;
/** Пауза дольше этого сворачивается в плитку (режим «Время»), мс. */
const PAUSE_MS = 6000;
/** Сколько мс ленты в одном пикселе ширины хода (режим «Время»). */
const MS_PER_PX = 60;
const EDGE = 44;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const icon = (name: string, size = 3) => pixelIcon(name, size, "ic");

export const REPLAY_CSS = `
#hud .rp { position: absolute; left: 0; right: 0; bottom: 0; z-index: 66; display: none; pointer-events: auto; padding: 0 0 calc(var(--safe-bottom) + 8px); background: linear-gradient(${BAR_LOOK.plateHi}, ${BAR_LOOK.plateLo}); box-shadow: 0 -2px 0 0 ${T.black}, inset 0 2px 0 0 ${T.wood}; user-select: none; -webkit-user-select: none; touch-action: none; }
#hud.replaying .rp { display: block; }
#hud.replaying .c-dock, #hud.replaying .c-dockbg, #hud.replaying .c-sheet, #hud.replaying .c-grip, #hud.replaying .c-count { display: none !important; }
#hud .rp-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px 6px; font-size: 12px; }
#hud .rp-badge { padding: 5px 9px; background: ${T.well}; box-shadow: inset 0 0 0 2px ${T.wood}; color: ${T.gold}; letter-spacing: .3px; white-space: nowrap; }
#hud .rp-seg { margin-left: auto; display: flex; }
#hud .rp-seg button { border: 0; padding: 6px 9px; color: ${T.inkDim}; background: ${T.well}; box-shadow: inset 0 0 0 2px ${T.wood}; cursor: pointer; font: inherit; }
#hud .rp-seg button.on { color: ${T.black}; background: linear-gradient(${BAR_LOOK.goldHi}, ${BAR_LOOK.goldLo}); box-shadow: inset 0 0 0 2px ${BAR_LOOK.goldHi}; }
#hud .rp-live { border: 0; padding: 6px 10px; cursor: pointer; font: inherit; color: ${T.ink}; background: ${T.well}; box-shadow: inset 0 0 0 2px ${T.wood}; white-space: nowrap; }
#hud .rp-live.news { color: ${T.black}; background: linear-gradient(${BAR_LOOK.goldHi}, ${BAR_LOOK.goldLo}); animation: rpblink 1s steps(2) infinite; }
@keyframes rpblink { 50% { filter: brightness(.8); } }
#hud .rp-strip { position: relative; height: 92px; margin: 0 0 6px; overflow: hidden; background: ${T.black}; box-shadow: inset 0 2px 0 0 ${T.wood}, inset 0 -2px 0 0 ${T.wood}; touch-action: none; cursor: grab; }
#hud .rp-track { position: absolute; left: 0; top: 0; bottom: 0; will-change: transform; }
#hud .rp-tile { position: absolute; top: 10px; height: 72px; box-sizing: border-box; background: ${T.well}; box-shadow: inset 0 0 0 2px ${T.wood}; overflow: hidden; }
#hud .rp-tile canvas { display: block; width: 100%; height: 54px; image-rendering: pixelated; }
#hud .rp-tile .nm { position: absolute; left: 0; right: 0; bottom: 0; height: 18px; line-height: 18px; padding: 0 4px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${T.black}; }
#hud .rp-tile.cur { box-shadow: inset 0 0 0 2px ${T.gold}, 0 0 0 2px ${T.gold}; }
#hud .rp-tile.pause, #hud .rp-tile.edge { display: flex; align-items: center; justify-content: center; text-align: center; font-size: 11px; color: ${T.inkDim}; background: transparent; box-shadow: inset 0 0 0 2px ${T.wood}; border: 0; }
#hud .rp-tile.edge { opacity: .5; }
#hud .rp-head-line { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: ${T.gold}; z-index: 3; pointer-events: none; }
#hud .rp-head-time { position: absolute; left: 50%; top: 1px; transform: translateX(-50%); z-index: 4; font-size: 11px; color: ${T.black}; background: ${T.gold}; padding: 0 5px; pointer-events: none; }
#hud .rp-row { display: flex; gap: 6px; padding: 0 12px; }
#hud .rp-row button { flex: 1; height: 44px; border: 0; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; color: ${T.ink}; background: linear-gradient(${BAR_LOOK.plateHi}, ${BAR_LOOK.plateLo}); box-shadow: 0 -2px 0 0 ${T.black}, 0 2px 0 0 ${T.black}, -2px 0 0 0 ${T.black}, 2px 0 0 0 ${T.black}, inset 0 0 0 2px ${T.wood}; font: inherit; font-size: 13px; }
#hud .rp-row button.on { color: ${T.black}; background: linear-gradient(${BAR_LOOK.goldHi}, ${BAR_LOOK.goldLo}); box-shadow: 0 -2px 0 0 ${T.black}, 0 2px 0 0 ${T.black}, -2px 0 0 0 ${T.black}, 2px 0 0 0 ${T.black}, inset 0 0 0 2px ${BAR_LOOK.goldHi}; }
#hud .rp-row button:active { transform: translateY(2px); }
#hud .rp-row .p-i { fill: ${T.ink}; } #hud .rp-row .p-a { fill: ${T.gold}; } #hud .rp-row .on .p-i { fill: ${T.black}; } #hud .rp-row .on .p-a { fill: ${T.panel}; }
`;

interface Item {
  kind: "edge" | "moment" | "pause" | "gap" | "now";
  m?: Moment;
  t0: number;
  t1: number;
  x0: number;
  w: number;
  label?: string;
}

export const clock = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};

/** Ленту плиток из событий. `time` — режим «Время» (ширина по длительности, паузы свёрнуты), иначе «Шаги». Чистая: тестируется без браузера. */
export function stripItems(moments: readonly Moment[], from: number, now: number, time: boolean): Item[] {
  const items: Item[] = [];
  let x = 0;
  const push = (it: Omit<Item, "x0">): void => { items.push({ ...it, x0: x }); x += it.w + (it.kind === "gap" ? 0 : GAP); };
  const anchors = moments.map((m) => anchor(m, from));
  for (let i = 1; i < anchors.length; i++) anchors[i] = Math.max(anchors[i]!, anchors[i - 1]!);
  push({ kind: "edge", t0: from, t1: anchors[0] ?? now, w: EDGE, label: "начало" });
  if (!time) {
    moments.forEach((m, i) => push({ kind: "moment", m, t0: anchors[i]!, t1: anchors[i + 1] ?? now, w: TILE }));
    return items;
  }
  let end = anchors[0] ?? now;
  moments.forEach((m, i) => {
    const a = anchors[i]!;
    const idle = a - end;
    if (idle > PAUSE_MS) push({ kind: "pause", t0: end, t1: a, w: 54, label: `пауза ${clock(idle)}` });
    else if (idle > 0) push({ kind: "gap", t0: end, t1: a, w: Math.max(2, idle / MS_PER_PX) });
    const stop = Math.max(a + 1, m.t);
    push({ kind: "moment", m, t0: a, t1: stop, w: Math.max(TILE, (stop - a) / MS_PER_PX) });
    end = stop;
  });
  const tail = now - end;
  if (tail > PAUSE_MS) push({ kind: "pause", t0: end, t1: now, w: 54, label: `ждём ${clock(tail)}` });
  else if (tail > 0 || moments.length === 0) push({ kind: "now", t0: end, t1: Math.max(now, end + 1), w: Math.max(24, tail / MS_PER_PX) });
  return items;
}

/** Время → место на ленте, px (линейно внутри плитки). */
export function posOf(items: readonly Item[], t: number): number {
  for (const it of items) if (t <= it.t1) return it.x0 + (it.w * Math.max(0, Math.min(1, (t - it.t0) / Math.max(1, it.t1 - it.t0))));
  const last = items.at(-1);
  return last ? last.x0 + last.w : 0;
}

/** Место на ленте, px → время. */
export function timeOf(items: readonly Item[], x: number): number {
  for (const it of items) if (x <= it.x0 + it.w + GAP / 2) return it.t0 + (it.t1 - it.t0) * Math.max(0, Math.min(1, (x - it.x0) / Math.max(1, it.w)));
  return items.at(-1)?.t1 ?? 0;
}

/** Мини-вид сверху на момент: сукно, стулья цветом игроков, карты и стопки; твой стул — внизу. Ходившие карты обведены золотом. */
export function drawMini(cv: HTMLCanvasElement, s: Snapshot, me: string, hot: ReadonlySet<string>): void {
  const g = cv.getContext("2d");
  if (!g) return;
  const W = cv.width, H = cv.height, k = (Math.min(W, H) / 2 - 3) / (TABLE_RADIUS + 1.2);
  const seat = s.chairs.find((c) => c.id === s.people.find((p) => p.key === me)?.seat), a = ((seat?.angle ?? 0) * Math.PI) / 180;
  const at = (x: number, y: number): [number, number] => [W / 2 + (x * Math.cos(a) - y * Math.sin(a)) * k, H / 2 + (x * Math.sin(a) + y * Math.cos(a)) * k];
  g.clearRect(0, 0, W, H);
  g.fillStyle = "#16301f";
  g.beginPath(); g.arc(W / 2, H / 2, TABLE_RADIUS * k, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#6b4d2c"; g.lineWidth = 2; g.stroke();
  for (const c of s.chairs) {
    const p = seatPoint(c.angle, TABLE_RADIUS + 0.6), [x, y] = at(p.x, p.y), owner = s.people.find((q) => q.key === c.owner);
    g.fillStyle = owner?.ink ?? "#4a3627";
    g.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
  }
  for (const pile of s.piles) {
    const [x, y] = at(pile.x, pile.y);
    g.fillStyle = "#cdb98f";
    g.fillRect(Math.round(x) - 3, Math.round(y) - 4, 6, 8);
  }
  for (const c of s.felt) {
    const [x, y] = at(c.x, c.y);
    g.fillStyle = c.up ? "#f5ead0" : "#8a6a3a";
    g.fillRect(Math.round(x) - 2, Math.round(y) - 3, 4, 6);
    if (hot.has(c.id)) { g.strokeStyle = "#f2c14e"; g.lineWidth = 1; g.strokeRect(Math.round(x) - 3.5, Math.round(y) - 4.5, 7, 9); }
  }
}

/** Повесить ленту на худ: один раз; сама слушает просмотр и себя показывает и прячет. */
export function mountReplayBar(root: HTMLElement, store: TableStore, scene: SceneApi): void {
  const ctrl = store.replay;
  if (!ctrl) return;
  const bar = document.createElement("div");
  bar.className = "rp";
  bar.innerHTML = `
    <div class="rp-head"><span class="rp-badge" data-rp-badge></span><span class="rp-seg"><button data-rp-mode="steps" class="on">Шаги</button><button data-rp-mode="time">Время</button></span><button class="rp-live" data-rp-live>● К живому</button></div>
    <div class="rp-strip" data-rp-strip><div class="rp-head-line"></div><div class="rp-head-time" data-rp-time></div><div class="rp-track" data-rp-track></div></div>
    <div class="rp-row"><button data-rp-jump="-1" aria-label="Ход назад">${icon("rpPrev")}</button><button data-rp-play="-1" aria-label="Играть назад">${icon("rpBack")}</button><button data-rp-play="1" aria-label="Играть вперёд">${icon("rpFwd")}</button><button data-rp-jump="1" aria-label="Ход вперёд">${icon("rpNext")}</button><button data-rp-speed aria-label="Скорость">1×</button></div>`;
  root.append(bar);
  const q = <E extends HTMLElement>(sel: string) => bar.querySelector<E>(sel)!;
  const strip = q("[data-rp-strip]"), track = q("[data-rp-track]"), badge = q("[data-rp-badge]"), timeEl = q("[data-rp-time]"), live = q("[data-rp-live]");
  let time = false, items: Item[] = [], sig = "", pxLeft = 0;
  /** Плитки, уже стоящие на ленте: ключ — номер события или вид. */
  const tiles = new Map<string, HTMLElement>();
  /** Мини-вид — один раз на событие. */
  const thumbs = new WeakMap<Moment, HTMLCanvasElement>();
  let drag: { id: number; x: number; t: number; vx: number; at: number } | null = null, fling = 0;

  const who = (s: Snapshot, key: string | null) => s.people.find((p) => p.key === key);
  const refresh = (): void => {
    const now = ctrl.now, moms = ctrl.moments, key = `${time}|${moms.length}|${moms.at(-1)?.t ?? 0}|${Math.floor(now / (time ? 1000 : 1e12))}|${ctrl.from}`;
    if (key !== sig) { sig = key; items = stripItems(moms, ctrl.from, now, time); }
  };
  const make = (it: Item, i: number): HTMLElement => {
    const el = document.createElement("div");
    el.className = `rp-tile ${it.kind}`;
    el.style.left = `${it.x0}px`; el.style.width = `${it.w}px`;
    if (it.kind === "edge" || it.kind === "pause") { el.textContent = it.label ?? ""; return el; }
    if (it.kind !== "moment" || !it.m) { el.style.visibility = "hidden"; return el; }
    const cv = document.createElement("canvas");
    cv.width = Math.round(it.w); cv.height = 54;
    const s = ctrl.stateAt(it.m.t), person = who(s, it.m.by);
    drawMini(cv, s, store.me.key, new Set(it.m.ids));
    el.append(cv);
    const nm = document.createElement("div");
    nm.className = "nm";
    nm.style.background = person?.ink ?? T.inkDim;
    nm.textContent = it.m.kind === "deal" ? "раздача" : it.m.kind === "carry" ? `${person?.name ?? "?"} несёт` : it.m.kind === "deck" ? "колода" : it.m.kind === "turn" ? `${person?.name ?? "?"} ⟲` : person?.name ?? "?";
    el.append(nm);
    thumbs.set(it.m, cv);
    el.dataset.i = String(i);
    return el;
  };
  const paint = (): void => {
    refresh();
    const w = strip.clientWidth || 390, center = w / 2, x = posOf(items, drag ? drag.t : ctrl.cursor);
    pxLeft = center - x;
    track.style.transform = `translateX(${pxLeft.toFixed(1)}px)`;
    // Только плитки в кадре и рядом: лента может быть длиной в тысячи событий.
    const lo = -pxLeft - 40, hi = -pxLeft + w + 40, want = new Set<string>();
    items.forEach((it, i) => {
      if (it.kind === "gap" || it.x0 + it.w < lo || it.x0 > hi) return;
      const k = `${time ? "t" : "s"}${i}:${it.kind}:${Math.round(it.w)}`;
      want.add(k);
      if (!tiles.has(k)) { const el = make(it, i); tiles.set(k, el); track.append(el); }
    });
    for (const [k, el] of tiles) if (!want.has(k)) { el.remove(); tiles.delete(k); }
    const cur = ctrl.cursor;
    for (const [k, el] of tiles) { const i = Number(k.slice(1).split(":")[0]), it = items[i]; el.classList.toggle("cur", !!it && it.kind === "moment" && cur >= it.t0 && cur <= Math.max(it.t1, it.t0 + 1)); }
    track.style.width = `${(items.at(-1)?.x0 ?? 0) + (items.at(-1)?.w ?? 0)}px`;
    const behind = ctrl.now - ctrl.cursor;
    timeEl.textContent = behind < 1500 ? "сейчас" : `−${clock(behind)}`;
    badge.textContent = `РЕПЛЕЙ ${behind < 1500 ? "· сейчас" : `−${clock(behind)}`}`;
    live.classList.toggle("news", ctrl.news);
    for (const b of bar.querySelectorAll<HTMLElement>("[data-rp-play]")) b.classList.toggle("on", ctrl.dir === Number(b.dataset.rpPlay));
    q("[data-rp-speed]").textContent = `${ctrl.speed}×`;
    for (const b of bar.querySelectorAll<HTMLElement>("[data-rp-mode]")) b.classList.toggle("on", (b.dataset.rpMode === "time") === time);
  };

  const sync = (): void => {
    const on = ctrl.on;
    root.classList.toggle("replaying", on);
    if (on) paint();
  };
  ctrl.onChange(sync);
  setInterval(() => { if (ctrl.on && !drag) paint(); }, 500);

  // ——— тянуть ленту: палец влево — время вперёд, как лист галереи; отпустил — катится по инерции ———
  const point = (e: PointerEvent) => e.clientX;
  strip.addEventListener("pointerdown", (e) => {
    cancelAnimationFrame(fling);
    ctrl.pause();
    drag = { id: e.pointerId, x: point(e), t: ctrl.cursor, vx: 0, at: performance.now() };
    strip.setPointerCapture(e.pointerId);
  });
  strip.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const now = performance.now(), dx = point(e) - drag.x;
    drag.vx = (point(e) - drag.x) / Math.max(1, now - drag.at) * 0.5 + drag.vx * 0.5;
    drag.x = point(e); drag.at = now;
    const x = posOf(items, drag.t) - dx;
    drag.t = timeOf(items, x);
    ctrl.seek(drag.t);
  });
  const release = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    let v = -drag.vx * 16, last = performance.now();
    drag = null;
    const run = (): void => {
      const dt = performance.now() - last; last = performance.now();
      if (Math.abs(v) < 0.2 || !ctrl.on) return;
      ctrl.seek(timeOf(items, posOf(items, ctrl.cursor) + v * (dt / 16)));
      v *= 0.94;
      fling = requestAnimationFrame(run);
    };
    fling = requestAnimationFrame(run);
  };
  strip.addEventListener("pointerup", release);
  strip.addEventListener("pointercancel", release);

  bar.addEventListener("click", (e) => {
    const t = e.target as HTMLElement, b = t.closest<HTMLElement>("button");
    if (!b) return;
    if (b.dataset.rpLive !== undefined) { ctrl.exit(); scene.replay(false); return; }
    if (b.dataset.rpMode) { time = b.dataset.rpMode === "time"; sig = ""; for (const el of tiles.values()) el.remove(); tiles.clear(); paint(); return; }
    if (b.dataset.rpJump) return ctrl.jump(Number(b.dataset.rpJump) as -1 | 1);
    if (b.dataset.rpPlay) { const d = Number(b.dataset.rpPlay) as -1 | 1; return ctrl.dir === d ? ctrl.pause() : ctrl.play(d); }
    if (b.dataset.rpSpeed !== undefined) ctrl.setSpeed(SPEEDS[(SPEEDS.indexOf(ctrl.speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length]!);
  });
  void esc;
}
