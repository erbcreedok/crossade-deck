import { describe, expect, it } from "vitest";
import { CARRY_EVERY_MS } from "./contract.js";
import { Flood, PER_SECOND } from "./flood.js";

describe("затопление", () => {
  it("честный палец в воздухе не упирается в меру никогда", () => {
    const f = new Flood();
    for (let now = 0; now < 10_000; now += CARRY_EVERY_MS) expect(f.take("a", "carry", now)).toBe(true);
  });

  it("цикл намерений режется по мере, а через секунду человек снова в игре", () => {
    const f = new Flood();
    const taken = Array.from({ length: 500 }, (_, i) => f.take("a", "intent", i)).filter(Boolean).length;
    expect(taken).toBe(PER_SECOND.intent);
    expect(f.take("a", "intent", 1500)).toBe(true);
  });

  it("мера своя у каждого человека и у каждого вида сообщений", () => {
    const f = new Flood();
    for (let i = 0; i < 100; i += 1) f.take("a", "say", 0);
    expect(f.take("a", "say", 1)).toBe(false);
    expect(f.take("b", "say", 1)).toBe(true);
    expect(f.take("a", "intent", 1)).toBe(true);
  });

  it("ушедшего забывают", () => {
    const f = new Flood();
    for (let i = 0; i < 100; i += 1) f.take("a", "say", 0);
    f.forget("a");
    expect(f.take("a", "say", 1)).toBe(true);
  });
});
