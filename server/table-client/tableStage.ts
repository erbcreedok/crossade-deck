// СЦЕНА «ЗА СТОЛОМ» НА СТРАНИЦЕ ХОЗЯИНА — та же фигура на четырёх местах круглого стола (лицом, боком, спиной, другим
// боком к камере) и камера, которую палец крутит вокруг середины стола в любую сторону: по кругу, сверху, снизу.
// Фигуры рисует тот же слой тел, что и настоящий стол (`bodyView.ts`) — с тем же перекрытием столом и теми же
// правками хозяина (`tunes.ts`), поэтому подкрученная часть здесь выглядит так же, как за игрой.

import { restHead, shouldersOf, type Body } from "../src/table/bodies.js";
import type { Parts } from "../src/table/skins.js";
import { bodiesHtml, type BodyLook } from "./bodyView.js";
import { R, RIM, SEAT, TABLE_THICK } from "./felt.js";

type Point = { x: number; y: number };
type P3 = { x: number; y: number; h: number };

export interface TableLook {
  parts: Parts;
  palette: number;
  ink: string;
  photo?: string;
}

export interface TableStage {
  show(look: TableLook): void;
  /** Перерисовать — правка части поменялась. */
  draw(): void;
  /** Куда смотрит камера (градусы) — для проверок и кнопок-видов. */
  view(yaw: number, pitch: number): void;
  destroy(): void;
}

/** Четыре места по кругу; имя над фигурой — номер места. */
const SEATS = [0, 90, 180, 270];
const NAMES = ["1", "2", "3", "4"];
const FELT = { hi: "#1b4835", lo: "#0a2117", wood: "#3a2a1d", woodSide: "#4e3823", under: "#1d1409" };

