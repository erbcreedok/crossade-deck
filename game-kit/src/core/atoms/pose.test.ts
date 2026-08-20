// THE GRAINS OF A REST POSE — three answers, one per grain, and nothing else.
//
// The scenario this is held against is `docs/scenarios/pose.md`, recorded from the owner: a zone
// decides each grain of the pose SEPARATELY, and for each one it either takes what the arrangement
// says (derive), imposes its own number (stamp), or accepts what the load brought (keep). No state
// machine, no priorities, no negation flags — one record per grain.
//
// What is tested here is the RESOLVER alone: it is a pure function of the zone's rules, what the
// arrangement said and what came in. The clock, the wire and the animation are elsewhere on purpose
// — a rest pose is authoritative, and how a piece travels to it is decoration (`settle`).

import { beforeEach, describe, expect, it } from "vitest";
import { Container } from "./container.js";
import { node } from "../node.js";
import { compose } from "../node.js";
import { derive, grainRecord, installStockGrains, keep, Poser, registerGrain, resetGrains, restPose, stamp } from "./pose.js";

/** A zone: a container, because a pose rule belongs to whatever RECEIVES a load. */
function zone(...rules: Parameters<typeof Poser>): ReturnType<typeof node> {
  return node("zone", Container({ layout: "free" }), Poser(...rules));
}

describe("pose grains", () => {
  beforeEach(() => {
    resetGrains();
    installStockGrains();
  });

  it("pose.stock-grains-install-under-their-names", () => {
    expect(grainRecord("derive")).toBeDefined();
    expect(grainRecord("stamp")).toBeDefined();
    expect(grainRecord("keep")).toBeDefined();
  });

  it("pose.the-registry-resets-between-suites", () => {
    resetGrains();
    expect(grainRecord("derive")).toBeUndefined();
  });

  it("pose.no-poser-keeps-what-came", () => {
    // A zone that declares nothing imposes nothing: absence IS the refusal, everywhere in the kit.
    const bare = node("bare", Container({ layout: "free" }));
    expect(restPose(bare, { angle: 15 }, { angle: 0 }).angle).toBe(15);
  });

  it("pose.poser-defaults-to-keep", () => {
    // Declaring the atom and naming no grain must change NOTHING — otherwise adding a rule for one
    // grain would silently straighten every other.
    expect(restPose(zone(), { angle: 15 }, { angle: 0 }).angle).toBe(15);
  });

  it("pose.keep-carries-the-angle-in", () => {
    // Scenario C: turned 15° under the finger, carried onto a keep-table, lies at 15°.
    expect(restPose(zone({ angle: keep() }), { angle: 15 }, { angle: 0 }).angle).toBe(15);
  });

  it("pose.derive-takes-the-arrangement", () => {
    expect(restPose(zone({ angle: derive() }), { angle: 15 }, { angle: 7 }).angle).toBe(7);
  });

  it("pose.derive-straightens-when-nothing-was-laid", () => {
    // Scenario C again, the other half: the same 15° carried onto a grid is LOST — an arrangement
    // with no opinion about the turn means "straight", which is exactly what a grid means.
    expect(restPose(zone({ angle: derive() }), { angle: 15 }, {}).angle).toBe(0);
  });

  it("pose.stamp-overrides-whatever-came", () => {
    // Scenario D and G: the zone imposes, and the history is not consulted.
    expect(restPose(zone({ angle: stamp(0) }), { angle: 15 }, { angle: 7 }).angle).toBe(0);
  });

  it("pose.stamp-holds-a-number-other-than-zero", () => {
    expect(restPose(zone({ angle: stamp(90) }), { angle: 15 }, {}).angle).toBe(90);
  });

  it("pose.keep-with-nothing-carried-is-straight", () => {
    expect(restPose(zone({ angle: keep() }), {}, { angle: 7 }).angle).toBe(0);
  });

  it("pose.unknown-rule-is-skipped-not-thrown", () => {
    // A content error must not take the scene down, and it must not invent a pose either: an
    // unregistered name leaves the grain exactly as it arrived.
    expect(restPose(zone({ angle: { rule: "wobble", value: 3 } }), { angle: 15 }, { angle: 7 }).angle).toBe(15);
  });

  it("pose.a-game-registers-its-own-grain", () => {
    // The seam scenario F needs: a game's own record, a pure function of the same three inputs.
    registerGrain("halved", ({ carried }) => (carried ?? 0) / 2);
    expect(restPose(zone({ angle: { rule: "halved", value: 0 } }), { angle: 30 }, {}).angle).toBe(15);
  });

  it("pose.poser-needs-a-container", () => {
    // A rule about what a zone does to an arriving load is meaningless where nothing can arrive.
    const loose = compose(node("loose"), Poser({ angle: stamp(90) }));
    expect(restPose(loose, { angle: 15 }, {}).angle).toBe(15);
  });
});
