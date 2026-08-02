import { describe, expect, it } from "vitest";
import { delaysFor } from "./connect";

describe("delaysFor", () => {
  it("does not delay before the first attempt", () => {
    expect(delaysFor(0)).toBe(0);
  });

  it("waits 1s before the second attempt", () => {
    expect(delaysFor(1)).toBe(1000);
  });

  it("waits 3s before the third attempt", () => {
    expect(delaysFor(2)).toBe(3000);
  });

  it("holds at the last planned delay for attempts beyond the plan", () => {
    expect(delaysFor(3)).toBe(3000);
    expect(delaysFor(10)).toBe(3000);
  });
});
