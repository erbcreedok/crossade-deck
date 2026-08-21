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
import {
  derive,
  down,
  grainRecord,
  installStockGrains,
  keep,
  Poser,
  registerGrain,
  registerSide,
  resetGrains,
  restPose,
  sideRecord,
  stamp,
  up,
} from "./pose.js";
import { Flippable, type Facing } from "./flippable.js";
import { Valued } from "./valued.js";
import { add, fieldsOf } from "../node.js";

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

  // ── the `side` grain ────────────────────────────────────────────────────────────────────────
  //
  // A card remembers ITS OWN side; a zone may be turned over as a whole; and what the owner SEES is
  // the two read together. That is not a rule this file enforces — `Flippable.turns` sums along the
  // chain, so the XOR is what the model already does — and it is why a closed deck is a turned ZONE
  // rather than a stack of turned cards. Pull a card out of one into an untouched hand and the face
  // shows, with nothing having been written to the card.
  //
  // The records therefore answer WHAT THE OWNER SHOULD SEE, and the caller writes it with
  // `setFacing` after the load has changed owner — which folds the zone's turn back in by itself.

  /** A zone turned face-down as a whole: the closed deck. */
  function turnedZone(...rules: Parameters<typeof Poser>): ReturnType<typeof node> {
    return node("deck", Container({ layout: "free" }), Flippable({ turns: 1 }), Poser(...rules));
  }

  it("pose.side-stock-records-install-under-their-names", () => {
    expect(sideRecord("up")).toBeDefined();
    expect(sideRecord("down")).toBeDefined();
    expect(sideRecord("keep")).toBeDefined();
  });

  it("pose.side-defaults-to-keep", () => {
    expect(restPose(zone(), { side: "down" }, {}).side).toBe<Facing>("down");
  });

  it("pose.stamp-up-shows-the-face-whatever-came", () => {
    // Scenario B and G: the board imposes on entry, so a hand-turned card straightens out by
    // leaving and coming back. No "undo the manual flip" mechanism — one line of STAMP does it.
    expect(restPose(zone({ side: up() }), { side: "down" }, {}).side).toBe<Facing>("up");
  });

  it("pose.stamp-down-shows-the-back-whatever-came", () => {
    expect(restPose(zone({ side: down() }), { side: "up" }, {}).side).toBe<Facing>("down");
  });

  it("pose.keep-out-of-a-turned-zone-shows-the-face", () => {
    // Scenario A: drawn from the CLOSED deck into a hand that keeps. The card's own bit was never
    // touched by the deck — the deck was the turned thing — so the owner sees the face.
    expect(restPose(zone({ side: keep() }), { side: "up" }, {}).side).toBe<Facing>("up");
  });

  it("pose.keep-into-a-turned-zone-hides-the-face", () => {
    // Scenario E, the way back: the same card returned into the closed deck lies back-up, by the
    // DECK's default and not by any memory of where it had been.
    expect(restPose(turnedZone({ side: keep() }), { side: "up" }, {}).side).toBe<Facing>("down");
  });

  it("pose.stamp-in-a-turned-zone-still-shows-what-it-says", () => {
    // A stamp names what the OWNER sees, so it is right inside a turned zone too — the zone's own
    // turn is folded back in by `setFacing` at the moment the load changes owner.
    expect(restPose(turnedZone({ side: up() }), { side: "down" }, {}).side).toBe<Facing>("up");
  });

  it("pose.unknown-side-rule-is-skipped-not-thrown", () => {
    expect(restPose(turnedZone({ side: { rule: "wobble", value: 0 } }), { side: "up" }, {}).side).toBe<Facing>("down");
  });

  it("pose.a-game-registers-its-own-side-reading-the-chain", () => {
    // Scenario F: at showdown the hand opens. The record reads a PHASE off the chain the zone hangs
    // in — shared state, so a late viewer resolves the same side — and never the road travelled.
    registerSide("showdown", ({ carried, zone: z }) => {
      for (let owner = z.parent; owner; owner = owner.parent) {
        if (fieldsOf<{ values: Record<string, unknown> }>(owner, "Valued")?.values["phase"] === "showdown") return "up";
      }
      return carried;
    });
    const board = node("board", Container({ layout: "free" }), Valued({ values: { phase: "showdown" } }));
    const hand = node("hand", Container({ layout: "free" }), Poser({ side: { rule: "showdown", value: 0 } }));
    add(board, hand);
    expect(restPose(hand, { side: "down" }, {}).side).toBe<Facing>("up");
  });

  it("pose.side-and-angle-are-grains-of-ONE-pose", () => {
    // The whole point of the atom: one transaction resolves every grain, and the two do not know
    // about each other. A zone that stamps the turn and keeps the side does exactly that.
    const rest = restPose(zone({ angle: stamp(0), side: keep() }), { angle: 15, side: "down" }, { angle: 7 });
    expect(rest).toEqual({ angle: 0, tilt: 0, side: "down" });
  });

  // ── the tilt grain ──────────────────────────────────────────────────────────────────────────
  //
  // The last grain, and it waited on a fact rather than on work: until the stop lived on the node
  // there was nothing for a zone to keep or stamp. It reads an INDEX and not degrees — the degrees
  // are the piece's own (`Tiltable.stops`), and a zone imposing 90° would be telling a three-stop
  // token something it has no way to be.

  it("pose.tilt-defaults-to-keep", () => {
    expect(restPose(zone(), { tilt: 2 }, {}).tilt).toBe(2);
  });

  it("pose.a-mat-can-square-a-tapped-piece-up", () => {
    expect(restPose(zone({ tilt: stamp(0) }), { tilt: 2 }, {}).tilt).toBe(0);
  });

  it("pose.a-board-can-let-a-tapped-card-stay-tapped", () => {
    expect(restPose(zone({ tilt: keep() }), { tilt: 1 }, {}).tilt).toBe(1);
  });

  it("pose.tilt-derives-from-the-arrangement-when-it-has-an-opinion", () => {
    expect(restPose(zone({ tilt: derive() }), { tilt: 2 }, { tilt: 1 }).tilt).toBe(1);
  });

  it("pose.the-grains-do-not-know-about-each-other", () => {
    // One transaction answers all of them, and each is answered on its own terms: degrees for the
    // turn, an index for the stop, a side for the face.
    const rest = restPose(zone({ angle: keep(), tilt: stamp(0), side: keep() }), { angle: 15, tilt: 2, side: "down" }, {});
    expect(rest).toEqual({ angle: 15, tilt: 0, side: "down" });
  });
});