// СПРАЙТЫ КУКОЛ — король и дама из колоды (`dolls.ts`), печёт их сам экран: вектор с сервера, подмена трёх
// красок под расцветку, кусок фигуры на бумаге, прозрачной — только бумага снаружи силуэта. Со спины —
// отражённая тёмная копия. Свой цвет человека — обводкой по силуэту. Так же, как на стенде `design/persona`.
//
// Печётся лениво, по первой просьбе, и кладётся ссылкой на картинку (`URL.createObjectURL`): пока не готово,
// `dollSprite` отвечает `null`, и слой тел рисует простую фигуру.

import { PALETTES, type Doll } from "../src/table/dolls.js";

/** Как вырезать куклу из рисунка карты: куски в единицах его viewBox, где на туловище линия плеч, куда смотрит лицо. */
export const ART: Record<Doll, { file: string; head: [number, number, number, number]; body: [number, number, number, number]; shoulder: number; looks: -1 | 1; oval?: boolean }> = {
  king: { file: "club-K", head: [28, 0, 70, 58], body: [0, 50, 123, 50], shoulder: 0.22, looks: -1 },
  queen: { file: "diamond-Q", head: [69, 23, 50, 52], body: [36, 66, 114, 56], shoulder: 0.12, looks: -1, oval: true },
};
/** Туловище продолжено вниз на столько своих высот — мантия уходит в тень под столом. */
export const EXTEND = 1.2;
const K = 6;
const PAPER = "#f7f1e6";

export type Part = "head" | "body" | "headBack" | "bodyBack";
export interface DollSprite {
  src: string;
  w: number;
  h: number;
}

const svgs = new Map<Doll, Promise<string>>();
const baked = new Map<string, Record<Part, HTMLCanvasElement>>();
const urls = new Map<string, DollSprite>();
const pending = new Set<string>();

const decode = async (src: string): Promise<HTMLImageElement> => {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
};

async function cut(svg: string, box: [number, number, number, number], red: string, extend = 0, oval = false): Promise<HTMLCanvasElement> {
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg)![1]!.trim().split(/\s+/).map(Number) as [number, number, number, number];
  const full = svg.replace("<svg ", `<svg width="${vb[2] * K}" height="${vb[3] * K}" color="${red}" `);
  const img = await decode("data:image/svg+xml;charset=utf-8," + encodeURIComponent(full));
  const [x, y, w, h] = box;
  const W = Math.round(w * K), H = Math.round(h * K);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  g.drawImage(img, -(x - vb[0]) * K, -(y - vb[1]) * K);
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
  if (oval) {
    // Голова дамы срезана краем карты и перечёркнута лентой — овал оставляет лицо и волосы.
    g.globalCompositeOperation = "destination-in";
    g.beginPath(); g.ellipse(W / 2, H * 0.52, W * 0.5, H * 0.52, 0, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = "source-over";
  }
  if (!extend) return c;
  const e = document.createElement("canvas");
  e.width = W; e.height = Math.round(H * (1 + extend));
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

async function bake(doll: Doll, palette: number, base: string): Promise<Record<Part, HTMLCanvasElement>> {
  const art = ART[doll];
  if (!svgs.has(doll)) svgs.set(doll, fetch(`${base}/table/sprites/${art.file}.svg`).then((r) => r.text()));
  const pal = PALETTES[palette] ?? PALETTES[0]!;
  const svg = (await svgs.get(doll)!).replace(/#f2c14e/gi, pal.gold).replace(/#1d4f80/gi, pal.blue);
  const head = await cut(svg, art.head, pal.red, 0, art.oval);
  const body = await cut(svg, art.body, pal.red, EXTEND);
  return { head, body, headBack: backOf(head, 0.9), bodyBack: backOf(body, 0.8) };
}

/**
 * Картинка куклы: кусок `part` куклы `doll` в расцветке `palette`, обведённый цветом `ink`. Не готова —
 * `null`, а печься она начнёт сейчас и по готовности позовёт `ready`.
 */
export function dollSprite(doll: Doll, palette: number, part: Part, ink: string, base: string, ready: () => void): DollSprite | null {
  const key = `${doll}|${palette}|${part}|${ink}`;
  const got = urls.get(key);
  if (got) return got;
  if (pending.has(key)) return null;
  pending.add(key);
  const set = `${doll}|${palette}`;
  void (async () => {
    try {
      if (!baked.has(set)) baked.set(set, await bake(doll, palette, base));
      const canvas = outlined(baked.get(set)![part], ink);
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
      if (!blob) return;
      urls.set(key, { src: URL.createObjectURL(blob), w: canvas.width, h: canvas.height });
      ready();
    } catch {
      // Не испеклась (нет сети, старый сервер без векторов) — остаётся простая фигура.
    } finally {
      pending.delete(key);
    }
  })();
  return null;
}
