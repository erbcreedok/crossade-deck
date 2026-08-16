import { describe, expect, it } from "vitest";
import { add, fieldsOf, node, remove } from "../node.js";
import { Bounded } from "./bounded.js";
import { Container } from "./container.js";
import { castsShadow, ShadowCaster, type ShadowCasterFields } from "./shadow.js";
import { DEFAULT_LIGHT, lightVector, Lit } from "./lit.js";
import { rect } from "../../presets/shapes.js";

const box = () => Bounded({ bounds: rect(1, 1.4) });

describe("the shadow caster", () => {
  it("atom.shadow.names-its-contour — footprint for the box, silhouette for the drawn shape", () => {
    // The layout needs the rectangle a knight STANDS on; its shadow needs the knight. One field
    // picks which contour falls on the desk, and the silhouette is the default because that is
    // what a shadow of a drawn piece IS.
    expect(fieldsOf<ShadowCasterFields>(node("s1", box(), ShadowCaster()), "ShadowCaster")?.from).toBe("silhouette");
    expect(
      fieldsOf<ShadowCasterFields>(node("s2", box(), ShadowCaster({ from: "footprint" })), "ShadowCaster")?.from,
    ).toBe("footprint");
  });

  it("atom.shadow.a-resting-stack-casts-once — the nearest casting owner speaks for the subtree", () => {
    // The canon's law: a resting stack is ONE caster, and a child detached from it starts
    // casting the moment it stands alone. Nothing is toggled — cast-ness is derived from the
    // chain, so reparenting IS the switch.
    const pile = node("pile", box(), Container({ layout: "free" }), ShadowCaster());
    const card = node("card", box(), ShadowCaster());
    add(pile, card);
    expect(castsShadow(pile)).toBe(true);
    expect(castsShadow(card)).toBe(false); // the pile casts for it
    remove(pile, card);
    expect(castsShadow(card)).toBe(true); // detached: it stands alone and casts alone
  });

  it("atom.shadow.no-atom-no-shadow — absence is the refusal, there is no off flag", () => {
    expect(castsShadow(node("s3", box()))).toBe(false);
  });
});

describe("the one light", () => {
  it("atom.lit.defaults-to-the-viewer-frame — top-right of the FRAME, shadows fall down-left", () => {
    // No `Lit` on the root still lights the desk: a kit consumer who never thought about light
    // gets the stock lamp, not a desk with shadow casters and no shadows.
    const bare = node("desk");
    const v = lightVector(bare);
    expect(v.x).toBeLessThan(0);
    expect(v.y).toBeGreaterThan(0);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(DEFAULT_LIGHT.frame).toBe("viewer");
  });

  it("atom.lit.the-angle-turns-the-fall — the light walks around the desk, the shadow answers", () => {
    // Light from straight above the +x edge (angle 0) throws the shadow to −x exactly; from the
    // left (180) it throws to +x. One formula, no second place computing a direction.
    const desk = node("desk", Lit({ light: { frame: "viewer", angle: 0 } }));
    expect(lightVector(desk).x).toBeCloseTo(-1);
    expect(lightVector(desk).y).toBeCloseTo(0);
    const west = node("desk2", Lit({ light: { frame: "viewer", angle: 180 } }));
    expect(lightVector(west).x).toBeCloseTo(1);
  });

  it("atom.lit.the-viewer-frame-ignores-the-camera — the world frame turns with it", () => {
    // The whole difference between the two frames IS the camera: `viewer` keeps the fall
    // constant on screen, `world` turns it by −rotation so the lamp stays over the DESK.
    const viewer = node("d1", Lit({ light: { frame: "viewer", angle: 0 } }));
    const world = node("d2", Lit({ light: { frame: "world", angle: 0 } }));
    expect(lightVector(viewer, 90)).toEqual(lightVector(viewer, 0));
    expect(lightVector(world, 90).y).toBeCloseTo(1); // the fall turned with the desk
    expect(lightVector(world, 90).x).toBeCloseTo(0);
  });

  it("atom.lit.reads-at-the-root — a light on a child lights nothing", () => {
    // `light` is a root-only field: the canvas has ONE lamp and a piece cannot bring its own.
    const desk = node("desk", Lit({ light: { frame: "viewer", angle: 180 } }));
    const corner = node("corner", Lit({ light: { frame: "viewer", angle: 0 } }));
    add(desk, corner);
    // Asked THROUGH the child, the answer is still the root's lamp.
    expect(lightVector(corner).x).toBeCloseTo(1);
  });
});
