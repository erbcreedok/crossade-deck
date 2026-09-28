// СПРАЙТЫ ТЕЛА — второй вид аватара: тело, голова и руки картинками. Печёт их браузер из векторов:
//
//   king-body, king-head   король треф из колоды (`game-presets/cards/art/courts/club-K.svg`): туловище со
//                          скипетром и державой — от плеч до линии отражения; голова с короной и бородой.
//                          Белое у фигуры — это бумага карты, поэтому фигура кладётся на бумагу, а прозрачной
//                          становится только бумага снаружи силуэта (заливка от краёв кадра);
//   hand-open, hand-closed рука-хват, как курсор grab/grabbing: свободная и держащая.
//
//   node scripts/bakeSprites.mjs      → server/table-client/sprites/*.png и unity/Assets/Resources/Sprites/*.png
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = fileURLToPath(new URL("../../", import.meta.url));
const OUT = [`${root}server/table-client/sprites`, `${root}unity/Assets/Resources/Sprites`];
const PAPER = "#f7f1e6", ACCENT = "#b3221f";
const king = readFileSync(`${root}game-presets/cards/art/courts/club-K.svg`, "utf8");

/** Кусок фигуры: `x, y, w, h` — в единицах её viewBox (0 0 123 199), `k` — пикселей в единице. */
const PARTS = {
  "king-head": { svg: king, box: [28, 0, 70, 58], k: 4, paper: true },
  "king-body": { svg: king, box: [0, 50, 123, 92], k: 4, paper: true },
};

// РУКА-ХВАТ. Белая перчатка с чёрным контуром — как системный курсор, но своя.
const HAND = (closed) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<g fill="#fff" stroke="#0b0704" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${closed
  ? `<path d="M9 14c0-1.7 1.3-2.6 2.6-2.3.4-1.6 1.7-2.2 3-1.8.6-1.3 2-1.7 3.2-1.1.8-.9 2.2-.9 3 0 1 .9 1.2 2.4 1.2 4.2v5c0 4.5-2.8 7.5-6.8 7.5h-1.4c-2.6 0-4.1-1.1-5.3-3.2L6.4 18c-.7-1.2-.3-2.6.9-3.1 1-.4 1.8 0 2.6.9z"/><path d="M11.6 11.7v4.8M14.6 9.9v5.6M17.8 8.8v6.3M20.8 8.8v6.5"/>`
  : `<path d="M11 15V6.8c0-1.4 1-2.3 2.1-2.3s2.1.9 2.1 2.3V13V4.9c0-1.4 1-2.3 2.1-2.3s2.1.9 2.1 2.3V13V6.3c0-1.4 1-2.3 2.1-2.3s2.1.9 2.1 2.3V20c0 5-3 8.5-7.4 8.5h-1.2c-2.8 0-4.4-1.2-5.8-3.4l-3.8-6c-.8-1.3-.4-2.8.9-3.3 1.1-.5 2.2 0 3 1.1z"/><path d="M15.2 13V6.8M19.4 13V6.3"/>`}</g></svg>`;
const HANDS = { "hand-open": HAND(false), "hand-closed": HAND(true) };

const browser = await chromium.launch();
const page = await browser.newPage();
for (const dir of OUT) mkdirSync(dir, { recursive: true });

async function bake(name, svg, box, k, paper) {
  const png = await page.evaluate(async ({ svg, box, k, paper, PAPER, ACCENT }) => {
    const [x, y, w, h] = box;
    const vb = /viewBox="([\d.\s-]+)"/.exec(svg)[1].split(/\s+/).map(Number);
    const full = svg.replace("<svg ", `<svg width="${vb[2] * k}" height="${vb[3] * k}" color="${ACCENT}" `);
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(full);
    await img.decode();
    const c = document.createElement("canvas");
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const g = c.getContext("2d");
    if (paper) {
      g.fillStyle = PAPER;
      g.fillRect(0, 0, c.width, c.height);
    }
    g.drawImage(img, -x * k, -y * k);
    if (paper) {
      // Бумага снаружи силуэта — прозрачная: заливка от краёв кадра по цвету бумаги.
      const d = g.getImageData(0, 0, c.width, c.height);
      const px = d.data, W = c.width, H = c.height;
      const pr = parseInt(PAPER.slice(1, 3), 16), pg = parseInt(PAPER.slice(3, 5), 16), pb = parseInt(PAPER.slice(5, 7), 16);
      const paperAt = (i) => Math.abs(px[i] - pr) + Math.abs(px[i + 1] - pg) + Math.abs(px[i + 2] - pb) < 60 && px[i + 3] > 0;
      const stack = [];
      for (let i = 0; i < W; i += 1) stack.push(i, (H - 1) * W + i);
      for (let j = 0; j < H; j += 1) stack.push(j * W, j * W + W - 1);
      while (stack.length) {
        const p = stack.pop();
        const i = p * 4;
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
    return c.toDataURL("image/png");
  }, { svg, box, k, paper, PAPER, ACCENT });
  const bytes = Buffer.from(png.split(",")[1], "base64");
  for (const dir of OUT) writeFileSync(`${dir}/${name}.png`, bytes);
  console.log(name, bytes.length);
}

for (const [name, p] of Object.entries(PARTS)) await bake(name, p.svg, p.box, p.k, p.paper);
for (const [name, svg] of Object.entries(HANDS)) await bake(name, svg, [0, 0, 32, 32], 6, false);
await browser.close();
