// @vitest-environment jsdom

// THE FIRST FRAME, NOT THE EVENTUAL ONE — a lobby that flashes for one frame before a table opens
// is not "fixed" by the table arriving a moment later, because the flash already happened. So this
// checks the FIRST `draw()` the fake painter ever receives: when the hash names a table, that first
// plan must already be the closed table (no shelf, no tile), never the lobby.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface DrawnQuad {
  readonly id: string;
}

let plans: (readonly DrawnQuad[])[] = [];

vi.mock("game-kit/pixi", () => ({
  pixiPainter: () => ({
    ready: Promise.resolve(),
    draw: (plan: readonly DrawnQuad[]) => {
      plans.push(plan);
    },
    resize: () => {},
    destroy: () => {},
  }),
}));

function container(): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(el);
  return el;
}

let stop: (() => void) | undefined;

beforeEach(() => {
  plans = [];
  localStorage.clear();
  globalThis.location.hash = "";
});

afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.innerHTML = "";
  vi.resetModules();
});

describe("startHub — первый кадр из hash", () => {
  it("без места в hash первый кадр — лобби (полка)", async () => {
    const { startHub } = await import("./shell.js");
    const chrome = container();
    const stage = container();
    stop = startHub(chrome, stage);

    expect(plans.length).toBeGreaterThan(0);
    const first = plans[0]!;
    expect(first.some((q) => q.id.startsWith("tile/"))).toBe(true);
    expect(first.some((q) => q.id === "nav/back")).toBe(false);
  });

  it("с местом в hash первый кадр — уже стол, лобби не мелькает", async () => {
    globalThis.location.hash = "#cards?room=x";
    const { startHub } = await import("./shell.js");
    const chrome = container();
    const stage = container();
    stop = startHub(chrome, stage);

    expect(plans.length).toBeGreaterThan(0);
    const first = plans[0]!;
    expect(first.some((q) => q.id.startsWith("tile/"))).toBe(false);
    // ВЫХОД БОЛЬШЕ НЕ ХАБОВ: полосу сверху рисует сама игра, а хаб только сообщает ей, что выход
    // отсюда есть. На холсте хаба под столом не остаётся ни одной плашки.
    expect(first.some((q) => q.id === "nav/back")).toBe(false);
  });
});
