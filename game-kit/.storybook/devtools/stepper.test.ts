import { beforeEach, describe, expect, it } from "vitest";
import { backTarget, paceOf, pausesAfter, resetPaces, setPace } from "./stepper.js";

beforeEach(() => {
  resetPaces();
});

describe("the pace of a story's checks", () => {
  it("checks.pace-defaults-to-all-at-once — a first visit runs at full speed", () => {
    // Opening a Tests page is the request to run its checks, and the default keeps that whole:
    // no pause at any step until a reader asks for one. The map starts empty, so a page reload
    // — which rebuilds the module — lands back here too.
    const pace = paceOf("tests-node--lifecycle");
    expect(pace.mode).toBe("all");
    for (const index of [0, 1, 5]) expect(pausesAfter(pace, index), `step ${index}`).toBe(false);
  });

  it("checks.step-mode-pauses-after-every-step — and a replay sprints to its target first", () => {
    // The pause comes AFTER a step, so the glass carries that step's own picture. On a replay
    // (back, restart) everything before the target runs without pausing — the reader asked to
    // stand at N again, not to click through the steps they have already seen.
    setPace("s", { mode: "step", fastForwardTo: 2 });
    const pace = paceOf("s");
    expect(pausesAfter(pace, 0)).toBe(false);
    expect(pausesAfter(pace, 1)).toBe(false);
    expect(pausesAfter(pace, 2)).toBe(true);
    expect(pausesAfter(pace, 3)).toBe(true);
  });

  it("checks.back-replays-to-the-previous-step — and the first step has no back at all", () => {
    // The scene is live — a step may feed it twenty trees — so back is an honest replay to the
    // step before, never an undo. At step 0 there is nothing before, and the strip must not
    // offer a button that would replay to nowhere.
    expect(backTarget(3)).toBe(2);
    expect(backTarget(1)).toBe(0);
    expect(backTarget(0)).toBeNull();
  });
});
