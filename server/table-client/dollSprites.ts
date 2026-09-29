// СПРАЙТЫ ЧАСТЕЙ СКИНА — печёт их сам экран, по ракурсу (`skins.ts`): каждая нарисованная сторона части, в
// расцветке, обведённая своим цветом человека. Откуда рисунок — у каждого источника части своё (`Part.art`):
//   court — кусок фигуры карты колоды, бумага снаружи силуэта — прозрачная; спина — отражённая тёмная копия лица;
//   file  — рисунок с сервера (`/table/skins/<папка>/<ракурс>-<слот>.svg`), по одному на ракурс;
//   draw  — нарисованное кодом (`skinArt.ts`): шар, палка, бочонок, кубик, корона, колпак, ноги-палки;
//   png   — готовая картинка стола (руки).
//
// Печётся лениво, по первой просьбе, и кладётся ссылкой на картинку (`URL.createObjectURL`): пока не готово,
// `partSprite` отвечает `null`, и слой тел рисует простую фигуру. Заставка входа ждёт `warmParts`.

import { PALETTES, type Palette } from "../src/table/dolls.js";
import { partOf, SLOTS, type Part, type Parts } from "../src/table/skins.js";
import { drawArt } from "./skinArt.js";
import { tuneOf } from "../src/table/tunes.js";

/** Как вырезать фигуру из рисунка карты: куски в единицах его viewBox, где на туловище линия плеч, куда смотрит лицо. */
export const ART: Record<string, { head: [number, number, number, number]; body: [number, number, number, number]; shoulder: number; looks: -1 | 1; oval?: boolean }> = {
  "club-K": { head: [28, 0, 70, 58], body: [0, 50, 123, 50], shoulder: 0.22, looks: -1 },
  "diamond-Q": { head: [69, 23, 50, 52], body: [36, 66, 114, 56], shoulder: 0.12, looks: -1, oval: true },
  "club-Q": { head: [68, 23, 56, 50], body: [30, 64, 116, 56], shoulder: 0.14, looks: -1, oval: true },
  "club-J": { head: [56, 22, 74, 64], body: [23, 78, 122, 52], shoulder: 0.16, looks: -1 },
  "diamond-K": { head: [50, 23, 78, 58], body: [22, 76, 123, 54], shoulder: 0.12, looks: -1 },
  "diamond-J": { head: [54, 23, 72, 60], body: [23, 78, 122, 52], shoulder: 0.14, looks: -1 },
  "heart-K": { head: [50, 23, 80, 57], body: [23, 74, 122, 54], shoulder: 0.1, looks: -1 },
  "heart-Q": { head: [62, 23, 62, 50], body: [23, 66, 122, 56], shoulder: 0.1, looks: -1, oval: true },
  "heart-J": { head: [50, 23, 74, 52], body: [23, 70, 122, 54], shoulder: 0.12, looks: -1 },
  "spade-K": { head: [50, 23, 78, 57], body: [22, 74, 123, 54], shoulder: 0.1, looks: -1 },
  "spade-Q": { head: [76, 23, 62, 50], body: [23, 64, 122, 56], shoulder: 0.12, looks: -1, oval: true },
  "spade-J": { head: [52, 23, 74, 50], body: [23, 68, 122, 56], shoulder: 0.1, looks: 1 },
};
/**
 * Туловище по высоте занимает прежние свои размеры и ещё столько своих высот ниже — ПУСТЫХ: фигура стоит на своём
 * месте и своей величины, а ниже нарисованного — ничего, не растянутые полосы.
 */
export const EXTEND = 1.2;
const K = 6;
const PAPER = "#f7f1e6";
export interface DollSprite {
  src: string;
  w: number;
  h: number;
  /** Какая доля ширины занята рисунком (не прозрачна): по ней спинка стула встаёт по ширине фигуры. */
  solid: number;
}

function solidOf(c: HTMLCanvasElement): number {
  const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  let lo = c.width, hi = -1;
  for (let y = 0; y < c.height; y += 4) for (let x = 0; x < c.width; x += 4) if (d[(y * c.width + x) * 4 + 3]! > 40) { if (x < lo) lo = x; if (x > hi) hi = x; }
  return hi < lo ? 1 : (hi - lo) / c.width;
}

/**
 * ГЕОМЕТРИЯ ЧАСТИ для слоя тел: где на туловище линия плеч (доля высоты испечённой картинки), голова — высота к
 * ширине, куда смотрит нарисованное лицо (`looks`: −1 — влево, как у фигур колоды, 0 — прямо). Лицо, смотрящее
 * вбок, слой тел зеркалит по взгляду человека.
 */
