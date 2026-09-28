// ТЕЛА — разбор из сети, правило «играть стоя» и шея: одно на все клиенты.

import { describe, expect, it } from "vitest";
import { Bodies, cleanBody, holdFor, NECK } from "./bodies.js";

const body = { stance: "sit", model: "seat", look: { x: 1, y: -2 }, stretch: 0.2, yaw: 30, right: null };

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
    expect(cleanBody({ ...body, look: { x: "1", y: 0 } })).toBeNull();
    expect(cleanBody({ ...body, right: { x: 1 } })).toBeNull();
    expect(cleanBody({ ...body, stretch: 5 })!.stretch).toBe(1);
    expect(cleanBody({ ...body, look: { x: 1e9, y: 0 } })!.look.x).toBe(12);
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

describe("bodies.neck-hold", () => {
  it("до свободного натяга — сколько угодно; на пределе — holdMs; между — дольше", () => {
    expect(holdFor(0)).toBe(Infinity);
    expect(holdFor(NECK.free)).toBe(Infinity);
    expect(holdFor(1)).toBe(NECK.holdMs);
    expect(holdFor(0.65)).toBeGreaterThan(NECK.holdMs);
    expect(holdFor(0.65)).toBeLessThan(holdFor(0.4));
  });
});
