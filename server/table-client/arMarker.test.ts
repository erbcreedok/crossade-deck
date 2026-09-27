// ПОЗА МЕТКИ ИЗ МАТРИЦЫ ТРЕКЕРА — середина метки в её ширинах и её поворот.

import { describe, expect, it } from "vitest";
import { poseOf, quatOf } from "./arMarker.js";
import type { Quat } from "./arFuse.js";

type Vec = [number, number, number];
const rot = ([qx, qy, qz, qw]: Quat, [x, y, z]: Vec): Vec => {
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
};
const axis = (x: number, y: number, z: number, deg: number): Quat => { const h = (deg * Math.PI) / 360, n = Math.hypot(x, y, z); return [(x / n) * Math.sin(h), (y / n) * Math.sin(h), (z / n) * Math.sin(h), Math.cos(h)]; };
const same = (a: Quat, b: Quat): number => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);

describe("ar-marker.pose", () => {
  it("матрица трекера в пикселях снимка → середина метки в её ширинах и её поворот", () => {
    const q = axis(1, 2, -0.5, 40), t: Vec = [0.3, -0.2, -4], w = 480, h = 360;
    const [c0, c1, c2] = [rot(q, [1, 0, 0]), rot(q, [0, 1, 0]), rot(q, [0, 0, 1])];
    // Угол снимка (0, 0) в начале координат метки: середина — (w/2, h/2).
    const mid = [0, 1, 2].map((r) => c0[r]! * (w / 2) + c1[r]! * (h / 2)) as Vec;
    const T = t.map((v, r) => v * w - mid[r]!);
    const m = [...c0, 0, ...c1, 0, ...c2, 0, ...T, 1];
    const pose = poseOf(m, [w, h]);
    pose.t.forEach((v, i) => expect(v).toBeCloseTo(t[i]!, 9));
    expect(same(pose.q, q)).toBeCloseTo(1, 9);
  });

  it("кватернион из матрицы — на всех ветках (след больше нуля и каждая ось крупнейшая)", () => {
    for (const q of [axis(0, 0, 1, 10), axis(1, 0, 0, 170), axis(0, 1, 0, 170), axis(0, 0, 1, 170), axis(1, 1, 1, 200)]) {
      const got = quatOf(rot(q, [1, 0, 0]), rot(q, [0, 1, 0]), rot(q, [0, 0, 1]));
      expect(same(got, q)).toBeCloseTo(1, 9);
    }
  });
});
