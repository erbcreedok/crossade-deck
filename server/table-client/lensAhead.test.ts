import { describe, expect, it } from "vitest";
import { lens } from "./lens.js";

const ID = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const frame = { w: 400, h: 800 };

describe("линза: перед глазом или за спиной", () => {
  it("середина стола — перед глазом; далеко к зрителю при сильном наклоне — за спиной, хотя стекло её и прижимает", () => {
    const L = lens(ID, 70, 1, frame);
    expect(L.ahead({ x: 200, y: 400 })).toBe(true);
    const behind = { x: 200, y: 400 + 5000 };
    expect(L.ahead(behind)).toBe(false);
    expect(Number.isFinite(L.toGlass(behind).y), "сукно рисуется и так — прижатым").toBe(true);
  });

  it("сверху, без наклона, за спиной нет ничего", () => {
    const L = lens(ID, 0, 1, frame);
    expect(L.ahead({ x: 200, y: 400 + 5000 })).toBe(true);
  });
});
