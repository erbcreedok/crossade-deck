// ПОСАДКА AR-СТОЛА — стол на картине на стене, наклон, сдвиг, память; и что палец по-прежнему попадает.

import { describe, expect, it } from "vitest";
import { arLens, deviceQuat, placeAtGaze, yawQuat, type ArPlace, type Quat } from "./arLens.js";
import { readSeat, SEAT0, SEATS_KEY, seated, tableFlatBy, tableOnMarker, tiltBy, writeSeat } from "./arSeat.js";

const frame = { w: 390, h: 844 };
const FOV = 62;
type Vec = [number, number, number];
const rot = ([qx, qy, qz, qw]: Quat, [x, y, z]: Vec): Vec => {
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
};
const close = (a: number[], b: number[], digits = 6): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

/** Телефон стоймя смотрит вперёд (−Z); картина на стене в 1.5 м перед ним — метка «в лоб». */
const upright = deviceQuat(0, 90, 0, 0);
const WALL: Quat = [0, 0, 0, 1];
const onWall = (): ArPlace => ({ at: [0, 0, -1.5], yaw: 0, unit: 0.02, q: tableOnMarker(WALL) });

describe("ar-seat.anchor-plane", () => {
  it("картина на стене: нормаль стола — из картины ко мне, «ко мне» — к нижнему краю картины", () => {
    const q = tableOnMarker(WALL);
    close(rot(q, [0, 1, 0]), [0, 0, 1]);
    close(rot(q, [0, 0, 1]), [0, -1, 0]);
    close(rot(q, [1, 0, 0]), [1, 0, 0]);
  });

  it("доска лежит на столе: стол на ней — тот же, что стол по гравитации с её курсом", () => {
    const lying: Quat = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]; // метка лицом вверх, низ картинки — ко мне
    close(tableOnMarker(lying), yawQuat(0));
    close(tableFlatBy(WALL), yawQuat(0));
  });

  it("стол на стене перед глазами: середина — в середине экрана, палец попадает туда же, куда кисть", () => {
    const l = arLens({ q: upright, fov: FOV }, onWall(), 25, 1.2, frame);
    const c = l.toGlass({ x: 0, y: 0 });
    expect(c.x).toBeCloseTo(frame.w / 2, 6);
    expect(c.y).toBeCloseTo(frame.h / 2, 6);
    for (const p of [{ x: 3, y: -2 }, { x: -5, y: 4 }]) {
      const back = l.toDesk(l.toGlass(p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
    expect(l.squash, "в упор — не сжат").toBeCloseTo(1, 4);
    expect(l.rise, "в упор — стопки плоские").toBeCloseTo(0, 4);
  });

  it("«ко мне» на стене — вниз по экрану: мой край стола внизу, дальний — вверху", () => {
    const l = arLens({ q: upright, fov: FOV }, onWall(), 0, 1, frame);
    expect(l.toGlass({ x: 0, y: 5 }).y).toBeGreaterThan(l.toGlass({ x: 0, y: -5 }).y + 50);
  });
});

describe("ar-seat.fit", () => {
  it("наклон +30°: дальний край поднялся ко мне, стол сжался на экране, стопки выросли", () => {
    const flat = arLens({ q: upright, fov: FOV }, onWall(), 0, 1, frame);
    const tilted = arLens({ q: upright, fov: FOV }, seated(onWall(), { ...SEAT0, tilt: 30 }), 0, 1, frame);
    const tall = (l: typeof flat) => l.toGlass({ x: 0, y: 5 }).y - l.toGlass({ x: 0, y: -5 }).y;
    expect(tall(tilted)).toBeLessThan(tall(flat) * 0.95);
    expect(tilted.rise).toBeGreaterThan(0.3);
    const far = seated(onWall(), { ...SEAT0, tilt: 30 });
    const farEdge = rot(far.q!, [0, 0, -1]);
    expect(farEdge[2], "дальний край вышел из стены ко мне").toBeGreaterThan(0.4);
  });

  it("сдвиг: x — вправо по якорю, y — вглубь стола, в единицах стола", () => {
    const p = seated(onWall(), { ...SEAT0, x: 10, y: 5 });
    close(p.at, [0.2, 0.1, -1.5]);
    const lying = seated({ at: [0, -0.35, -0.5], yaw: 0, unit: 0.02 }, { ...SEAT0, y: 5 });
    close(lying.at, [0, -0.35, -0.6]);
  });

  it("стол по гравитации без посадки — ровно тот, что был: seated(SEAT0) ничего не меняет", () => {
    const q = deviceQuat(10, 50, 0, 0);
    const place = placeAtGaze(q, 0.35, 0.45, 0.02);
    const a = arLens({ q, fov: FOV }, place, 0, 1, frame).toGlass({ x: 4, y: -3 });
    const b = arLens({ q, fov: FOV }, seated(place, SEAT0), 0, 1, frame).toGlass({ x: 4, y: -3 });
    close([a.x, a.y], [b.x, b.y], 6);
  });

  it("два пальца вверх на 100 px — наклон от себя на 30°, не дальше 85°", () => {
    expect(tiltBy(SEAT0, { y: 400 }, { y: 400 }, { y: 300 }, { y: 300 }).tilt).toBeCloseTo(-30, 9);
    expect(tiltBy(SEAT0, { y: 0 }, { y: 0 }, { y: 900 }, { y: 900 }).tilt).toBe(85);
  });
});

describe("ar-seat.memory", () => {
  it("посадка своя у каждого якоря; битая память — посадка по умолчанию", () => {
    const box = new Map<string, string>();
    const shelf = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v) };
    writeSeat(shelf, "marker:a", { ...SEAT0, tilt: 20, zoom: 1.5, flat: true });
    expect(readSeat(shelf, "marker:a")).toEqual({ ...SEAT0, tilt: 20, zoom: 1.5, flat: true });
    expect(readSeat(shelf, "gravity")).toEqual(SEAT0);
    box.set(SEATS_KEY, "{битое");
    expect(readSeat(shelf, "marker:a")).toEqual(SEAT0);
  });
});
