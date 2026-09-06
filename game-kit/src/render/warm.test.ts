// @vitest-environment jsdom

// WARMING IS THE RENDERER'S BUSINESS — the guard on where the pictures are asked for.
//
// A texture arrives the first time a plan names it, and a piece that changes picture faster than a
// load takes shows a frame of nothing for every face it has not worn yet. The shelf used to buy the
// early load with NODES — one tiny sprite per registered picture, parked just off the felt — and
// the whole asset registry was then visible on the felt as a strip of eighty images beside the
// round desk. The question is asked of the painter instead (`Painter.warm`), at the binding.

import { describe, expect, it } from "vitest";
import { node } from "../core/node.js";
import { registerAsset, resetAssets } from "./assets.js";
import { mount } from "./host.js";
import { attachPainter, warmPictures } from "./stage.js";
import { type Painter } from "./painter.js";

function recorder(): { painter: Painter; warmed: string[][] } {
  const warmed: string[][] = [];
  return {
    warmed,
    painter: {
      ready: Promise.resolve(),
      draw: () => {},
      warm: (sources) => warmed.push([...sources]),
      resize: () => {},
      destroy: () => {},
    },
  };
}

describe("warming the pictures", () => {
  it("warm.every-registered-picture-is-asked-for — by source, and once", () => {
    resetAssets();
    registerAsset("die/1", { src: "die-1.png", w: 1, h: 1 });
    registerAsset("die/2", { src: "die-2.png", w: 1, h: 1 });
    const { painter, warmed } = recorder();
    warmPictures(painter);
    expect(warmed).toEqual([["die-1.png", "die-2.png"]]);
  });

  it("warm.the-binding-is-what-asks — a tree bound to a renderer warms it before the first frame", () => {
    resetAssets();
    registerAsset("card/back", { src: "back.png", w: 1, h: 1 });
    const { painter, warmed } = recorder();
    const host = mount(document.createElement("div"), node("desk"));
    const stop = attachPainter(host, painter);
    stop();
    host.unmount();
    expect(warmed[0], "asked at the binding, not by a node on the desk").toEqual(["back.png"]);
  });

  it("warm.a-painter-with-no-cache-is-not-broken-by-being-asked — absence is the refusal", () => {
    resetAssets();
    registerAsset("card/back", { src: "back.png", w: 1, h: 1 });
    const bare: Painter = { ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} };
    expect(() => warmPictures(bare)).not.toThrow();
  });
});