export function mountTableStage(box: HTMLElement, base: string, first: TableLook): TableStage {
  let look = first;
  let yaw = 20, pitch = 38, dist = 36;
  box.style.position = "relative";
  box.style.touchAction = "none";
  box.style.overflow = "hidden";
  box.innerHTML = `<canvas style="position:absolute;inset:0;width:100%;height:100%"></canvas><div data-bodies style="position:absolute;inset:0;pointer-events:none"></div>`
    + `<div style="position:absolute;left:8px;bottom:8px;display:flex;gap:6px;flex-wrap:wrap">${[["сверху", 0, 89], ["вокруг", 20, 38], ["сбоку", 0, 6], ["снизу", 30, -35]].map(([n, y, p]) => `<button class="btn" data-cam="${y},${p}">${n}</button>`).join("")}</div>`;
  const cv = box.querySelector("canvas")!, layer = box.querySelector<HTMLElement>("[data-bodies]")!;
  for (const b of box.querySelectorAll<HTMLElement>("[data-cam]")) b.onclick = (e) => { e.stopPropagation(); const [y, p] = b.dataset.cam!.split(",").map(Number); set(y!, p!); };
  let drag: { x: number; y: number } | null = null;
  box.addEventListener("pointerdown", (e) => { if ((e.target as Element).closest("button")) return; drag = { x: e.clientX, y: e.clientY }; box.setPointerCapture(e.pointerId); });
  box.addEventListener("pointermove", (e) => {
    if (!drag) return;
    set(yaw + (e.clientX - drag.x) * 0.5, pitch + (e.clientY - drag.y) * 0.4);
    drag = { x: e.clientX, y: e.clientY };
  });
  const up = () => (drag = null);
  box.addEventListener("pointerup", up);
  box.addEventListener("pointercancel", up);
  box.addEventListener("wheel", (e) => { e.preventDefault(); dist = Math.max(16, Math.min(60, dist * (1 + e.deltaY * 0.001))); draw(); }, { passive: false });

  function set(y: number, p: number): void {
    yaw = ((y % 360) + 360) % 360;
    pitch = Math.max(-89, Math.min(89, p));
    box.dataset.yaw = String(Math.round(yaw));
    box.dataset.pitch = String(Math.round(pitch));
    draw();
  }

  let frame = 0, alive = true;
  const draw = () => { if (!frame && alive) frame = requestAnimationFrame(render); };

  function render(): void {
    frame = 0;
    if (!box.isConnected) return;
    const W = box.clientWidth, H = box.clientHeight, dpr = devicePixelRatio || 1;
    // КАМЕРА НА СФЕРЕ вокруг середины стола. Право экрана — всегда по кругу стола: сверху и снизу нет кувырка.
    const a = (yaw * Math.PI) / 180, e = (pitch * Math.PI) / 180;
    const toEye: P3 = { x: Math.sin(a) * Math.cos(e), y: Math.cos(a) * Math.cos(e), h: Math.sin(e) };
    const target: P3 = { x: 0, y: 0, h: 2 };
    const eye: P3 = { x: target.x + toEye.x * dist, y: target.y + toEye.y * dist, h: target.h + toEye.h * dist };
    const fw: P3 = { x: -toEye.x, y: -toEye.y, h: -toEye.h };
    const right: P3 = { x: -Math.cos(a), y: Math.sin(a), h: 0 };
    const upv: P3 = { x: right.y * fw.h - right.h * fw.y, y: right.h * fw.x - right.x * fw.h, h: right.x * fw.y - right.y * fw.x };
    const f = Math.min(W, H) * 1.5;
    const dot = (p: P3, q: P3) => p.x * q.x + p.y * q.y + p.h * q.h;
    const depth = (p: P3) => dot({ x: p.x - eye.x, y: p.y - eye.y, h: p.h - eye.h }, fw);
    const toGlass = (p: Point, h = 0): Point => {
      const v = { x: p.x - eye.x, y: p.y - eye.y, h: h - eye.h };
      const z = Math.max(0.5, dot(v, fw));
      return { x: W / 2 + (dot(v, right) * f) / z, y: H * 0.55 - (dot(v, upv) * f) / z };
    };
    const ahead = (p: P3) => depth(p) > 1;

    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d")!;
    g.scale(dpr, dpr);
    // СТОЛ: торец — полосами от дальних к ближним, потом верх (сверху) или низ (снизу).
    const n = 72, edge = R + RIM;
    const ring = (r: number, h: number) => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return { x: Math.cos(t) * r, y: Math.sin(t) * r, h }; });
    const poly = (pts: Point[]) => { g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); };
    const top = ring(edge, 0), bottom = ring(edge, -TABLE_THICK);
    const sides = top.map((p, i) => ({ i, d: depth({ x: p.x, y: p.y, h: -TABLE_THICK / 2 }) })).sort((p, q) => q.d - p.d);
    for (const { i } of sides) {
      const j = (i + 1) % n;
      poly([top[i]!, top[j]!, bottom[j]!, bottom[i]!].map((p) => toGlass(p, p.h)));
      g.fillStyle = FELT.woodSide; g.fill(); g.strokeStyle = FELT.woodSide; g.lineWidth = 1; g.stroke();
    }
    if (eye.h > 0) {
      poly(top.map((p) => toGlass(p, 0))); g.fillStyle = FELT.wood; g.fill(); g.lineWidth = 3; g.strokeStyle = SEAT.black; g.stroke();
      const felt = ring(R, 0).map((p) => toGlass(p, 0));
      const c = toGlass({ x: 0, y: 0 }, 0), gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(W, H) * 0.5);
      gr.addColorStop(0, FELT.hi); gr.addColorStop(1, FELT.lo);
      poly(felt); g.fillStyle = gr; g.fill(); g.lineWidth = 2; g.strokeStyle = SEAT.black; g.stroke();
    } else {
      poly(bottom.map((p) => toGlass(p, p.h))); g.fillStyle = FELT.under; g.fill(); g.lineWidth = 3; g.strokeStyle = SEAT.black; g.stroke();
    }
    // ФИГУРЫ — те же, что за игрой: сидят на своих местах, смотрят в середину стола.
    const looks: BodyLook[] = SEATS.map((angle, i) => {
      const s = shouldersOf(angle);
      const body: Body = { by: `stage:${i}`, stance: "sit", model: "seat", eye: { x: s.x * 0.4, y: s.y * 0.4, h: restHead("sit") }, stretch: 0, yaw: -angle, right: null };
      return { body, angle, ink: look.ink, name: NAMES[i]!, doll: "own", palette: look.palette, parts: look.parts, ...(look.photo ? { photo: look.photo } : {}) };
    });
    layer.innerHTML = bodiesHtml(looks, toGlass, { black: SEAT.black, ink: SEAT.ink, danger: "#e0483f" }, (name) => `${base}/table/sprites/${name}.png`, { base, ready: draw }, (p) => ahead(p));
  }
  set(yaw, pitch);
  new ResizeObserver(draw).observe(box);
  return {
    show(next) { look = next; draw(); },
    draw,
    view: set,
    destroy() { alive = false; },
  };
}
