// AR-ЛИНЗА — стол, который держит телефон, а не палец.
//
// Та же `Lens`, что строит камера кита (`lens.ts`): экран рисует и ловит палец только через неё, поэтому
// всё — сукно, карты, стулья, тултипы, бросок — работает в AR без единой своей строчки. Отличие одно:
// откуда перспектива. Здесь это настоящая камера-обскура в мире телефона:
//
//   мир        — метры, Y вверх; глаз (телефон) в `eye.pos` (ноль — место у своего стула, откуда
//                стол ставили; джойстик его двигает, `arWalk.ts`), его поворот — кватернион датчика;
//   стол       — плоскость: середина в `place.at`, «ко мне» по направлению `place.yaw`. Обычно она
//                лежит ниже глаза; с `place.q` — как угодно: на стене, под наклоном (якорь — картина);
//   единица    — ширина карты, `place.unit` метров (щипок её растит: `zoom`);
//   поворот    — `turn`, те же градусы, что `Camera.rotation`: свой стул — ближе всех ко мне.
//
// Чистая математика, без браузера: `arLens.test.ts`.

import type { Transform } from "../../game-kit/src/core/transform.js";
import type { Lens } from "./lens.js";

type Point = { x: number; y: number };
type Point3 = Point & { h: number };
export type Vec = [number, number, number];
export type Quat = [number, number, number, number];

export interface ArPlace {
  /** Середина стола в мире, метры. */
  at: Vec;
  /** Куда смотрел телефон, когда стол ставили, радианы: «от меня» = (−sin, 0, −cos). */
  yaw: number;
  /** Метров в единице стола (ширине карты). */
  unit: number;
  /**
   * Поворот стола в мире: X — вправо, Y — нормаль (над сукном), Z — «ко мне». Нет — стол лежит,
   * повёрнутый на `yaw` (это то же, что поворот на `yaw` вокруг вертикали).
   */
  q?: Quat;
}

export interface ArView {
  /** Поворот телефона в мире (камера → мир), камера смотрит в −Z, верх экрана — +Y. */
  q: Quat;
  /** Вертикальный обзор экрана, градусы. */
  fov: number;
  /** Где глаз, метры; нет — в нуле. */
  pos?: Vec;
}

export interface ArLens extends Lens {
  /** Точка стола → стекло, или `null`, если она за спиной (для сетки пола: отрезок за глазом не рисуется). */
  project(p: Point, height?: number): Point | null;
  /** Точка стола → мир, метры: хват за сукно двигает глаз на разницу двух таких точек. */
  toWorld(p: Point): Vec;
  /** Для `FeltScene`: взгляд у середины стола одной аффинной матрицей, масштаб, поворот, сжатие, наклон. */
  view: Transform;
  k: number;
  rotation: number;
  squash: number;
  rise: number;
  /** ГДЕ САМ ТЕЛЕФОН — точка стола под ним и высота над сукном, в единицах стола: в AR голова — это он. */
  eye: Point3;
}

/** Потолок наклона для высоты стопок — тот же, что у пальцевой камеры (`camera.ts`). */
const MAX_LEAN = 60;
const NEAR = 0.02;
/** Ближе этого к глазу (метры) тело не рисуется: за спиной или вплотную. */
const AHEAD_M = 0.05;

