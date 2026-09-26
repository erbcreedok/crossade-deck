import { test } from "node:test";
import assert from "node:assert/strict";
import { createFusion, FUSE, gyroTrack, levelQ, qangle, qconj, qmul, rotate, slerp } from "./fuse.js";

const near = (a, b, eps = 1e-6, what = "") => assert.ok(Math.abs(a - b) < eps, `${what} ${a} ≈ ${b}`);
const nearV = (a, b, eps, what) => a.forEach((v, i) => near(v, b[i], eps, `${what}[${i}]`));
const axis = (x, y, z, deg) => { const h = (deg * Math.PI) / 360, n = Math.hypot(x, y, z); return [(x / n) * Math.sin(h), (y / n) * Math.sin(h), (z / n) * Math.sin(h), Math.cos(h)]; };

/** Телефон смотрит вниз-вперёд: наклон −60° от горизонта, курс `yaw`. */
const phone = (yaw = 0, pitch = -60) => qmul(axis(0, 1, 0, yaw), axis(1, 0, 0, pitch));
const TABLE = [0.4, -2, -1.5], TABLE_YAW = 0.3;
/** Что увидит трекер: метка в кадре камеры, стоящей в `at` с поворотом `q`. */
const seen = (q, at, table = TABLE, yaw = TABLE_YAW) => ({ t: rotate(qconj(q), table.map((v, i) => v - at[i])), m: qmul(qconj(q), levelQ(yaw)) });
/** Где стол на экране: в кадре показанной камеры. */
const onScreen = (f, q) => rotate(qconj(q), f.S.anchor.pos.map((v, i) => v - f.S.shown[i]));

test("первый кадр: якорь встаёт туда, где метка, с её поворотом; телефон — в нуле", () => {
  const f = createFusion();
  const q = phone(10);
  const { t, m } = seen(q, [0, 0, 0]);
  assert.equal(f.measure(q, t, m, 0), "lock");
  nearV(f.S.anchor.pos, TABLE, 1e-9, "якорь");
  near(qangle(f.S.anchor.q, levelQ(TABLE_YAW)), 0, 1e-6, "поворот");
  nearV(f.S.shown, [0, 0, 0], 1e-12, "телефон");
});

test("только поворот телефона: метка съехала в кадре, но телефон не сдвинулся — стол стоит", () => {
  const f = createFusion();
  let { t, m } = seen(phone(0), [0, 0, 0]);
  f.measure(phone(0), t, m, 0);
  for (let i = 1; i <= 30; i += 1) {
    const q = phone(i, -60 + i / 2);
    ({ t, m } = seen(q, [0, 0, 0]));
    assert.equal(f.measure(q, t, m, i * 66), "ok");
    f.frame(66);
  }
  nearV(f.S.shown, [0, 0, 0], 1e-9, "телефон");
});

test("шаг в сторону: телефон уходит туда, куда шагнул, а стол остаётся в мире", () => {
  const f = createFusion();
  const q = phone(0);
  let { t, m } = seen(q, [0, 0, 0]);
  f.measure(q, t, m, 0);
  const to = [0.8, 0, -0.3];
  for (let i = 1; i <= 60; i += 1) {
    const at = to.map((v) => v * Math.min(1, i / 20));
    ({ t, m } = seen(q, at));
    f.measure(q, t, m, i * 66);
    for (let k = 0; k < 4; k += 1) f.frame(16.5);
  }
  nearV(f.S.shown, to, 0.02, "телефон");
  nearV(f.S.anchor.pos, TABLE, 1e-9, "якорь");
});

test("дрожь трекера: стол на экране дрожит в разы меньше, чем метка в кадре", () => {
  const f = createFusion();
  const q = phone(0);
  let s = 3; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5);
  const { t: t0, m } = seen(q, [0, 0, 0]);
  f.measure(q, t0, m, 0);
  const raw = [], shown = [];
  for (let i = 1; i <= 200; i += 1) {
    const t = t0.map((v) => v + r() * 0.08); // ±0.04 ширины метки — как дрожит MindAR
    f.measure(q, t, m, i * 66);
    for (let k = 0; k < 4; k += 1) f.frame(16.5);
    if (i > 50) { raw.push(t[0]); shown.push(onScreen(f, q)[0]); }
  }
  const spread = (a) => Math.max(...a) - Math.min(...a);
  assert.ok(spread(shown) < spread(raw) / 3, `на экране ${spread(shown).toFixed(4)} при дрожи ${spread(raw).toFixed(4)}`);
});

test("один дикий кадр — выброс; то же место четыре кадра подряд — прошёл, пока метки не было", () => {
  const f = createFusion();
  const q = phone(0);
  let { t, m } = seen(q, [0, 0, 0]);
  f.measure(q, t, m, 0);
  ({ t, m } = seen(q, [3, 0, 0]));
  assert.equal(f.measure(q, t, m, 66), "held");
  ({ t, m } = seen(q, [0, 0, 0]));
  assert.equal(f.measure(q, t, m, 132), "ok");
  nearV(f.S.cam, [0, 0, 0], 1e-9, "выброс не сдвинул");
  const said = [];
  for (let i = 0; i < FUSE.jumpFrames; i += 1) { ({ t, m } = seen(q, [3, 0, 0])); said.push(f.measure(q, t, m, 200 + i * 66)); }
  assert.deepEqual(said, ["held", "held", "held", "jump"]);
  nearV(f.S.cam, [3, 0, 0], 1e-9, "принял");
});

