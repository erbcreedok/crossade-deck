// СЛЕЖЕНИЕ ЗА ПОЛОМ — где стоит телефон, по тому, как под ним едут точки. Без меток и без их сборки.
//
// Поворот телефона знает гироскоп — всегда, точно, без опоздания. Камере остаётся одно: шаг. Поэтому:
//
//   • в первом кадре берутся опорные точки (углы рисунка, Ши–Томази) и лучом из глаза кладутся на
//     плоскость стола — у каждой своё место в мире (`seed`);
//   • дальше каждая точка ведётся кадр за кадром пирамидальным Лукасом–Канаде (`follow`): маленький
//     серый кадр, окно вокруг точки, сдвиг, при котором окно совпало;
//   • глаз — та точка, из которой все лучи (повёрнутые гироскопом) проходят через свои места на
//     плоскости (`eyeFrom`): три неизвестных, по уравнению на точку, выбросы гасятся весами.
//
// Масштаб — от плоскости: поверхность под столом считается лежащей там же, где нарисован стол.
// Чистая математика над серым 0..1 и векторами: `arTrack.test.ts`.

type Vec = [number, number, number];
export type Quat = [number, number, number, number];
export interface Grey { data: Float32Array; width: number; height: number }
export interface Pt { x: number; y: number }

// ─── пирамида и выборка ───────────────────────────────────────────────────────────────────────────
/** Кадр и его уменьшенные вдвое копии: на грубых ступенях большой шаг — маленький сдвиг. */
export function pyramid(g: Grey, levels: number): Grey[] {
  const out = [g];
  for (let l = 1; l < levels; l += 1) {
    const s = out[l - 1]!, w = s.width >> 1, h = s.height >> 1;
    if (w < 16 || h < 16) break;
    const d = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = 2 * y * s.width + 2 * x;
        d[y * w + x] = (s.data[i]! + s.data[i + 1]! + s.data[i + s.width]! + s.data[i + s.width + 1]!) / 4;
      }
    }
    out.push({ data: d, width: w, height: h });
  }
  return out;
}

/** Яркость между пикселями (билинейно); за краем — NaN. */
function at(g: Grey, x: number, y: number): number {
  if (x < 0 || y < 0 || x > g.width - 1.001 || y > g.height - 1.001) return NaN;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * g.width + x0;
  const a = g.data[i]!, b = g.data[i + 1]!, c = g.data[i + g.width]!, d = g.data[i + g.width + 1]!;
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// ─── Лукас–Канаде ─────────────────────────────────────────────────────────────────────────────────
export interface FollowOpts {
  /** Полуокно, px на ступени пирамиды. */
  win: number;
  iters: number;
  /** Средняя разница яркости в окне после сдвига — больше этого точка потеряна. */
  maxError: number;
}
export const FOLLOW: FollowOpts = { win: 5, iters: 12, maxError: 0.08 };

/** Где точки `pts` кадра `a` оказались в кадре `b`. `null` — потеряна (ушла за край, окно не совпало). */
export function follow(a: Grey[], b: Grey[], pts: Pt[], o: FollowOpts = FOLLOW): (Pt | null)[] {
  const top = Math.min(a.length, b.length) - 1;
  return pts.map((p) => {
    let gx = 0, gy = 0; // догадка о сдвиге, в пикселях текущей ступени
    for (let l = top; l >= 0; l -= 1) {
      const A = a[l]!, B = b[l]!, k = 2 ** l, px = p.x / k, py = p.y / k;
      // Матрица градиентов окна в первом кадре — одна на все итерации.
      let gxx = 0, gxy = 0, gyy = 0;
      const ix: number[] = [], iy: number[] = [], i0: number[] = [];
      for (let dy = -o.win; dy <= o.win; dy += 1) {
        for (let dx = -o.win; dx <= o.win; dx += 1) {
          const x = px + dx, y = py + dy;
          const v = at(A, x, y), gxv = (at(A, x + 1, y) - at(A, x - 1, y)) / 2, gyv = (at(A, x, y + 1) - at(A, x, y - 1)) / 2;
          if (Number.isNaN(v) || Number.isNaN(gxv) || Number.isNaN(gyv)) continue;
          ix.push(gxv); iy.push(gyv); i0.push(v);
          gxx += gxv * gxv; gxy += gxv * gyv; gyy += gyv * gyv;
        }
      }
      const det = gxx * gyy - gxy * gxy;
      if (det < 1e-7 || ix.length < 9) return null;
      let vx = 0, vy = 0;
      for (let it = 0; it < o.iters; it += 1) {
        let bx = 0, by = 0, n = 0;
        let j = 0;
        for (let dy = -o.win; dy <= o.win; dy += 1) {
          for (let dx = -o.win; dx <= o.win; dx += 1) {
            const x = px + dx, y = py + dy;
            if (Number.isNaN(at(A, x, y)) || Number.isNaN(at(A, x + 1, y)) || Number.isNaN(at(A, x - 1, y)) || Number.isNaN(at(A, x, y + 1)) || Number.isNaN(at(A, x, y - 1))) continue;
            const w = at(B, x + gx + vx, y + gy + vy);
            if (!Number.isNaN(w)) { const e = i0[j]! - w; bx += e * ix[j]!; by += e * iy[j]!; n += 1; }
            j += 1;
          }
        }
        if (n < 9) return null;
        const sx = (gyy * bx - gxy * by) / det, sy = (gxx * by - gxy * bx) / det;
        vx += sx; vy += sy;
        if (sx * sx + sy * sy < 1e-4) break;
      }
      gx += vx; gy += vy;
      if (l > 0) { gx *= 2; gy *= 2; }
    }
    const q = { x: p.x + gx, y: p.y + gy };
    // Проверка: окно в новом месте — то же, что было.
    const A = a[0]!, B = b[0]!;
    let err = 0, n = 0;
    for (let dy = -o.win; dy <= o.win; dy += 1) {
      for (let dx = -o.win; dx <= o.win; dx += 1) {
        const u = at(A, p.x + dx, p.y + dy), w = at(B, q.x + dx, q.y + dy);
        if (!Number.isNaN(u) && !Number.isNaN(w)) { err += Math.abs(u - w); n += 1; }
      }
    }
    return n >= 9 && err / n <= o.maxError ? q : null;
  });
}

// ─── геометрия ────────────────────────────────────────────────────────────────────────────────────
export function rotate([qx, qy, qz, qw]: Quat, [vx, vy, vz]: Vec): Vec {
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + (qy * tz - qz * ty), vy + qw * ty + (qz * tx - qx * tz), vz + qw * tz + (qx * ty - qy * tx)];
}
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec): Vec => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

