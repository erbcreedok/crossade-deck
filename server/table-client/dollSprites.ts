// СПРАЙТЫ КУКОЛ — печёт их сам экран, по ракурсу (`skins.ts`): голова и туловище каждого нарисованного ракурса,
// в расцветке, обведённые своим цветом человека. Откуда рисунок — у каждого источника скина своё:
//   deck  — король и дама из колоды: кусок фигуры карты, бумага снаружи силуэта — прозрачная; спина —
//           отражённая тёмная копия лица;
//   files — рисунки скина с сервера (`/table/skins/<скин>/<ракурс>-<часть>.svg`), по одному на ракурс и часть;
//   cube  — кубик: грани рисуются здесь же;
//   stick — картинок нет, слой тел рисует простую фигуру.
//
// Печётся лениво, по первой просьбе, и кладётся ссылкой на картинку (`URL.createObjectURL`): пока не готово,
// `dollSprite` отвечает `null`, и слой тел рисует простую фигуру.

import { PALETTES, type Palette } from "../src/table/dolls.js";
import { skinOf, type Skin } from "../src/table/skins.js";

/** Как вырезать короля и даму из рисунка карты: куски в единицах его viewBox, где на туловище линия плеч, куда смотрит лицо. */
export const ART: Record<string, { file: string; head: [number, number, number, number]; body: [number, number, number, number]; shoulder: number; looks: -1 | 1; oval?: boolean }> = {
  king: { file: "club-K", head: [28, 0, 70, 58], body: [0, 50, 123, 50], shoulder: 0.22, looks: -1 },
  queen: { file: "diamond-Q", head: [69, 23, 50, 52], body: [36, 66, 114, 56], shoulder: 0.12, looks: -1, oval: true },
  "club-Q": { file: "club-Q", head: [68, 23, 56, 50], body: [30, 64, 116, 56], shoulder: 0.14, looks: -1, oval: true },
  "club-J": { file: "club-J", head: [56, 22, 74, 64], body: [23, 78, 122, 52], shoulder: 0.16, looks: -1 },
  "diamond-K": { file: "diamond-K", head: [50, 23, 78, 58], body: [22, 76, 123, 54], shoulder: 0.12, looks: -1 },
  "diamond-J": { file: "diamond-J", head: [54, 23, 72, 60], body: [23, 78, 122, 52], shoulder: 0.14, looks: -1 },
  "heart-K": { file: "heart-K", head: [50, 23, 80, 57], body: [23, 74, 122, 54], shoulder: 0.1, looks: -1 },
  "heart-Q": { file: "heart-Q", head: [62, 23, 62, 50], body: [23, 66, 122, 56], shoulder: 0.1, looks: -1, oval: true },
  "heart-J": { file: "heart-J", head: [50, 23, 74, 52], body: [23, 70, 122, 54], shoulder: 0.12, looks: -1 },
  "spade-K": { file: "spade-K", head: [50, 23, 78, 57], body: [22, 74, 123, 54], shoulder: 0.1, looks: -1 },
  "spade-Q": { file: "spade-Q", head: [76, 23, 62, 50], body: [23, 64, 122, 56], shoulder: 0.12, looks: -1, oval: true },
  "spade-J": { file: "spade-J", head: [52, 23, 74, 50], body: [23, 68, 122, 56], shoulder: 0.1, looks: 1 },
};
/** Туловище продолжено вниз на столько своих высот — мантия уходит в тень под столом. */
export const EXTEND = 1.2;
const K = 6;
const PAPER = "#f7f1e6";
/** Краски колоды, которые подменяет расцветка. */
const DECK = { red: "#b3221f", blue: "#1d4f80", gold: "#f2c14e" };

export type Part = "head" | "body";
export interface DollSprite {
  src: string;
  w: number;
  h: number;
}

/**
 * ГЕОМЕТРИЯ СКИНА для слоя тел: где на туловище линия плеч (доля высоты испечённой картинки) и куда смотрит
 * нарисованное лицо (`looks`: −1 — влево, как у фигур колоды, 0 — прямо). Лицо, смотрящее вбок, слой тел
 * зеркалит по взгляду человека.
 */