/** Картина на стене перед тобой: нормаль смотрит на тебя (+Z мира), низ картины — вниз. */
const WALL = [0, 0, 0, 1];
const lookAhead = axis(1, 0, 0, 0); // телефон стоймя, смотрит вперёд (−Z)

test("картина на стене: якорь встаёт в её плоскость, а не плашмя", () => {
  const f = createFusion();
  const { t } = seen(lookAhead, [0, 0, 0], [0, 0, -3], 0);
  const wall = qmul(qconj(lookAhead), WALL);
  assert.equal(f.measure(lookAhead, t, wall, 0), "lock");
  const n = rotate(f.S.anchor.q, [0, 0, 1]);
  nearV(n, [0, 0, 1], 1e-9, "нормаль стола смотрит на меня");
});

test("картина на стене, «плашмя»: якорь лёжа по гравитации, курс — вдоль картины", () => {
  const f = createFusion(() => ({ ...FUSE, flat: true }));
  const { t } = seen(lookAhead, [0, 0, 0], [0, 0, -3], 0);
  f.measure(lookAhead, t, qmul(qconj(lookAhead), WALL), 0);
  nearV(rotate(f.S.anchor.q, [0, 0, 1]), [0, 1, 0], 1e-9, "нормаль вверх");
  nearV(rotate(f.S.anchor.q, [1, 0, 0]), [1, 0, 0], 1e-9, "ось X — вдоль картины");
});

test("метка вдруг повёрнута на 60° — выброс; четыре кадра подряд — метку переложили", () => {
  const f = createFusion();
  const q = phone(0);
  const { t, m } = seen(q, [0, 0, 0]);
  f.measure(q, t, m, 0);
  const turned = qmul(m, axis(1, 0, 0, 60));
  const said = [];
  for (let i = 1; i <= FUSE.jumpFrames; i += 1) said.push(f.measure(q, t, turned, i * 66));
  assert.deepEqual(said, ["held", "held", "held", "jump"]);
  near(qangle(f.S.anchor.q, qmul(q, turned)), 0, 1e-6, "якорь по свежей метке");
  nearV(f.S.cam, [0, 0, 0], 1e-9, "телефон на месте");
});

test("гироскоп уплыл по курсу на 8° — якорь догоняет метку", () => {
  const f = createFusion();
  let { t, m } = seen(phone(0), [0, 0, 0]);
  f.measure(phone(0), t, m, 0);
  const drift = axis(0, 1, 0, 8);
  for (let i = 1; i <= 120; i += 1) {
    const truth = phone(0);
    ({ t, m } = seen(truth, [0, 0, 0]));
    f.measure(qmul(drift, truth), t, m, i * 66);
  }
  near(qangle(f.S.anchor.q, qmul(drift, levelQ(TABLE_YAW))), 0, 0.01, "поворот");
});

test("память гироскопа: поворот в прошлом — между замерами, раньше первого — первый", () => {
  const g = gyroTrack();
  const a = phone(0), b = phone(20);
  g.push(100, a); g.push(200, b);
  nearV(g.at(50), a, 1e-12, "до первого");
  nearV(g.at(150), slerp(a, b, 0.5), 1e-12, "середина");
  nearV(g.at(999), b, 1e-12, "после последнего");
  const old = gyroTrack(1000);
  for (let t = 0; t <= 5000; t += 16) old.push(t, a);
  assert.ok(old.size < 70, `держит только последнюю секунду: ${old.size}`);
});

test("кадр трекера из прошлого: с поворотом того мига стол стоит, с нынешним — уезжает", () => {
  const run = (late) => {
    const f = createFusion();
    const g = gyroTrack();
    let { t, m } = seen(phone(0), [0, 0, 0]);
    f.measure(phone(0), t, m, 0);
    for (let i = 1; i <= 40; i += 1) {
      const now = i * 66, then = now - 80, q = (ms) => phone(ms / 20); // крутится 50°/с
      g.push(then, q(then)); g.push(now, q(now));
      ({ t, m } = seen(q(then), [0, 0, 0]));
      f.measure(late ? g.at(then) : g.at(now), t, m, now);
      f.frame(66);
    }
    return Math.hypot(...f.S.shown);
  };
  assert.ok(run(true) < 1e-6, "поворот того мига");
  assert.ok(run(false) > 0.05, `нынешний поворот уводит телефон на ${run(false).toFixed(2)}`);
});

test("метка врёт в наклоне на 10° — стол не наклоняется; врёт в курсе — курс подтягивается", () => {
  const f = createFusion();
  const q = phone(0);
  const { t, m } = seen(q, [0, 0, 0]);
  for (let i = 0; i < FUSE.settle; i += 1) f.measure(q, t, m, i * 66);
  const tilted = qmul(m, axis(1, 0, 0, 10));
  for (let i = 0; i < 200; i += 1) f.measure(q, t, tilted, 2000 + i * 66);
  near(qangle(f.S.anchor.q, levelQ(TABLE_YAW)), 0, 1e-6, "наклон не пошёл");
  const turned = qmul(qconj(q), qmul(axis(0, 1, 0, 10), levelQ(TABLE_YAW)));
  for (let i = 0; i < 200; i += 1) f.measure(q, t, turned, 20000 + i * 66);
  near(qangle(f.S.anchor.q, qmul(axis(0, 1, 0, 10), levelQ(TABLE_YAW))), 0, 0.005, "курс догнал");
});