export function partGeom(id: string): { shoulder: number; aspect: number; looks: -1 | 0 | 1 } {
  const part = partOf(id), art = part?.art.kind === "court" ? ART[part.art.card] : undefined;
  const own = tuneOf(id).shoulder;
  if (art) return { shoulder: (own ?? art.shoulder) / (1 + EXTEND), aspect: art.head[3] / art.head[2], looks: art.looks };
  return { shoulder: (own ?? FILE_SHOULDER) / (1 + EXTEND), aspect: 1, looks: 0 };
}
/** Линия плеч на туловище рисунков (`file`, `draw`) — договорённость с художником: y≈18 из 100. */
const FILE_SHOULDER = 0.18;

const texts = new Map<string, Promise<string>>();
const fetchText = (url: string): Promise<string> => {
  let got = texts.get(url);
  if (!got) {
    got = fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));
    texts.set(url, got);
    got.catch(() => texts.delete(url));
  }
  return got;
};

const decode = async (src: string): Promise<HTMLImageElement> => {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
};

const recolor = (svg: string, pal: Palette): string => svg.replace(/#b3221f/gi, pal.red).replace(/#1d4f80/gi, pal.blue).replace(/#f2c14e/gi, pal.gold);

/** Кусок `box` рисунка на холсте; `paper` — бумага снаружи силуэта становится прозрачной; `extend` — пустое место ниже. */
async function cut(svg: string, box: [number, number, number, number] | null, red: string, opts: { extend?: number; oval?: boolean; paper?: boolean } = {}): Promise<HTMLCanvasElement> {
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg)![1]!.trim().split(/\s+/).map(Number) as [number, number, number, number];
  // Свой размер у корня рисунка снимается: второй `width` сделал бы SVG невалидным, и он бы не испёкся.
  const full = svg.replace(/<svg\b[^>]*>/, (root) => root.replace(/\s(width|height|color)="[^"]*"/g, "").replace("<svg", `<svg width="${vb[2] * K}" height="${vb[3] * K}" color="${red}"`));
  const img = await decode("data:image/svg+xml;charset=utf-8," + encodeURIComponent(full));
  const [x, y, w, h] = box ?? vb;
  const W = Math.round(w * K), H = Math.round(h * K);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  if (opts.paper) { g.fillStyle = PAPER; g.fillRect(0, 0, W, H); }
  g.drawImage(img, -(x - vb[0]) * K, -(y - vb[1]) * K);
  if (opts.paper) {
    // Бумага снаружи силуэта — прозрачная: заливка от краёв по цвету бумаги.
    const d = g.getImageData(0, 0, W, H), px = d.data;
    const paperAt = (i: number) => Math.abs(px[i]! - 0xf7) + Math.abs(px[i + 1]! - 0xf1) + Math.abs(px[i + 2]! - 0xe6) < 60 && px[i + 3]! > 0;
    const stack: number[] = [];
    for (let i = 0; i < W; i += 1) stack.push(i, (H - 1) * W + i);
    for (let j = 0; j < H; j += 1) stack.push(j * W, j * W + W - 1);
    while (stack.length) {
      const p = stack.pop()!, i = p * 4;
      if (!paperAt(i)) continue;
      px[i + 3] = 0;
      const x0 = p % W, y0 = (p - x0) / W;
      if (x0 > 0) stack.push(p - 1);
      if (x0 < W - 1) stack.push(p + 1);
      if (y0 > 0) stack.push(p - W);
      if (y0 < H - 1) stack.push(p + W);
    }
    g.putImageData(d, 0, 0);
  }
  if (opts.oval) {
    // Голова дамы срезана краем карты и перечёркнута лентой — овал оставляет лицо и волосы.
    g.globalCompositeOperation = "destination-in";
    g.beginPath(); g.ellipse(W / 2, H * 0.52, W * 0.5, H * 0.52, 0, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = "source-over";
  }
  if (!opts.extend) return c;
  const e = document.createElement("canvas");
  e.width = W; e.height = Math.round(H * (1 + opts.extend));
  e.getContext("2d")!.drawImage(c, 0, 0);
  return e;
}

/** Со спины: отражённая (его левое — наше левое) и залитая тёмным почти в один тон. */
function backOf(img: HTMLCanvasElement, dark: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d")!;
  g.translate(c.width, 0); g.scale(-1, 1);
  g.drawImage(img, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.globalAlpha = dark;
  g.fillStyle = "#1c140e";
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Обводка силуэта цветом человека: он всегда различает двоих в одной расцветке. */
function outlined(img: HTMLCanvasElement, ink: string, w = 11): HTMLCanvasElement {
  const tint = document.createElement("canvas");
  tint.width = img.width; tint.height = img.height;
  const tg = tint.getContext("2d")!;
  tg.drawImage(img, 0, 0);
  tg.globalCompositeOperation = "source-in";
  tg.fillStyle = ink; tg.fillRect(0, 0, tint.width, tint.height);
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d")!;
  for (let a = 0; a < 16; a += 1) g.drawImage(tint, Math.cos((a / 16) * Math.PI * 2) * w, Math.sin((a / 16) * Math.PI * 2) * w);
  g.drawImage(img, 0, 0);
  return c;
}

/** Все нарисованные стороны части в расцветке: ракурс → холст (без обводки). */
async function bake(part: Part, palette: number, base: string): Promise<Map<string, HTMLCanvasElement>> {
  const pal = PALETTES[palette] ?? PALETTES[0]!;
  const out = new Map<string, HTMLCanvasElement>();
  const art = part.art, extend = part.slot === "body" ? { extend: EXTEND } : {};
  if (art.kind === "court") {
    const box = ART[art.card]!;
    const svg = recolor(await fetchText(`${base}/table/sprites/${art.card}.svg`), pal);
    const front = await cut(svg, part.slot === "head" ? box.head : box.body, pal.red, { ...extend, oval: part.slot === "head" && box.oval, paper: true });
    out.set("front", front).set("back", backOf(front, part.slot === "head" ? 0.9 : 0.8));
    return out;
  }
  if (art.kind === "png") {
    const img = await decode(`${base}/table/sprites/${art.file}.png`);
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d")!.drawImage(img, 0, 0);
    for (const view of part.views) out.set(view, c);
    return out;
  }
  for (const view of part.views) {
    const raw = art.kind === "draw" ? drawArt(art.art, view) : art.kind === "file" ? await fetchText(`${base}/table/skins/${art.dir}/${view}-${part.slot}.svg`) : "";
    if (!raw) continue;
    out.set(view, await cut(part.recolor ? recolor(raw, pal) : raw, null, pal.red, extend));
  }
  return out;
}

const baked = new Map<string, Promise<Map<string, HTMLCanvasElement>>>();
const urls = new Map<string, DollSprite>();
const making = new Map<string, Promise<void>>();
/** Часть не испеклась (нет рисунков, нет сети) — когда; до `RETRY_MS` после этого за ней не ходят. */
const failedAt = new Map<string, number>();
/** Кто ждёт кусок, пока он печётся. */
const waiting = new Map<string, Set<() => void>>();
const RETRY_MS = 30_000;

/** Испечь одну сторону части (или дождаться уже идущей печки). Не испеклась — промис всё равно выполняется. */
function make(id: string, palette: number, view: string, ink: string, base: string): Promise<void> {
  const key = `${id}|${palette}|${view}|${ink}`;
  if (urls.has(key)) return Promise.resolve();
  const was = making.get(key);
  if (was) return was;
  const part = partOf(id);
  if (!part || part.art.kind === "none") return Promise.resolve();
  const set = `${id}|${palette}`;
  if (Date.now() - (failedAt.get(set) ?? -Infinity) < RETRY_MS) return Promise.resolve();
  const job = (async () => {
    try {
      if (!baked.has(set)) {
        const b = bake(part, palette, base);
        baked.set(set, b);
        b.catch(() => baked.delete(set));
      }
      const canvas = (await baked.get(set)!).get(view);
      if (!canvas) return;
      const done = outlined(canvas, ink);
      const blob = await new Promise<Blob | null>((ok) => done.toBlob(ok, "image/png"));
      if (blob) urls.set(key, { src: URL.createObjectURL(blob), w: done.width, h: done.height, solid: part.slot === "body" ? solidOf(canvas) : 1 });
    } catch {
      // Не испеклась — остаётся простая фигура.
      failedAt.set(set, Date.now());
    } finally {
      making.delete(key);
    }
  })();
  making.set(key, job);
  return job;
}

/**
 * ЗАРАНЕЕ — при входе в комнату и при выборе в профиле: все стороны всех частей скина. Поворот не ждёт печки
 * (иначе кадр без части — мерцание), и заставка входа ждёт их: кукла появляется сразу собой.
 */
export function warmParts(parts: Parts, palette: number, ink: string, base: string): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const slot of SLOTS) {
    const part = partOf(parts[slot]);
    if (part) for (const view of part.views) jobs.push(make(part.id, palette, view, ink, base));
  }
  return Promise.all(jobs).then(() => {});
}

/**
 * Картинка части: нарисованный ракурс `view` части `id`, в расцветке `palette`, обведённый цветом `ink`. Не
 * готова — `null`, а печься она начнёт сейчас и по готовности позовёт `ready`.
 */
export function partSprite(id: string, palette: number, view: string, ink: string, base: string, ready: () => void): DollSprite | null {
  const key = `${id}|${palette}|${view}|${ink}`;
  const got = urls.get(key);
  if (got) return got;
  // ГОТОВО — СКАЗАТЬ ВСЕМ, кто спрашивал, пока пеклось: и превью, и галерее, а не только первому. Печь могла начать
  // и не эта функция (заранее — `warmParts`): тогда первый спросивший подписывает ожидающих на ту же печь.
  let asked = waiting.get(key);
  if (asked) { asked.add(ready); return null; }
  waiting.set(key, (asked = new Set([ready])));
  void make(id, palette, view, ink, base).then(() => {
    const all = waiting.get(key);
    waiting.delete(key);
    if (urls.has(key)) for (const fn of all ?? []) fn();
  });
  return null;
}
