import { describe, expect, it } from "vitest";
import { PATH_IDLE_MS, PathRecorder, simplify, type PathPoint } from "./pathTape.js";

const at = (dt: number, x: number, y: number): PathPoint => ({ dt, over: { in: "felt", x, y, up: false, angle: 0 } });

describe("траектория пальца для истории", () => {
  it("ровный путь сжимается до начала и конца, излом остаётся", () => {
    const line = Array.from({ length: 20 }, (_, i) => at(i * 50, i * 0.2, 0));
    expect(simplify(line)).toHaveLength(2);
    const bent = [...line, ...Array.from({ length: 10 }, (_, i) => at(1000 + i * 50, 4, (i + 1) * 0.3))];
    const out = simplify(bent);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThan(bent.length);
    expect(out[0]).toEqual(bent[0]);
    expect(out.at(-1)).toEqual(bent.at(-1));
  });

  it("смена цели (рука, стопка) не выбрасывается", () => {
    const pts: PathPoint[] = [at(0, 0, 0), at(100, 1, 0), { dt: 200, over: { in: "hand", chair: "c1", i: 2 } }, { dt: 300, over: { in: "deck", pile: "deck" } }, at(400, 3, 3)];
    const out = simplify(pts);
    expect(out.filter((p) => p.over.in !== "felt")).toHaveLength(2);
  });

  it("жест: собирается по точкам и отдаётся по окончании; короткое касание — не жест", () => {
    const rec = new PathRecorder();
    for (let i = 0; i <= 12; i++) rec.feed("a", "c7", { in: "felt", x: i * 0.3, y: Math.sin(i / 2), up: true, angle: 0 }, 1000 + i * 50);
    const out = rec.end("c7")!;
    expect(out).toMatchObject({ by: "a", id: "c7", t0: 1000 });
    expect(out.pts.length).toBeGreaterThanOrEqual(2);
    expect(out.pts[0]!.dt).toBe(0);
    expect(rec.end("c7")).toBeNull();
    rec.feed("a", "c8", { in: "felt", x: 0, y: 0, up: false, angle: 0 }, 5000);
    rec.feed("a", "c8", { in: "felt", x: 1, y: 0, up: false, angle: 0 }, 5100);
    expect(rec.end("c8")).toBeNull();
  });

  it("то, от чего давно ничего не приходило, считается оконченным", () => {
    const rec = new PathRecorder();
    for (let i = 0; i <= 8; i++) rec.feed("b", "chair:c3", { in: "felt", x: i, y: i % 2, up: false, angle: 0 }, 2000 + i * 100);
    expect(rec.stale(2000 + 800 + PATH_IDLE_MS - 1)).toEqual([]);
    const done = rec.stale(2000 + 800 + PATH_IDLE_MS + 1);
    expect(done.map((d) => d.id)).toEqual(["chair:c3"]);
    expect(rec.all()).toEqual([]);
  });
});
