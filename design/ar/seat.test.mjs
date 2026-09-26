import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTwo, clampSeat, planeHit, readSeat, SEAT0, seatLocal, twoFinger, writeSeat } from "./seat.js";

const near = (a, b, eps = 1e-9, what = "") => assert.ok(Math.abs(a - b) < eps, `${what} ${a} ≈ ${b}`);
const apply = (e, [x, y, z]) => [0, 1, 2].map((r) => e[r] * x + e[4 + r] * y + e[8 + r] * z + e[12 + r]);

test("посадка по умолчанию — стол ровно на якоре", () => {
  seatLocal(SEAT0).forEach((v, i) => near(v, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][i], 1e-12, `[${i}]`));
});

test("курс 90° — правый край стола уходит вверх по якорю; сдвиг и масштаб — как заданы", () => {
  const e = seatLocal({ ...SEAT0, yaw: 90, x: 2, y: -1, scale: 3 });
  const p = apply(e, [1, 0, 0]);
  near(p[0], 2, 1e-9, "x"); near(p[1], 2, 1e-9, "y"); near(p[2], 0, 1e-9, "z");
});

test("наклон +30° — верхний край стола выходит из плоскости к тебе, нижний — от тебя", () => {
  const e = seatLocal({ ...SEAT0, tilt: 30 });
  const top = apply(e, [0, 1, 0]), bottom = apply(e, [0, -1, 0]);
  near(top[2], 0.5, 1e-9, "верх"); near(bottom[2], -0.5, 1e-9, "низ");
  near(top[1], Math.cos(Math.PI / 6), 1e-9, "верх по высоте");
});

test("два пальца: поворот, разлёт и подъём середины читаются раздельно", () => {
  const g = twoFinger({ x: 100, y: 400 }, { x: 300, y: 400 }, { x: 100, y: 300 }, { x: 300, y: 300 });
  near(g.turn, 0); near(g.ratio, 1); near(g.dy, -100);
  const t = twoFinger({ x: 100, y: 400 }, { x: 300, y: 400 }, { x: 200, y: 300 }, { x: 200, y: 500 });
  near(t.turn, Math.PI / 2, 1e-9, "по часовой на экране — плюс");
  const p = twoFinger({ x: 150, y: 400 }, { x: 250, y: 400 }, { x: 100, y: 400 }, { x: 300, y: 400 });
  near(p.ratio, 2, 1e-9, "развёл вдвое");
});

test("жест → посадка: по часовой лицом к столу — курс минус; вверх — наклон от себя; разлёт — крупнее", () => {
  const s = applyTwo(SEAT0, { turn: Math.PI / 6, ratio: 1.5, dy: -100 }, true, 0.3);
  near(s.yaw, -30, 1e-9, "курс"); near(s.scale, 1.5, 1e-9, "масштаб"); near(s.tilt, -30, 1e-9, "наклон");
  near(applyTwo(SEAT0, { turn: Math.PI / 6, ratio: 1, dy: 0 }, false).yaw, 30, 1e-9, "стол спиной к камере — наоборот");
});

test("пределы: наклон не дальше 85°, масштаб 0.2..10, курс в −180..180", () => {
  const s = clampSeat({ ...SEAT0, tilt: 120, scale: 50, yaw: 270 });
  assert.equal(s.tilt, 85); assert.equal(s.scale, 10); near(s.yaw, -90);
  assert.equal(clampSeat({ ...SEAT0, scale: 0.01 }).scale, 0.2);
});

test("луч в плоскость якоря: камера над якорем смотрит вниз — точка под ней", () => {
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const hit = planeHit(I, [0.3, -0.2, 5], [0, 0, -1]);
  near(hit[0], 0.3); near(hit[1], -0.2);
  assert.equal(planeHit(I, [0, 0, 5], [0, 0, 1]), null, "луч от плоскости");
  const moved = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]; // обратная к «якорь в 0.5 масштаба»
  near(planeHit(moved, [1, 1, 3], [0, 0, -1])[0], 2, 1e-9, "в единицах якоря");
});

test("память: посадка своя у каждого якоря, битая память — посадка по умолчанию", () => {
  const box = new Map();
  const storage = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, v) };
  writeSeat(storage, "img:a", { ...SEAT0, yaw: 40, flat: true });
  assert.deepEqual(readSeat(storage, "img:a"), { ...SEAT0, yaw: 40, flat: true });
  assert.deepEqual(readSeat(storage, "img:b"), SEAT0);
  box.set("ar-stand-seats", "{битое");
  assert.deepEqual(readSeat(storage, "img:a"), SEAT0);
});
