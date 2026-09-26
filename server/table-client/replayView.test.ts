import { describe, expect, it } from "vitest";
import { viewOf, type Moment } from "./replayStore.js";

let n = 0;
const at = (side: "table" | "screen", kind: string, who?: string, what?: unknown): Moment => {
  n += 1;
  return { at: n, step: n - 1, deed: { id: n, at: n, side, kind, ...(who ? { who } : {}), ...(what ? { what } : {}) } };
};
const v = (turn: number) => ({ x: 0, y: 0, zoom: 1, turn, lean: 0 });

describe("replay.camera-of-the-chosen-eyes", () => {
  const moments = [
    at("table", "join", "bat"),
    at("screen", "view", "ye", v(90)),
    at("screen", "view", "bat", v(10)),
    at("table", "patch"),
    at("screen", "view", "ye", v(180)),
    at("screen", "view", "bat", v(20)),
    at("screen", "view", "ye", v(270)),
  ];

  it("камера — только выбранного игрока, последняя до мгновения; чужое движение её не перебивает", () => {
    expect(viewOf(moments, 4, "bat")?.turn, "Ye двинул стол — у Батырхана всё ещё его камера").toBe(10);
    expect(viewOf(moments, 6, "bat")?.turn).toBe(20);
    expect(viewOf(moments, 6, "ye")?.turn).toBe(270);
    expect(viewOf(moments, 3, "ye")?.turn).toBe(90);
  });

  it("до первого своего движения — первая своя камера; скачок назад и вперёд даёт то же, что шаги", () => {
    expect(viewOf(moments, 0, "bat")?.turn).toBe(10);
    expect(viewOf(moments, 1, "bat")?.turn, "на шаге Ye — не камера Ye").toBe(10);
    const steps = moments.map((_, i) => viewOf(moments, i, "bat")?.turn);
    expect([6, 0, 4, 2, 5].map((i) => viewOf(moments, i, "bat")?.turn)).toEqual([6, 0, 4, 2, 5].map((i) => steps[i]));
  });

  it("камеры не записано (крупье) — `null`, а не камера другого игрока", () => {
    expect(viewOf(moments, 6, "croupier")).toBeNull();
  });
});
