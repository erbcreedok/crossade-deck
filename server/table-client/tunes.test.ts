import { afterEach, describe, expect, it } from "vitest";
import type { Body } from "../src/table/bodies.js";
import { partsFor } from "../src/table/skins.js";
import { setTunes } from "../src/table/tunes.js";
import { dollPose } from "./bodyView.js";
import { partGeom } from "./dollSprites.js";

// Правки хозяина (`tunes.ts`) доходят до слоя тел за столом, а не только до сцены профиля.
describe("правки частей за столом", () => {
  afterEach(() => setTunes({ parts: {}, at: 0 }));
  const body: Body = { by: "tg:1", stance: "sit", model: "doll", eye: { x: 0, y: 11, h: 6 }, stretch: 0, yaw: 0, right: null } as unknown as Body;
  const toGlass = (p: { x: number; y: number }, h = 0) => ({ x: p.x * 10, y: -p.y * 4 - h * 10 });
  const parts = partsFor("king");

  it("величина головы меняет её высоту на столе", () => {
    const plain = dollPose(body, Math.PI / 2, parts, toGlass).headH;
    setTunes({ parts: { "king:head": { scale: 2 } }, at: 1 });
    expect(dollPose(body, Math.PI / 2, parts, toGlass).headH).toBeCloseTo(plain * 2, 5);
  });

  it("линия плеч туловища — правленая, если задана", () => {
    const plain = partGeom("king:body").shoulder;
    setTunes({ parts: { "king:body": { shoulder: 0.4 } }, at: 1 });
    expect(partGeom("king:body").shoulder).toBeGreaterThan(plain);
  });
});
