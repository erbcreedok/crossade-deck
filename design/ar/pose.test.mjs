import { test } from "node:test";
import assert from "node:assert/strict";
import { centred, coverFit, deviceQuaternion, focalPx, positMatrix, screenFov } from "./pose.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

/** Точка через column-major матрицу. */
const apply = (e, [x, y, z]) => [0, 1, 2].map((r) => e[r] * x + e[4 + r] * y + e[8 + r] * z + e[12 + r]);

test("cover: портретное видео в портретный экран срезает бока, а не верх", () => {
  const f = coverFit(720, 1280, 390, 844);
  near(f.h, 844); assert.ok(f.w > 390); near(f.top, 0); assert.ok(f.left < 0);
});

test("обзор: срезанные бока не меняют вертикаль, срезанный верх её сужает", () => {
  const f = coverFit(720, 1280, 390, 844);
  near(screenFov(1280, f, 844), 45);
  const g = coverFit(1280, 720, 390, 844); // ландшафтное видео в портрет — высота совпала, обзор тот же
  near(screenFov(720, g, 844), 45);
  const k = coverFit(720, 1280, 600, 600); // квадратный экран режет верх и низ
  assert.ok(screenFov(1280, k, 600) < 45);
});

test("метка прямо перед камерой: POSIT без поворота на 5 — в three на z = −5, углы на своих местах", () => {
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const e = positMatrix(I, [0, 0, 5]);
  const [x, y, z] = apply(e, [-0.5, 0.5, 0]);
  near(x, -0.5); near(y, 0.5); near(z, -5); // левый верхний угол слева-сверху, перед камерой
  const [nx, ny, nz] = apply(e, [0, 0, 1]).map((v, i) => v - [0, 0, -5][i]);
  near(nx, 0); near(ny, 0); near(nz, 1); // нормаль метки смотрит на камеру
});

test("поворот POSIT остаётся поворотом (без отражения)", () => {
  const a = 0.4, c = Math.cos(a), s = Math.sin(a);
  const R = [[1, 0, 0], [0, c, -s], [0, s, c]];
  const e = positMatrix(R, [0.1, -0.2, 3]);
  const m = [[e[0], e[4], e[8]], [e[1], e[5], e[9]], [e[2], e[6], e[10]]];
  const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  near(det, 1);
});

test("проекция сходится: угол метки из POSIT ложится туда, где его увидел детектор", () => {
  // Метка ширины 1 на расстоянии 4, кадр 640×480. Детектор видел бы углы в pixel = f·X/Z.
  const W = 640, H = 480, f = focalPx(H), Z = 4;
  const px = ([X, Y]) => ({ x: W / 2 + (f * X) / Z, y: H / 2 - (f * Y) / Z });
  const seen = [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]].map(px);
  const c = centred(seen, W, H);
  near(c[0].x, (-0.5 * f) / Z); near(c[0].y, (0.5 * f) / Z);
});

test("телефон лёжа экраном вверх: камера смотрит вниз", () => {
  const [x, y, z, w] = deviceQuaternion(0, 0, 0, 0);
  // −Z камеры, повёрнутый кватернионом, должен смотреть в −Y мира
  const v = [0, 0, -1];
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  const out = [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
  near(out[0], 0); near(out[1], -1); near(out[2], 0);
});
