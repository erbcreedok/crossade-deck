// СЦЕНА КОНСТРУКТОРА СКИНА — фигура в честном 3D, как на стенде `design/skinmaker`: камера облетает её по сфере
// (тянешь вбок — обход, вверх-вниз — выше и ниже, до вида сверху и снизу), перспектива настоящая, каждая часть —
// плоскость своего ракурса и по своему режиму (`Part.facing`), кубик — коробка. Картинки — от того же пекаря,
// что за столом (`dollSprites.ts`), поэтому в профиле видно ровно то, что увидят за столом.

import { PALETTES } from "../src/table/dolls.js";
import { AVATAR, drawnView, partOf, pickView, SLOTS, VIEW_DIRS, type Part, type Parts, type Slot } from "../src/table/skins.js";
import { partGeom, partSprite, warmParts } from "./dollSprites.js";
import { PIP_AT } from "./skinArt.js";

type V = [number, number, number];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => mul(a, 1 / (Math.hypot(...a) || 1));
/** Поворот вокруг вертикали на `deg` — оси головы, повёрнутой туда, куда смотрит человек. */
const turnZ = (v: readonly number[], deg: number): V => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [v[0]! * c + v[1]! * s, -v[0]! * s + v[1]! * c, v[2]!]; };
const PAPER = "#f7f1e6", BLACK = "#0b0704";

/**
 * ПЛОСКОСТЬ РАКУРСА: лицом по направлению `n` (в мире). Верх — вертикаль; у видов сверху и снизу фигура на рисунке
 * обращена к низу картинки (так рисуют вид сверху) — верх картинки её спина. Поперёк — правая рука того, кто
 * смотрит на неё прямо.
 */
function basis(n: V, fwd: V): { up: V; across: V } {
  const up: V = Math.abs(n[2]) > 0.9 ? mul(fwd, -1) : [0, 0, 1];
  return { up: norm(sub(up, mul(n, dot(up, n)))), across: norm(cross(mul(n, -1), up)) };
}

