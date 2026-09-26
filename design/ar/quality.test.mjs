// Годится ли кадр в метку — на синтетике, где ответ известен заранее.
//   node --test design/ar/
import { test } from "node:test";
import assert from "node:assert/strict";
import { assess, DEFAULTS } from "./quality.js";

const N = 160;

/** Серое изображение 0..1 из функции (x, y) → яркость. */
function image(f, w = N, h = N) {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) data[y * w + x] = f(x, y);
  return { data, width: w, height: h };
}

/** Детерминированный шум: одинаковый при каждом прогоне. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** «Обложка»: случайные прямоугольники разной яркости — много углов по всему кадру. */
function busy(seed = 1) {
  const r = rng(seed);
  const rects = Array.from({ length: 90 }, () => [r() * N, r() * N, 4 + r() * 22, 4 + r() * 22, 0.1 + r() * 0.8]);
  return image((x, y) => {
    let v = 0.5;
    for (const [rx, ry, rw, rh, c] of rects) if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) v = c;
    return v;
  });
}

function blur(img, radius) {
  const { width: w, height: h } = img;
  let src = img.data;
  for (let pass = 0; pass < 3; pass += 1) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      let s = 0, n = 0;
      for (let d = -radius; d <= radius; d += 1) {
        const xx = x + (pass % 2 ? 0 : d), yy = y + (pass % 2 ? d : 0);
        if (xx >= 0 && xx < w && yy >= 0 && yy < h) { s += src[yy * w + xx]; n += 1; }
      }
      out[y * w + x] = s / n;
    }
    src = out;
  }
  return { data: src, width: w, height: h };
}

test("обложка с рисунком — годится", () => {
  const q = assess(busy());
  assert.equal(q.verdict, "ok", JSON.stringify({ ...q, points: q.points.length }));
  assert.ok(q.count >= DEFAULTS.enough * 0.5);
  assert.ok(q.coverage > 0.6);
});

test("однотонный стол — мало рисунка", () => {
  const q = assess(image(() => 0.42));
  assert.equal(q.verdict, "few");
  assert.equal(q.count, 0);
});

test("рисунок только в углу — мало рисунка", () => {
  const full = busy(3);
  const q = assess(image((x, y) => (x < 50 && y < 50 ? full.data[y * N + x] : 0.5)));
  assert.equal(q.verdict, "few");
  assert.ok(q.coverage < 0.3);
});

test("смазанный кадр — смазано", () => {
  const q = assess(blur(busy(), 4));
  assert.equal(q.verdict, "blur");
});

test("пересвет — блик", () => {
  const src = busy();
  const q = assess(image((x, y) => (x < 90 ? 1 : src.data[y * N + x])));
  assert.equal(q.verdict, "glare");
});

test("пороги можно подкрутить: заниженная планка пускает и угол", () => {
  const full = busy(3);
  const corner = image((x, y) => (x < 50 && y < 50 ? full.data[y * N + x] : 0.5));
  assert.equal(assess(corner, { okScore: 0.001 }).verdict, "ok");
});