export function dollGeom(doll: string): { shoulder: number; looks: -1 | 0 | 1 } {
  const art = ART[doll];
  if (art) return { shoulder: art.shoulder / (1 + EXTEND), looks: art.looks };
  return { shoulder: FILE_SHOULDER / (1 + EXTEND), looks: 0 };
}
/** Голова скина: высота к ширине (у короля и дамы — по куску карты, у рисунков скина — квадрат). */
export const DOLL_HEAD_ASPECT = (doll: string): number => {
  const art = ART[doll];
  return art ? art.head[3] / art.head[2] : 1;
};
/** Линия плеч на туловище рисунков скина (`files`, `cube`) — договорённость с художником: y≈18 из 100. */
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

/** Кусок `box` рисунка на холсте; `paper` — бумага снаружи силуэта становится прозрачной; `extend` — туловище вниз. */
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
  const eg = e.getContext("2d")!;
  eg.drawImage(c, 0, 0);
  eg.drawImage(c, 0, H - 2, W, 2, 0, H - 1, W, e.height - H + 1);
  // Ниже среза мантия уходит в тень под столом, а не тянется полосами на свету.
  const fade = eg.createLinearGradient(0, H - 1, 0, e.height);
  fade.addColorStop(0, "rgba(11,7,4,.35)");
  fade.addColorStop(0.5, "rgba(11,7,4,.85)");
  fade.addColorStop(1, "rgba(11,7,4,1)");
  eg.globalCompositeOperation = "source-atop";
  eg.fillStyle = fade;
  eg.fillRect(0, H - 1, W, e.height - H + 1);
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

// ── КУБИК: грани рисуются здесь. Голова — грань с очками (у каждого ракурса своё число), туловище — брусок. ──
const PIPS: Record<string, number> = { front: 1, back: 6, right: 3, left: 4, top: 5, bottom: 2 };
const PIP_AT: Record<number, [number, number][]> = {
  1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};
