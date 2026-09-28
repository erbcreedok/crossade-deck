// ТЕЛА — разбор из сети, правило «играть стоя» и шея: одно на все клиенты.

import { describe, expect, it } from "vitest";
import { Bodies, cleanBody, headOf, holdFor, NECK, NECK_LEN, shoulders3 } from "./bodies.js";

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
  it("голова — от плеч к глазу, не дальше шеи; натяг удлиняет шею; ниже сукна не опускается", () => {
    const s = shoulders3(0, "sit");
    const far = { x: 0, y: -30, h: 40 };
    const rest = headOf(s, far, 0);
    expect(Math.hypot(rest.x - s.x, rest.y - s.y, rest.h - s.h)).toBeCloseTo(NECK_LEN.rest, 6);
    expect(rest.h - s.h, "глаз высоко — голова выше плеч не больше чем на up").toBeCloseTo(NECK_LEN.up, 6);
    const reach = headOf(s, far, 1);
    expect(Math.hypot(reach.x - s.x, reach.y - s.y, reach.h - s.h)).toBeCloseTo(NECK_LEN.rest + NECK_LEN.reach, 6);
    expect(Math.hypot(reach.x - s.x, reach.y - s.y), "натянул — голова ушла вперёд над столом").toBeGreaterThan(Math.hypot(rest.x - s.x, rest.y - s.y) + 3);
    const near = { x: s.x, y: s.y - 1, h: s.h + 1 };
    expect(headOf(s, near, 0)).toEqual(near);
    expect(headOf(s, { x: s.x, y: s.y, h: -50 }, 1).h).toBe(0.5);
  });

  it("стоя плечи выше", () => {
    expect(shoulders3(0, "stand").h).toBeGreaterThan(shoulders3(0, "sit").h);
  });
});

describe("bodies.neck-hold", () => {
  it("до свободного натяга — сколько угодно; на пределе — holdMs; между — дольше", () => {
    expect(holdFor(0)).toBe(Infinity);
    expect(holdFor(NECK.free)).toBe(Infinity);
    expect(holdFor(1)).toBe(NECK.holdMs);
    expect(holdFor(0.65)).toBeGreaterThan(NECK.holdMs);
    expect(holdFor(0.65)).toBeLessThan(holdFor(0.4));
  });
});