/** Камера: кадр `width`×`height`, вертикальный обзор `fov` градусов. */
export interface Lens { width: number; height: number; fov: number }

/** Пиксель кадра → луч в мире (камера смотрит в −Z, верх кадра — +Y; `q` — поворот телефона). */
export function rayOf(lens: Lens, q: Quat, p: Pt): Vec {
  const f = lens.height / 2 / Math.tan((lens.fov * Math.PI) / 360);
  return norm(rotate(q, [(p.x - lens.width / 2) / f, -(p.y - lens.height / 2) / f, -1]));
}

/** Место на плоскости (точка `at`, нормаль `n`), куда смотрит луч `d` из глаза; дальше `far` м или мимо — `null`. */
export function onPlane(eye: Vec, d: Vec, at: Vec, n: Vec, far = 4): Vec | null {
  const den = dot(d, n);
  if (Math.abs(den) < 1e-6) return null;
  const s = dot([at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]], n) / den;
  if (s <= 0 || s > far) return null;
  return [eye[0] + d[0] * s, eye[1] + d[1] * s, eye[2] + d[2] * s];
}

/**
 * ГЛАЗ ПО ЛУЧАМ: точка, из которой каждый луч `d[i]` проходит через своё место `X[i]`. Невязка точки —
 * расстояние от её места до луча; уравнение линейно по глазу: (I − ddᵀ)·p = (I − ddᵀ)·X. Сбившиеся точки
 * отсекаются на каждом проходе: невязка больше `floor` и больше двух медианных — точки нет. `floor` —
 * порядка пикселя на расстоянии до пола (до пола ~0.35 м, пиксель кадра — ~1.6 мм). Возвращает глаз и
 * невязку каждой точки.
 */
export function eyeFrom(X: Vec[], d: Vec[], start: Vec, passes = 6, floor = 0.003): { eye: Vec; miss: number[] } {
  let eye = start;
  let miss: number[] = X.map(() => 0);
  const missOf = (p: Vec): number[] => X.map((x, i) => {
    const di = d[i]!, v: Vec = [x[0] - p[0], x[1] - p[1], x[2] - p[2]], t = dot(v, di);
    return Math.hypot(v[0] - di[0] * t, v[1] - di[1] * t, v[2] - di[2] * t);
  });
  for (let pass = 0; pass < passes; pass += 1) {
    const cut = pass === 0 ? Infinity : Math.max(floor, 2 * ([...miss].sort((u, v) => u - v)[miss.length >> 1] ?? 0));
    const M = [0, 0, 0, 0, 0, 0, 0, 0, 0], r = [0, 0, 0];
    let used = 0;
    X.forEach((x, i) => {
      if (miss[i]! > cut) return;
      used += 1;
      const [a, b, c] = d[i]!;
      const P = [1 - a * a, -a * b, -a * c, -a * b, 1 - b * b, -b * c, -a * c, -b * c, 1 - c * c];
      for (let k = 0; k < 9; k += 1) M[k]! += P[k]!;
      for (let row = 0; row < 3; row += 1) r[row]! += P[row * 3]! * x[0] + P[row * 3 + 1]! * x[1] + P[row * 3 + 2]! * x[2];
    });
    const next = used >= 3 ? solve3(M, r) : null;
    if (!next) break;
    eye = next;
    miss = missOf(eye);
  }
  return { eye, miss };
}

function solve3(m: number[], r: number[]): Vec | null {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const [x, y, z] = r as [number, number, number];
  return [
    (x * (e * i - f * h) - b * (y * i - f * z) + c * (y * h - e * z)) / det,
    (a * (y * i - f * z) - x * (d * i - f * g) + c * (d * z - y * g)) / det,
    (a * (e * z - y * h) - b * (d * z - y * g) + x * (d * h - e * g)) / det,
  ];
}

/** Самые сильные углы не ближе `apart` px друг к другу — чтобы точки не сбивались в кучу. */
export function spread(points: Pt[], max: number, apart: number): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    if (out.length >= max) break;
    if (out.every((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 >= apart * apart)) out.push(p);
  }
  return out;
}