function cubeSvg(view: string, part: Part): string {
  if (part === "head") {
    const pips = (PIP_AT[PIPS[view] ?? 1] ?? []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${DECK.red}" stroke="#0b0704" stroke-width="2"/>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="5" y="5" width="90" height="90" rx="16" fill="${PAPER}" stroke="#0b0704" stroke-width="5"/>${pips}</svg>`;
  }
  const side = view === "right" || view === "left";
  const w = side ? 70 : 104, x = (120 - w) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100"><path d="M${x} 100 V26 Q${x} 14 ${x + 12} 14 H${x + w - 12} Q${x + w} 14 ${x + w} 26 V100 Z" fill="${DECK.blue}" stroke="#0b0704" stroke-width="5"/>`
    + `<rect x="${x + w / 2 - 14}" y="14" width="28" height="86" fill="${DECK.red}" stroke="#0b0704" stroke-width="3"/>`
    + `<rect x="${x + 4}" y="16" width="${w - 8}" height="10" fill="${DECK.gold}" stroke="#0b0704" stroke-width="3"/></svg>`;
}

/** Все нарисованные ракурсы скина в расцветке: `вид:часть` → холст (без обводки). */
async function bake(skin: Skin, palette: number, base: string): Promise<Map<string, HTMLCanvasElement>> {
  const pal = PALETTES[palette] ?? PALETTES[0]!;
  const out = new Map<string, HTMLCanvasElement>();
  if (skin.source === "deck") {
    const art = ART[skin.id]!;
    const svg = recolor(await fetchText(`${base}/table/sprites/${art.file}.svg`), pal);
    const head = await cut(svg, art.head, pal.red, { oval: art.oval, paper: true });
    const body = await cut(svg, art.body, pal.red, { extend: EXTEND, paper: true });
    out.set("front:head", head).set("front:body", body).set("back:head", backOf(head, 0.9)).set("back:body", backOf(body, 0.8));
    return out;
  }
  for (const view of skin.views) {
    for (const part of ["head", "body"] as const) {
      const raw = skin.source === "cube" ? cubeSvg(view, part) : await fetchText(`${base}/table/skins/${skin.id}/${view}-${part}.svg`);
      const svg = skin.recolor ? recolor(raw, pal) : raw;
      out.set(`${view}:${part}`, await cut(svg, null, pal.red, part === "body" ? { extend: EXTEND } : {}));
    }
  }
  return out;
}

const baked = new Map<string, Promise<Map<string, HTMLCanvasElement>>>();
const urls = new Map<string, DollSprite>();
const making = new Map<string, Promise<void>>();
/** Скин не испёкся (нет рисунков, нет сети) — когда; до `RETRY_MS` после этого за ним не ходят. */
const failedAt = new Map<string, number>();
/** Кто ждёт кусок, пока он печётся. */
const waiting = new Map<string, Set<() => void>>();
const RETRY_MS = 30_000;

/** Испечь один кусок (или дождаться уже идущей печки). Не испёкся — промис всё равно выполняется. */
function make(doll: string, palette: number, view: string, part: Part, ink: string, base: string): Promise<void> {
  const key = `${doll}|${palette}|${view}|${part}|${ink}`;
  if (urls.has(key)) return Promise.resolve();
  const was = making.get(key);
  if (was) return was;
  const skin = skinOf(doll);
  if (!skin || skin.source === "stick") return Promise.resolve();
  const set = `${doll}|${palette}`;
  if (Date.now() - (failedAt.get(set) ?? -Infinity) < RETRY_MS) return Promise.resolve();
  const job = (async () => {
    try {
      if (!baked.has(set)) {
        const b = bake(skin, palette, base);
        baked.set(set, b);
        b.catch(() => baked.delete(set));
      }
      const canvas = (await baked.get(set)!).get(`${view}:${part}`);
      if (!canvas) return;
      const done = outlined(canvas, ink);
      const blob = await new Promise<Blob | null>((ok) => done.toBlob(ok, "image/png"));
      if (blob) urls.set(key, { src: URL.createObjectURL(blob), w: done.width, h: done.height });
    } catch {
      // Не испеклась (нет сети, у скина ещё нет рисунков) — остаётся простая фигура.
      failedAt.set(set, Date.now());
    } finally {
      making.delete(key);
    }
  })();
  making.set(key, job);
  return job;
}

/**
 * ЗАРАНЕЕ, ПРИ ВХОДЕ В КОМНАТУ: все ракурсы куклы этого человека, голова и туловище. Заставка ждёт их, и кукла
 * появляется сразу собой, а не палкой, которую потом сменяет картинка.
 */
export function warmDoll(doll: string, palette: number, ink: string, base: string): Promise<void> {
  const skin = skinOf(doll);
  if (!skin) return Promise.resolve();
  return Promise.all(skin.views.flatMap((view) => (["head", "body"] as const).map((part) => make(doll, palette, view, part, ink, base)))).then(() => {});
}

/**
 * Картинка куклы: нарисованный ракурс `view` скина `doll`, кусок `part`, в расцветке `palette`, обведённый
 * цветом `ink`. Не готова — `null`, а печься она начнёт сейчас и по готовности позовёт `ready`.
 */
export function dollSprite(doll: string, palette: number, view: string, part: Part, ink: string, base: string, ready: () => void): DollSprite | null {
  const key = `${doll}|${palette}|${view}|${part}|${ink}`;
  const got = urls.get(key);
  if (got) return got;
  // ГОТОВО — СКАЗАТЬ ВСЕМ, кто спрашивал, пока пеклось: и превью, и галерее, а не только первому.
  let asked = waiting.get(key);
  if (!asked) waiting.set(key, (asked = new Set()));
  asked.add(ready);
  if (making.has(key)) return null;
  void make(doll, palette, view, part, ink, base).then(() => {
    const all = waiting.get(key);
    waiting.delete(key);
    if (urls.has(key)) for (const fn of all ?? []) fn();
  });
  return null;
}
