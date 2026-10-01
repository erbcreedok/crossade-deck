// ТЕЛА — разбор из сети, правило «играть стоя» и шея: одно на все клиенты.

import { describe, expect, it } from "vitest";
import { AWAY_DEG, Bodies, cleanBody, HEAD, headOf, holdFor, NECK, NECK_LEN, restHead, shoulders3, STANCE_ZOOM, awayOf } from "./bodies.js";

const body = { stance: "sit", model: "seat", eye: { x: 1, y: -2, h: 12 }, stretch: 0.2, yaw: 30, right: null };

describe("bodies.read-whole-or-nothing", () => {
  it("целое тело принимается, правая рука без дела — null", () => {
    expect(cleanBody(body)).toEqual(body);
    expect(cleanBody({ ...body, right: { x: 3, y: 4 } })!.right).toEqual({ x: 3, y: 4 });
  });

  it("вид аватара: знакомый — как есть, незнакомый или не сказан — первый", () => {
    expect(cleanBody({ ...body, model: "king" })!.model).toBe("king");
    expect(cleanBody({ ...body, model: "dragon" })!.model).toBe("seat");
    const { model: _, ...old } = body;
    expect(cleanBody(old)!.model).toBe("seat");
  });

  it("взгляд вверх-вниз (pitch): не прислан — поля нет, прислан — в пределах -90…90, мусор — отказ", () => {
    expect("pitch" in cleanBody(body)!).toBe(false);
    expect(cleanBody({ ...body, pitch: -40 })!.pitch).toBe(-40);
    expect(cleanBody({ ...body, pitch: -500 })!.pitch).toBe(-90);
    expect(cleanBody({ ...body, pitch: "low" })).toBeNull();
  });

  it("загиб веера (curl): не прислан — поля нет, прислан — в пределах 0…1, мусор — отказ", () => {
    expect("curl" in cleanBody(body)!).toBe(false);
    expect(cleanBody({ ...body, curl: 0.4 })!.curl).toBe(0.4);
    expect(cleanBody({ ...body, curl: 7 })!.curl).toBe(1);
    expect(cleanBody({ ...body, curl: null })).toBeNull();
  });
  it("куда голова смотрит на самом деле (gaze): не прислан — поля нет, прислан — в пределах -360…360, мусор — отказ", () => {
    expect("gaze" in cleanBody(body)!).toBe(false);
    expect(cleanBody({ ...body, gaze: 75 })!.gaze).toBe(75);
    expect(cleanBody({ ...body, gaze: 9999 })!.gaze).toBe(360);
    expect(cleanBody({ ...body, gaze: null })).toBeNull();
  });

  it("мусор — отказ целиком, числа — в пределах", () => {
    expect(cleanBody({ ...body, stance: "lie" })).toBeNull();
    expect(cleanBody({ ...body, eye: { x: "1", y: 0, h: 3 } })).toBeNull();
    expect(cleanBody({ ...body, eye: { x: 1, y: 0 } })).toBeNull();
    expect(cleanBody({ ...body, right: { x: 1 } })).toBeNull();
    expect(cleanBody({ ...body, stretch: 5 })!.stretch).toBe(1);
    expect(cleanBody({ ...body, eye: { x: 1e9, y: 0, h: 1e9 } })!.eye).toEqual({ x: 40, y: 0, h: 60 });
    expect(cleanBody(null)).toBeNull();
  });
});

describe("bodies.stand-rule-stands-everyone", () => {
  it("правило «играть стоя» ставит на ноги, что бы ни прислал клиент", () => {
    const all = new Bodies();
    expect(all.set("a", cleanBody(body)!, { stand: false }).stance).toBe("sit");
    expect(all.set("a", cleanBody(body)!, { stand: true }).stance).toBe("stand");
  });

  it("включили правило — сидевшие встают сразу, стоявшие не трогаются", () => {
    const all = new Bodies();
    all.set("a", cleanBody(body)!, { stand: false });
    all.set("b", cleanBody({ ...body, stance: "stand" })!, { stand: false });
    expect(all.restand({ stand: true }).map((b) => b.by)).toEqual(["a"]);
    expect(all.list().every((b) => b.stance === "stand")).toBe(true);
    expect(all.restand({ stand: false })).toEqual([]);
  });
});

describe("bodies.head-stays-on-the-neck", () => {
  it("камера высоко — голова в покое: на up выше плеч, на короткой шее к взгляду", () => {
    const s = shoulders3(0, "sit");
    const rest = headOf(s, { x: 0, y: 0, h: 40 }, 0);
    expect(rest.h).toBeCloseTo(restHead("sit"), 6);
    expect(Math.hypot(rest.x - s.x, rest.y - s.y, rest.h - s.h)).toBeCloseTo(NECK_LEN.rest, 6);
  });

  it("камера ниже — голова опускается к столу и тянется вперёд, но не ниже HEAD.min", () => {
    const s = shoulders3(0, "sit");
    const rest = headOf(s, { x: 0, y: 0, h: 40 }, 0);
    const bent = headOf(s, { x: 0, y: 0, h: 4.5 }, 0);
    expect(bent.h).toBeCloseTo(4.5, 6);
    expect(Math.hypot(bent.x - s.x, bent.y - s.y), "нагнулся — голова дальше над столом").toBeGreaterThan(Math.hypot(rest.x - s.x, rest.y - s.y) + 1);
    expect(headOf(s, { x: 0, y: 0, h: 0 }, 0).h).toBe(HEAD.min);
  });

  it("голова не проходит дальше точки взгляда", () => {
    const s = shoulders3(0, "sit");
    const near = { x: s.x, y: s.y - 0.5, h: 3 };
    const head = headOf(s, near, 1);
    expect(Math.hypot(head.x - s.x, head.y - s.y)).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it("стоя плечи и голова в покое выше; стоя камера дальше во столько же раз", () => {
    expect(shoulders3(0, "stand").h).toBeGreaterThan(shoulders3(0, "sit").h);
    expect(STANCE_ZOOM.stand).toBeCloseTo(restHead("sit") / restHead("stand"), 9);
  });
});

describe("bodies.head-follows-the-camera", () => {
  it("камера на своём месте — голова у своего стула; повёрнута на другую сторону — голова там, тело на стуле", () => {
    const s = shoulders3(0, "sit");
    // Стул на юге (угол 0): свой поворот — 0; повёрнута на 180 — камера смотрит с севера.
    expect(awayOf(s, 0)).toBe(false);
    expect(awayOf(s, AWAY_DEG - 1)).toBe(false);
    expect(awayOf(s, 180)).toBe(true);
    const home = headOf(s, { x: 0, y: 0, h: 40 }, 0, 0);
    const there = headOf(s, { x: 0, y: 0, h: 40 }, 0, 180);
    expect(home.y).toBeGreaterThan(0);
    expect(there.y, "голова ушла на северную сторону").toBeLessThan(0);
    // Стул на востоке (90°) у себя смотрит поворотом −90.
    expect(awayOf(shoulders3(90, "sit"), -90)).toBe(false);
  });
});

describe("bodies.neck-hold", () => {
  it("чуть нагнулся — сколько угодно; сильнее — holdMs", () => {
    expect(holdFor(0)).toBe(Infinity);
    expect(holdFor(NECK.free)).toBe(Infinity);
    expect(holdFor(0.5)).toBe(NECK.holdMs);
    expect(holdFor(1)).toBe(NECK.holdMs);
  });
});
