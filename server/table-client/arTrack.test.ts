// СЛЕЖЕНИЕ ЗА ПОЛОМ — точки ведутся кадр за кадром, глаз находится по лучам; на синтетике, где ответ известен.

import { describe, expect, it } from "vitest";
import { eyeFrom, follow, onPlane, pyramid, rayOf, rotate, spread, type Grey, type Lens, type Quat } from "./arTrack.js";

type Vec = [number, number, number];
const W = 144, H = 256;

/**
 * Гладкий «пол» с рисунком РАЗНОГО масштаба, как у настоящего (доски, узор скатерти, пятна): крупные
 * волны держат грубые ступени пирамиды, мелкие — точность. Узор одного мелкого шага на грубой ступени
 * сливается в кашу, и большой сдвиг по нему не найти никому.
 */
const floor = (x: number, y: number): number =>
  0.5 + 0.16 * Math.sin(x * 0.045 + Math.cos(y * 0.03) * 2) + 0.14 * Math.sin(y * 0.06 + x * 0.02)
  + 0.08 * Math.sin(x * 0.17 + y * 0.05) + 0.06 * Math.sin(y * 0.23 - x * 0.07) + 0.04 * Math.sin((x + y) * 0.41);
const frame = (dx: number, dy: number): Grey => {
  const data = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) data[y * W + x] = floor(x - dx, y - dy);
  return { data, width: W, height: H };
};

describe("ar-track.follow", () => {
  it("кадр сдвинулся на (3.4, −2.1) px — точки нашлись там же, с точностью до сотых пикселя", () => {
    const a = pyramid(frame(0, 0), 3), b = pyramid(frame(3.4, -2.1), 3);
    const pts = [{ x: 40, y: 60 }, { x: 90, y: 130 }, { x: 70, y: 200 }];
    const got = follow(a, b, pts);
    got.forEach((q, i) => {
      expect(q).not.toBeNull();
      expect(q!.x - pts[i]!.x).toBeCloseTo(3.4, 1);
      expect(q!.y - pts[i]!.y).toBeCloseTo(-2.1, 1);
    });
  });

  it("большой шаг в 12 px берут грубые ступени пирамиды", () => {
    const got = follow(pyramid(frame(0, 0), 3), pyramid(frame(12, 7), 3), [{ x: 60, y: 110 }]);
    expect(got[0]!.x).toBeCloseTo(72, 0);
    expect(got[0]!.y).toBeCloseTo(117, 0);
  });

  it("точка ушла за край кадра или окно не совпало — потеряна, а не выдумана", () => {
    const edge = follow(pyramid(frame(0, 0), 3), pyramid(frame(-20, 0), 3), [{ x: 8, y: 100 }]);
    expect(edge[0]).toBeNull();
    const flat: Grey = { data: new Float32Array(W * H).fill(0.5), width: W, height: H };
    expect(follow(pyramid(flat, 3), pyramid(flat, 3), [{ x: 70, y: 120 }])[0], "однотонный пол — не за что держаться").toBeNull();
  });

  it("точки расходятся не ближе заданного — не сбиваются в кучу", () => {
    const got = spread([{ x: 10, y: 10 }, { x: 12, y: 11 }, { x: 40, y: 10 }, { x: 41, y: 12 }, { x: 80, y: 80 }], 10, 8);
    expect(got).toEqual([{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 80, y: 80 }]);
  });
});

describe("ar-track.eye", () => {
  const lens: Lens = { width: W, height: H, fov: 62 };
  const axis = (x: number, y: number, z: number, deg: number): Quat => { const h = (deg * Math.PI) / 360, n = Math.hypot(x, y, z); return [(x / n) * Math.sin(h), (y / n) * Math.sin(h), (z / n) * Math.sin(h), Math.cos(h)]; };
  const PLANE: Vec = [0, -0.35, 0], UP: Vec = [0, 1, 0];
  /** Точка мира → пиксель кадра (обратное к `rayOf`). */
  const pixel = (q: Quat, eye: Vec, X: Vec) => {
    const [qx, qy, qz, qw] = q;
    const c = rotate([-qx, -qy, -qz, qw], [X[0] - eye[0], X[1] - eye[1], X[2] - eye[2]]);
    const f = H / 2 / Math.tan((62 * Math.PI) / 360);
    return { x: W / 2 + (f * c[0]) / -c[2], y: H / 2 - (f * c[1]) / -c[2] };
  };

  it("шагнул и повернулся: глаз по лучам совпал с настоящим, поворот — от гироскопа", () => {
    const q0 = axis(1, 0, 0, -70), eye0: Vec = [0, 0, 0];
    const seeds = [{ x: 30, y: 80 }, { x: 110, y: 90 }, { x: 70, y: 150 }, { x: 25, y: 220 }, { x: 120, y: 230 }, { x: 72, y: 40 }];
    const X = seeds.map((p) => onPlane(eye0, rayOf(lens, q0, p), PLANE, UP)!);
    const eye1: Vec = [0.08, 0.03, -0.12], q1 = axis(0, 1, 0, 9);
    const turn: Quat = [
      q1[3] * q0[0] + q1[0] * q0[3] + q1[1] * q0[2] - q1[2] * q0[1],
      q1[3] * q0[1] - q1[0] * q0[2] + q1[1] * q0[3] + q1[2] * q0[0],
      q1[3] * q0[2] + q1[0] * q0[1] - q1[1] * q0[0] + q1[2] * q0[3],
      q1[3] * q0[3] - q1[0] * q0[0] - q1[1] * q0[1] - q1[2] * q0[2],
    ];
    const d = X.map((x) => rayOf(lens, turn, pixel(turn, eye1, x)));
    const { eye } = eyeFrom(X, d, eye0);
    eye.forEach((v, i) => expect(v).toBeCloseTo(eye1[i]!, 6));
  });

  it("треть точек сбилась — глаз всё равно верный: сбившиеся гасятся весами", () => {
    const q0 = axis(1, 0, 0, -80), eye0: Vec = [0, 0, 0];
    const seeds = Array.from({ length: 30 }, (_, i) => ({ x: 12 + ((i * 37) % 120), y: 20 + ((i * 53) % 220) }));
    const X = seeds.map((p) => onPlane(eye0, rayOf(lens, q0, p), PLANE, UP)).filter((x): x is Vec => x !== null);
    const eye1: Vec = [-0.05, 0, 0.1];
    const d = X.map((x, i) => {
      const p = pixel(q0, eye1, x);
      return rayOf(lens, q0, i % 3 === 0 ? { x: p.x + 9, y: p.y - 7 } : p);
    });
    const { eye, miss } = eyeFrom(X, d, eye0, 8);
    eye.forEach((v, i) => expect(Math.abs(v - eye1[i]!)).toBeLessThan(0.006));
    expect(miss.filter((m, i) => i % 3 === 0 && m > 0.01).length, "сбившиеся видны по невязке").toBeGreaterThan(5);
  });

  it("луч мимо плоскости или дальше предела — места нет", () => {
    expect(onPlane([0, 0, 0], [0, 1, 0], PLANE, UP)).toBeNull();
    expect(onPlane([0, 0, 0], [0, -0.01, -1], PLANE, UP, 4)).toBeNull();
  });
});