/** Картинка по адресу спрайта — одна на адрес. */
const images = new Map<string, HTMLImageElement>();
function imageOf(src: string, ready: () => void): HTMLImageElement | null {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.onload = ready;
    img.src = src;
    images.set(src, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/**
 * КАРТИНКА НА ПЛОСКОСТИ В ПЕРСПЕКТИВЕ: холст не умеет перспективу одной матрицей (три угла дают параллелограмм,
 * дальний край той же длины, что ближний, и фигура читается вывернутой) — поэтому ячейками, у каждой свои углы.
 */
function drawProjected(g: CanvasRenderingContext2D, dpr: number, img: HTMLImageElement, P: (u: number, v: number) => { x: number; y: number } | null, vMax = 1, cells = 4): void {
  const iw = img.naturalWidth, ih = img.naturalHeight * vMax;
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const A = P(i / cells, j / cells), B = P((i + 1) / cells, j / cells), C = P(i / cells, (j + 1) / cells), D = P((i + 1) / cells, (j + 1) / cells);
    if (!A || !B || !C || !D) continue;
    // ячейку чуть раздуть: иначе между ячейками видны волоски шва
    const mx = (A.x + D.x) / 2, my = (A.y + D.y) / 2, grow = (q: { x: number; y: number }) => ({ x: q.x + (q.x - mx) * 0.04, y: q.y + (q.y - my) * 0.04 });
    const a = grow(A), b = grow(B), c = grow(C), d = grow(D);
    g.save();
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(d.x, d.y); g.lineTo(c.x, c.y); g.closePath(); g.clip();
    const sw = iw / cells, sh = ih / cells;
    g.setTransform((dpr * (B.x - A.x)) / sw, (dpr * (B.y - A.y)) / sw, (dpr * (C.x - A.x)) / sh, (dpr * (C.y - A.y)) / sh, dpr * A.x, dpr * A.y);
    g.drawImage(img, i * sw, j * sh, Math.min(sw * 1.04, iw - i * sw), Math.min(sh * 1.04, ih - j * sh), 0, 0, Math.min(sw * 1.04, iw - i * sw), Math.min(sh * 1.04, ih - j * sh));
    g.restore();
  }
}

export interface SkinLook {
  parts: Parts;
  palette: number;
  ink: string;
  /** Фото из Telegram — в голове-аватаре (`AVATAR`). */
  photo?: string;
}

export interface SkinStage {
  /** Показать другую сборку, расцветку, свой цвет. */
  show(look: SkinLook): void;
  /** Какие ракурсы сейчас у частей — для проверок. */
  readonly views: Partial<Record<Slot, string>>;
  destroy(): void;
}

/** СЦЕНА в `box`: холст, облёт пальцем, сидит/стоит. `base` — адрес стола (рисунки частей). */
export function mountSkinStage(box: HTMLElement, base: string, first: SkinLook): SkinStage {
  let look = first;
  let yaw = 20, elev = 12, stance: "sit" | "stand" = "sit";
  const held: Partial<Record<Slot, string>> = {};
  const last: Partial<Record<Slot, { img: HTMLImageElement; id: string }>> = {};
  const views: Partial<Record<Slot, string>> = {};
  box.style.position = "relative";
  box.style.touchAction = "none";
  box.innerHTML = `<canvas style="position:absolute;inset:0;width:100%;height:100%"></canvas>`
    + `<div style="position:absolute;left:8px;bottom:8px;display:flex;gap:6px"><button class="btn on" data-stance="sit">сидит</button><button class="btn" data-stance="stand">стоит</button></div>`;
  const cv = box.querySelector("canvas")!;
  // ФОТО ГОЛОВЫ-АВАТАРА — кружком поверх холста, в точке головы: на холст чужую картинку не положить.
  const photo = document.createElement("img");
  photo.dataset.g = "stage-photo";
  photo.alt = "";
  photo.style.cssText = "position:absolute;left:0;top:0;border-radius:50%;object-fit:cover;pointer-events:none;display:none";
  box.appendChild(photo);
  for (const b of box.querySelectorAll<HTMLElement>("[data-stance]")) {
    b.onclick = (e) => {
      e.stopPropagation();
      stance = b.dataset.stance as "sit" | "stand";
      for (const x of box.querySelectorAll<HTMLElement>("[data-stance]")) x.classList.toggle("on", x === b);
      draw();
    };
  }
  let drag: { x: number; y: number } | null = null;
  box.addEventListener("pointerdown", (e) => { if ((e.target as Element).closest("button")) return; drag = { x: e.clientX, y: e.clientY }; box.setPointerCapture(e.pointerId); });
  box.addEventListener("pointermove", (e) => {
    if (!drag) return;
    yaw = (yaw + (e.clientX - drag.x) * 0.9) % 360;
    elev = Math.max(-89, Math.min(89, elev + (e.clientY - drag.y) * 0.6));
    drag = { x: e.clientX, y: e.clientY };
    box.dataset.yaw = String(Math.round(yaw));
    box.dataset.elev = String(Math.round(elev));
    draw();
  });
  const up = () => (drag = null);
  box.addEventListener("pointerup", up);
  box.addEventListener("pointercancel", up);

  let frame = 0, alive = true;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const draw = () => { if (!frame && alive) frame = requestAnimationFrame(render); };
  const warm = () => void warmParts(look.parts, look.palette, look.ink, base).then(draw);
  warm();

  function render(): void {
    frame = 0;
    if (!box.isConnected) return;
    const dpr = devicePixelRatio || 1, W = box.clientWidth, H = box.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d")!;
    g.scale(dpr, dpr);
    const pal = PALETTES[look.palette] ?? PALETTES[0]!, t = performance.now() / 1000, breath = still ? 0 : Math.sin((t * 2 * Math.PI) / 3.2);
    const standing = stance === "stand";
    // КАМЕРА: смотрит на середину фигуры, обход — yaw, высота глаза — elev.
    const a = (yaw * Math.PI) / 180, e = (elev * Math.PI) / 180;
    const toEye: V = [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
    const dist = 13.2, target: V = [0, 0, standing ? 5 : 4.2], eye = add(target, mul(toEye, dist));
    const fw = mul(toEye, -1), wup: V = Math.abs(toEye[2]) > 0.99 ? [0, -Math.sign(toEye[2]), 0] : [0, 0, 1];
    const cr = norm(cross(fw, wup)), cu = cross(cr, fw);
    const f = (Math.min(W, H) * 0.5) / Math.tan((40 * Math.PI) / 360);
    const proj = (P: V) => { const v = sub(P, eye), z = dot(v, fw); return z < 0.1 ? null : { x: W / 2 + (dot(v, cr) * f) / z, y: H * 0.55 - (dot(v, cu) * f) / z }; };
    const shoulderZ = (standing ? 7.2 : 4.2) + breath * 0.06, headZ = shoulderZ + 1.35 + breath * 0.04;
    type Quad = { tl: V; tr: V; bl: V; at: V; img?: HTMLImageElement; slot?: Slot; face?: string; shade?: number; chair?: boolean; vMax?: number };
    const quads: Quad[] = [];
    const place = (slot: Slot, center: V, w: number, h: number | null, pivotTop: number, cutAt = -Infinity) => {
      const p = partOf(look.parts[slot]);
      if (!p || p.art.kind === "none") return;
      const view = pickView(p, turnZ(toEye, 0), held[slot]);
      held[slot] = view;
      views[slot] = p.facing === "box" ? "box" : view;
      if (p.facing === "box") return box3(p, center, w);
      const d = drawnView(p, view);
      const spr = partSprite(p.id, look.palette, d.view, look.ink, base, draw);
      // Нужная сторона ещё печётся — держим прежнюю картинку этой части, а не пропускаем кадр.
      let img = spr ? imageOf(spr.src, draw) : null;
      if (img) last[slot] = { img, id: p.id };
      else if (last[slot]?.id === p.id) img = last[slot]!.img;
      if (!img) return;
      const fwd: V = [0, 1, 0];
      let n: V, upv: V, across: V, squeeze = 1;
      if (p.facing === "camera") ({ up: upv, across } = basis((n = toEye), fwd));
      else if (p.facing === "tilt") {
        // бумажный спрайт: лицом в камеру, по ширине сужается по углу между ракурсом и взглядом
        const dv = VIEW_DIRS[view] ?? VIEW_DIRS.front!, flatD = norm([dv[0], dv[1], 0]), lean = Math.hypot(toEye[0], toEye[1]);
        ({ up: upv, across } = basis((n = toEye), fwd));
        squeeze = lean < 1e-3 ? 1 : Math.max(0.12, Math.abs(dot(flatD, [toEye[0] / lean, toEye[1] / lean, 0])) * lean + (1 - lean));
      } else ({ up: upv, across } = basis((n = [...(VIEW_DIRS[view] ?? VIEW_DIRS.front!)] as V), fwd));
      const flat = p.facing === "view" && Math.abs(n[2]) > 0.9;
      const hh = h ?? (w * img.naturalHeight) / img.naturalWidth, top = add(center, mul(upv, hh * (flat ? 0.5 : pivotTop)));
      const ac = mul(across, d.mirror ? -1 : 1), ws = w * squeeze;
      // Ниже `cutAt` (стоя — пояс, там ноги) часть срезана: и картинка, и плоскость короче.
      const vMax = upv[2] > 0.3 && Number.isFinite(cutAt) ? Math.max(0.05, Math.min(1, (top[2] - cutAt) / (hh * upv[2]))) : 1;
      const tl = add(top, mul(ac, -ws / 2)), tr = add(top, mul(ac, ws / 2)), bl = add(tl, mul(upv, -hh * vMax));
      quads.push({ img, tl, tr, bl, at: add(tl, add(mul(ac, ws / 2), mul(upv, (-hh * vMax) / 2))), slot, vMax });
    };
    /** Коробка: шесть граней, видны те, что смотрят на камеру, — до трёх сразу. */
    const box3 = (p: Part, center: V, w: number) => {
      for (const [name, d0] of [["front", [0, 1, 0]], ["back", [0, -1, 0]], ["right", [1, 0, 0]], ["left", [-1, 0, 0]], ["top", [0, 0, 1]], ["bottom", [0, 0, -1]]] as const) {
        const n: V = [d0[0], d0[1], d0[2]];
        if (dot(n, sub(eye, center)) <= 0 || !p.views.includes(name)) continue;
        const { up: upv, across } = basis(n, [0, 1, 0]), c = add(center, mul(n, w / 2));
        const tl = add(add(c, mul(across, -w / 2)), mul(upv, w / 2));
        const light = norm([-0.4, 0.5, 0.9]), shade = 0.55 * (1 - Math.max(0, dot(n, light)));
        quads.push({ tl, tr: add(tl, mul(across, w)), bl: add(tl, mul(upv, -w)), at: c, face: name, shade });
      }
    };
    const body = partOf(look.parts.body);
    const sh = body ? partGeom(body.id).shoulder : 0.08;
    if (standing) place("legs", [0, -0.05, 0], 3.4, 4.3, 1);
    place("body", [0, 0, shoulderZ], 5.2, null, sh, standing ? 3.9 : 0);
    place("head", [0, 0, headZ], 2.5, null, 0.5);
    place("hair", [0, 0, headZ + 0.9], 2.6, null, 0.6);
    for (const x of [-2, 2]) place("hands", [x, 0.6, shoulderZ - 1.6], 1.3, 1.3, 0.5);
    // пол — сетка, чтобы виден был наклон
    g.strokeStyle = "rgba(242,193,78,.18)"; g.lineWidth = 1;
    for (let i = -6; i <= 6; i += 1) for (const [p0, p1] of [[[i, -6, 0], [i, 6, 0]], [[-6, i, 0], [6, i, 0]]] as V[][]) {
      const A = proj(p0!), B = proj(p1!);
      if (A && B) { g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke(); }
    }
    // СПИНКА СТУЛА — ЗА СПИНОЙ сидящего, по ширине туловища и ниже плеч: спереди её не видно.
    if (!standing) {
      const spr = body ? partSprite(body.id, look.palette, body.views[0]!, look.ink, base, draw) : null;
      const hw = ((spr ? spr.solid : 0.85) * 5.2 * 0.92) / 2, y = -0.7;
      quads.push({ chair: true, tl: [-hw, y, 3.7], tr: [hw, y, 3.7], bl: [-hw, y, 0], at: [0, y, 1.85] });
    }
    // ДАЛЬНЕЕ — СНАЧАЛА
    quads.sort((q1, q2) => Math.hypot(...sub(q2.at, eye)) - Math.hypot(...sub(q1.at, eye)));
    for (const q of quads) {
      const lerp3 = (u: number, v: number): V => add(add(q.tl, mul(sub(q.tr, q.tl), u)), mul(sub(q.bl, q.tl), v));
      const poly = (pts: { x: number; y: number }[]) => { g.beginPath(); pts.forEach((c, k) => (k ? g.lineTo(c.x, c.y) : g.moveTo(c.x, c.y))); g.closePath(); };
      if (q.chair || q.face) {
        const corner = [lerp3(0, 0), lerp3(1, 0), lerp3(1, 1), lerp3(0, 1)].map(proj);
        if (corner.some((c) => !c)) continue;
        const pts = corner as { x: number; y: number }[];
        if (q.chair) {
          poly(pts); g.fillStyle = "#4a3420"; g.fill(); g.lineWidth = 3; g.strokeStyle = BLACK; g.stroke(); g.lineWidth = 1.5; g.strokeStyle = look.ink; g.stroke();
          continue;
        }
        // ГРАНЬ КУБА прямо в проекции: заливка, очки кругами на грани, тень по свету, чёрные рёбра.
        const shade = (hex: string) => { const k = 1 - q.shade!, n = parseInt(hex.slice(1), 16); return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`; };
        poly(pts); g.fillStyle = shade(PAPER); g.fill();
        g.fillStyle = shade(pal.red);
        for (const [pu, pv] of PIP_AT[q.face!] ?? []) {
          const ring = Array.from({ length: 18 }, (_, k) => { const tt = (k / 18) * Math.PI * 2; return proj(lerp3(pu + Math.cos(tt) * 0.085, pv + Math.sin(tt) * 0.085)); });
          if (ring.every(Boolean)) { poly(ring as { x: number; y: number }[]); g.fill(); }
        }
        poly(pts); g.lineJoin = "round"; g.lineWidth = 3; g.strokeStyle = BLACK; g.stroke();
        continue;
      }
      drawProjected(g, dpr, q.img!, (u, v) => proj(lerp3(u, v)), q.vMax ?? 1);
    }
    const face = look.parts.head === AVATAR && look.photo ? proj([0, 0, headZ]) : null;
    if (face && look.photo) {
      const z = dot(sub([0, 0, headZ], eye), fw), d = (2.5 * 0.74 * f) / z;
      if (photo.getAttribute("src") !== look.photo) photo.src = look.photo;
      Object.assign(photo.style, { display: "block", width: `${d}px`, height: `${d}px`, transform: `translate(${face.x - d / 2}px,${face.y - d / 2}px)` });
    } else photo.style.display = "none";
    box.dataset.views = SLOTS.map((s) => `${s}:${views[s] ?? "-"}`).join(" ");
    if (!still) draw();
  }
  draw();
  return {
    show(next) {
      const changed = SLOTS.some((s) => next.parts[s] !== look.parts[s]) || next.palette !== look.palette || next.ink !== look.ink;
      look = next;
      if (changed) { for (const s of SLOTS) delete held[s]; warm(); }
      draw();
    },
    views,
    destroy() { alive = false; },
  };
}
