// AR-ЛИНЗА — стол, который держит телефон, а не палец.
//
// Та же `Lens`, что строит камера кита (`lens.ts`): экран рисует и ловит палец только через неё, поэтому
// всё — сукно, карты, стулья, тултипы, бросок — работает в AR без единой своей строчки. Отличие одно:
// откуда перспектива. Здесь это настоящая камера-обскура в мире телефона:
//
//   мир        — метры, Y вверх; глаз (телефон) в нуле, его поворот — кватернион датчика;
//   стол       — плоскость ниже глаза: середина в `place.at`, «ко мне» по направлению `place.yaw`;
//   единица    — ширина карты, `place.unit` метров (щипок её растит: `zoom`);
//   поворот    — `turn`, те же градусы, что `Camera.rotation`: свой стул — ближе всех ко мне.
//
// Чистая математика, без браузера: `arLens.test.ts`.

import type { Transform } from "../../game-kit/src/core/transform.js";
import type { Lens } from "./lens.js";

type Point = { x: number; y: number };
type Vec = [number, number, number];
export type Quat = [number, number, number, number];

export interface ArPlace {
  /** Середина стола в мире, метры. */
  at: Vec;
  /** Куда смотрел телефон, когда стол ставили, радианы: «от меня» = (−sin, 0, −cos). */
  yaw: number;
  /** Метров в единице стола (ширине карты). */
  unit: number;
}

export interface ArView {
  /** Поворот телефона в мире (камера → мир), камера смотрит в −Z, верх экрана — +Y. */
  q: Quat;
  /** Вертикальный обзор экрана, градусы. */
  fov: number;
}

export interface ArLens extends Lens {
  /** Точка стола → стекло, или `null`, если она за спиной (для сетки пола: отрезок за глазом не рисуется). */
  project(p: Point, height?: number): Point | null;
  /** Для `FeltScene`: взгляд у середины стола одной аффинной матрицей, масштаб, поворот, сжатие, наклон. */
  view: Transform;
  k: number;
  rotation: number;
  squash: number;
  rise: number;
}

/** Потолок наклона для высоты стопок — тот же, что у пальцевой камеры (`camera.ts`). */
const MAX_LEAN = 60;
const NEAR = 0.02;