export function arLens(eye: ArView, place: ArPlace, turn: number, zoom: number, frame: { w: number; h: number }): ArLens {
  const cx = frame.w / 2, cy = frame.h / 2;
  const f = cy / Math.tan(((eye.fov / 2) * Math.PI) / 180);
  const u = place.unit * zoom;
  const t = (turn * Math.PI) / 180;
  const cosT = Math.cos(t), sinT = Math.sin(t);
  const tq = place.q ?? yawQuat(place.yaw);
  const right = rot(tq, [1, 0, 0]), up = rot(tq, [0, 1, 0]), toMe = rot(tq, [0, 0, 1]);
  const inv = conj(eye.q);
  const [ex, ey, ez] = eye.pos ?? [0, 0, 0];
  /** Глаз над сукном (+) или под ним (−): у стола на стене «над» — это перед картиной. */
  const side = dot([ex - place.at[0], ey - place.at[1], ez - place.at[2]], up) >= 0 ? 1 : -1;
  /** Мир → камера: сперва от глаза, потом поворот глаза. */
  const seen = (w: Vec): Vec => rot(inv, [w[0] - ex, w[1] - ey, w[2] - ez]);

  /** Точка стола → мир. Поворот `turn` — как `rotate()` кита: x' = cos·x − sin·y, y' = sin·x + cos·y. */
  const world = (p: Point, height = 0): Vec => {
    const x = cosT * p.x - sinT * p.y, y = sinT * p.x + cosT * p.y;
    return [0, 1, 2].map((i) => place.at[i]! + u * (x * right[i]! + y * toMe[i]! + height * up[i]!)) as Vec;
  };
  const project = (p: Point, height = 0): Point | null => {
    const [x, y, z] = seen(world(p, height));
    if (z > -NEAR) return null;
    return { x: cx + (f * x) / -z, y: cy - (f * y) / -z };
  };
  // За спиной точке честного места на стекле нет; жест её туда и не приведёт, а рисовать сукно
  // нужно — поэтому она прижимается к ближней плоскости, а не пропадает.
  const toGlass = (p: Point, height = 0): Point => {
    const got = project(p, height);
    if (got) return got;
    const [x, y] = seen(world(p, height));
    return { x: cx + (f * x) / NEAR, y: cy - (f * y) / NEAR };
  };
  const toDesk = (q: Point): Point => {
    let d = rot(eye.q, [(q.x - cx) / f, -(q.y - cy) / f, -1]);
    // Взгляд мимо плоскости стола (выше горизонта у лежащего) до неё не дотянется — берётся точка
    // далеко впереди по тому же курсу: к сукну взгляд прижимается на волосок.
    const along = dot(d, up) * side;
    if (along > -1e-3) d = [0, 1, 2].map((i) => d[i]! - up[i]! * side * (along + 1e-3)) as Vec;
    const s = dot([place.at[0] - ex, place.at[1] - ey, place.at[2] - ez], up) / dot(d, up);
    const hit: Vec = [ex + d[0] * s - place.at[0], ey + d[1] * s - place.at[1], ez + d[2] * s - place.at[2]];
    const x = dot(hit, right) / u, y = dot(hit, toMe) / u;
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
  // Наклон — угол между взглядом и нормалью стола «в сукно»: в упор 0, вдоль стола — больше.
  const look = rot(eye.q, [0, 0, -1]);
  const lean = (Math.acos(Math.min(1, Math.max(-1, -dot(look, up) * side))) * 180) / Math.PI;
  const fromAt: Vec = [ex - place.at[0], ey - place.at[1], ez - place.at[2]];
  const ox = dot(fromAt, right) / u, oy = dot(fromAt, toMe) / u;
  const eyeAt: Point3 = { x: cosT * ox + sinT * oy, y: -sinT * ox + cosT * oy, h: (dot(fromAt, up) * side) / u };
  return {
    toGlass, toDesk, near, kAt, project, view, toWorld: (p) => world(p), eye: eyeAt,
    // Перед глазом и не вплотную (метры): ближе — раздувается на весь экран.
    ahead: (p, height = 0) => -seen(world(p, height))[2] > AHEAD_M,
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

/** Поворот на `yaw` вокруг вертикали: стол лёжа, «ко мне» — (sin, 0, cos). */
export function yawQuat(yaw: number): Quat {
  return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
}

const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function mul([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat {
  return [ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz];
}
const conj = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w];
/** Вектор, повёрнутый кватернионом. */
function rot([qx, qy, qz, qw]: Quat, [x, y, z]: Vec): Vec {
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
}
