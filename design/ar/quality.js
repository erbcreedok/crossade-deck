// ГОДИТСЯ ЛИ КАДР В МЕТКУ — пока человек целится, а не после минуты компиляции.
//
// Трекер держится за углы: точки, где яркость меняется в две стороны сразу. Их и считаем (Ши–Томази:
// меньшее собственное число структурного тензора), плюс три причины, по которым кадр плох при любом
// числе углов:
//   • углы кучкой — метка из угла обложки теряется, как только угол ушёл из кадра (покрытие сеткой);
//   • смазано — лапласиан против градиента; смаз съедает углы у настоящей метки позже, в игре;
//   • блик — пересвеченная доля кадра; блик ездит вместе с телефоном, и метка «плывёт».
//
// Чистая функция над серым 0..1: её гоняет `quality.test.mjs` без браузера и камеры.

export const DEFAULTS = {
  corner: 0.012, // порог угла (λmin по окну 5×5, яркость 0..1)
  enough: 120, // столько углов — это «полно»
  grid: 6, // покрытие меряется сеткой grid×grid
  okScore: 0.3, // счёт (полнота × покрытие), с которого кадр годится
  sharp: 0.5, // резкость (Σлапласиан² / Σградиент² по рисунку) ниже — «смазано»
  glare: 0.12, // доля пересвета выше — «блик»
};

/**
 * @param {{data: Float32Array, width: number, height: number}} img серое 0..1
 * @returns {{points: {x:number,y:number}[], count: number, coverage: number, sharp: number,
 *            glare: number, score: number, verdict: "ok"|"few"|"blur"|"glare"}}
 */
export function assess(img, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { data: g, width: w, height: h } = img;

  const ixx = new Float32Array(w * h), iyy = new Float32Array(w * h), ixy = new Float32Array(w * h);
  let lapSq = 0, gradSq = 0, bright = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx = (g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1]) / 8;
      const gy = (g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1]) / 8;
      ixx[i] = gx * gx; iyy[i] = gy * gy; ixy[i] = gx * gy;
      // Резкость — лапласиан ОТНОСИТЕЛЬНО градиента и только там, где рисунок есть: однотонная половина
      // кадра не должна «смазывать» резкую вторую, а контраст рисунка — делать его резче.
      if (gx * gx + gy * gy > 1e-4) {
        const lap = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
        lapSq += lap * lap; gradSq += gx * gx + gy * gy;
      }
    }
  }
  for (let i = 0; i < w * h; i += 1) if (g[i] >= 0.98) bright += 1;

  const R = 2;
  const lam = new Float32Array(w * h);
  for (let y = R + 1; y < h - R - 1; y += 1) {
    for (let x = R + 1; x < w - R - 1; x += 1) {
      let a = 0, b = 0, c = 0;
      for (let dy = -R; dy <= R; dy += 1) {
        const row = (y + dy) * w + x;
        for (let dx = -R; dx <= R; dx += 1) { a += ixx[row + dx]; b += ixy[row + dx]; c += iyy[row + dx]; }
      }
      lam[y * w + x] = (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + b * b);
    }
  }

  const found = [];
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x, v = lam[i];
      if (v < o.corner) continue;
      if (v < lam[i - 1] || v < lam[i + 1] || v < lam[i - w] || v < lam[i + w]
        || v < lam[i - w - 1] || v < lam[i - w + 1] || v < lam[i + w - 1] || v < lam[i + w + 1]) continue;
      found.push({ x, y, v });
    }
  }
  found.sort((p, q) => q.v - p.v);
  const points = found.slice(0, o.enough * 3).map(({ x, y }) => ({ x, y }));

  const cells = new Set(points.map(({ x, y }) => Math.floor((x / w) * o.grid) * o.grid + Math.floor((y / h) * o.grid)));
  const coverage = cells.size / (o.grid * o.grid);
  const sharp = gradSq ? lapSq / gradSq : 0;
  const glare = bright / (w * h);
  const score = Math.min(1, points.length / o.enough) * coverage;

  const verdict = glare > o.glare ? "glare" : points.length > 0 && sharp < o.sharp ? "blur" : score < o.okScore ? "few" : "ok";
  return { points, count: points.length, coverage, sharp, glare, score, verdict };
}

/** Кадр canvas → серое 0..1 заданной ширины (высота по пропорции). */
export function greyOf(ctx, sw, sh) {
  const px = ctx.getImageData(0, 0, sw, sh).data;
  const data = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i += 1) data[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  return { data, width: sw, height: sh };
}