export function arLens(eye: ArView, place: ArPlace, turn: number, zoom: number, frame: { w: number; h: number }): ArLens {
  const cx = frame.w / 2, cy = frame.h / 2;
  const f = cy / Math.tan(((eye.fov / 2) * Math.PI) / 180);
  const u = place.unit * zoom;
  const t = (turn * Math.PI) / 180;
  const cosT = Math.cos(t), sinT = Math.sin(t);
  const right: Vec = [Math.cos(place.yaw), 0, -Math.sin(place.yaw)];
  const toMe: Vec = [Math.sin(place.yaw), 0, Math.cos(place.yaw)];
  const inv = conj(eye.q);

  /** Точка стола → мир. Поворот `turn` — как `rotate()` кита: x' = cos·x − sin·y, y' = sin·x + cos·y. */
  const world = (p: Point, height = 0): Vec => {
    const x = cosT * p.x - sinT * p.y, y = sinT * p.x + cosT * p.y;
    return [
      place.at[0] + u * (x * right[0] + y * toMe[0]),
      place.at[1] + u * height,
      place.at[2] + u * (x * right[2] + y * toMe[2]),
    ];
  };
  const project = (p: Point, height = 0): Point | null => {
    const [x, y, z] = rot(inv, world(p, height));
    if (z > -NEAR) return null;
    return { x: cx + (f * x) / -z, y: cy - (f * y) / -z };
  };
  // За спиной точке честного места на стекле нет; жест её туда и не приведёт, а рисовать сукно
  // нужно — поэтому она прижимается к ближней плоскости, а не пропадает.
  const toGlass = (p: Point, height = 0): Point => {
    const got = project(p, height);
    if (got) return got;
    const [x, y] = rot(inv, world(p, height));
    return { x: cx + (f * x) / NEAR, y: cy - (f * y) / NEAR };
  };
  const toDesk = (q: Point): Point => {
    let d = rot(eye.q, [(q.x - cx) / f, -(q.y - cy) / f, -1]);
    // Взгляд выше горизонта до стола не дотянется — берётся точка далеко впереди по тому же курсу.
    if (d[1] > -1e-3) d = [d[0], -1e-3, d[2]];
    const s = place.at[1] / d[1];
    const hit: Vec = [d[0] * s - place.at[0], 0, d[2] * s - place.at[2]];
    const x = (hit[0] * right[0] + hit[2] * right[2]) / u, y = (hit[0] * toMe[0] + hit[2] * toMe[2]) / u;
    return { x: cosT * x + sinT * y, y: -sinT * x + cosT * y };
  };
  const near = (p: Point): Transform => {
    const e = 0.05;
    const o = toGlass(p), dx = toGlass({ x: p.x + e, y: p.y }), dy = toGlass({ x: p.x, y: p.y + e });
    const a = (dx.x - o.x) / e, b = (dx.y - o.y) / e, c = (dy.x - o.x) / e, d = (dy.y - o.y) / e;
    return { a, b, c, d, e: o.x - a * p.x - c * p.y, f: o.y - b * p.x - d * p.y };
  };
  const kAt = (p: Point): number => {
    const m = near(p);
    return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  };

  const view = near({ x: 0, y: 0 });
  const { a, b, c, d } = view;
  // Сжатие — отношение меньшего растяжения к большему (сингулярные числа 2×2).
  const s1 = a * a + b * b + c * c + d * d, s2 = Math.sqrt(Math.max(0, (a * a + b * b - c * c - d * d) ** 2 + 4 * (a * c + b * d) ** 2));
  const big = Math.sqrt((s1 + s2) / 2), small = Math.sqrt(Math.max(0, (s1 - s2) / 2));
  // Наклон — угол между взглядом и вертикалью вниз: сверху 0, «лёг» к горизонту — больше.
  const look = rot(eye.q, [0, 0, -1]);
  const lean = (Math.acos(Math.min(1, Math.max(-1, -look[1]))) * 180) / Math.PI;
  return {
    toGlass, toDesk, near, kAt, project, view,
    k: kAt({ x: 0, y: 0 }),
    rotation: (Math.atan2(b, a) * 180) / Math.PI,
    squash: big > 0 ? small / big : 1,
    rise: Math.min(1, lean / MAX_LEAN),
  };
}

/**
 * КУДА ПОСТАВИТЬ СТОЛ: туда, где взгляд упирается в высоту стола (`drop` метров ниже глаза). Смотрит
 * почти в горизонт — стол встаёт на `ahead` метров вперёд по курсу.
 */
export function placeAtGaze(q: Quat, drop: number, ahead: number, unit: number): ArPlace {
  const f = rot(q, [0, 0, -1]);
  // КУРС — по взгляду И по верху экрана вместе: телефон, положенный экраном вверх, смотрит вертикально
  // вниз, и курс взгляда не определён (atan2(−0, −0) = −π — стол разворачивался задом). Верх экрана в
  // этот миг и есть «вперёд»; у горизонта он вертикален и в сумму не вносит ничего.
  const up = rot(q, [0, 1, 0]);
  const yaw = Math.atan2(-(f[0] + up[0]), -(f[2] + up[2]));
  const flat = Math.hypot(f[0], f[2]);
  const dist = f[1] < -0.1 ? Math.min(3, Math.max(0.15, (drop / -f[1]) * flat)) : ahead;
  return { at: [-Math.sin(yaw) * dist, -drop, -Math.cos(yaw) * dist], yaw, unit };
}

/** Кватернион камеры из deviceorientation (градусы) и угла экрана — как в three DeviceOrientationControls. */
export function deviceQuat(alpha: number, beta: number, gamma: number, screenAngle: number): Quat {
  const r = Math.PI / 180;
  const x = beta * r, y = alpha * r, z = -gamma * r;
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  // Эйлер 'YXZ'
  let q: Quat = [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3];
  q = mul(q, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]); // камера смотрит из спины телефона, а не из макушки
  const o = (-screenAngle * r) / 2;
  return mul(q, [0, 0, Math.sin(o), Math.cos(o)]);
}

function mul([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat {
  return [ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz];
}
const conj = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w];
/** Вектор, повёрнутый кватернионом. */
function rot([qx, qy, qz, qw]: Quat, [x, y, z]: Vec): Vec {
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
}
