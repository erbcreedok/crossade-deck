// A HOOK NOBODY CALLS IS A LIE IN THE CONTRACT.
//
// `DeskLayer` is the only door a game has into a running desk, and every method on it is a promise:
// "tell me and I will be told". A method declared and never dispatched reads exactly like a working
// one to whoever implements it — their code is simply never run, and the bug looks like their own.
//
// This is not hypothetical. The first draft of the runtime declared `zoneAt` on `DeskLayer` and
// forwarded it nowhere: the helper that would have dispatched it was written, left unused, and would
// have shipped. A card game implementing `zoneAt` would have watched its drops fall through the hand
// onto the felt with nothing in the type system or the tests to say why.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = new URL("./", import.meta.url).pathname;

/** Every method `DeskLayer` declares, optional ones included. */
function layerMethods(): string[] {
  const types = readFileSync(`${SRC}types.ts`, "utf8");
  const body = /export interface DeskLayer \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? "";
  // A method is `name(` or `name?(` at the head of a line — never a field, never a comment.
  return [...body.matchAll(/^\s{2}(\w+)\??\(/gm)].map((m) => m[1]!);
}

describe("desk.a-layer-hears-the-carry", () => {
  it("every method the contract declares is dispatched by the runtime", () => {
    const runtime = readFileSync(`${SRC}startDesk.ts`, "utf8");
    const methods = layerMethods();
    expect(methods.length, "the contract has methods to check at all").toBeGreaterThan(3);
    const undispatched = methods.filter((name) => !new RegExp(`layer\\.${name}\\??[.(]|\\.${name}\\?\\.\\(`).test(runtime));
    expect(undispatched, "declared on DeskLayer but never called by startDesk").toEqual([]);
  });

  it("desk.the-cover-comes-off-after-the-view-is-home — never a frame drawn from nobody's side", () => {
    // THE ORDER OF TWO LINES, and exactly the sort of rule that only holds where somebody looked:
    // raising the cover one line earlier puts the middle-of-the-room frame back on the glass, and
    // every test that reads a camera would still be green.
    //
    // IT LIVES HERE, AMONG THE SCANS, and not beside the curtain's own test — that one runs under
    // jsdom, where `import.meta.url` is an http address and `readFileSync` cannot open it. A scan
    // belongs with the other scans, in the environment that can read a file.
    const runtime = readFileSync(`${SRC}startDesk.ts`, "utf8");
    expect(runtime.includes("curtain(container,"), "the desk is covered while it is still guessing").toBe(true);
    const home = runtime.indexOf("live.idle?.goHome()");
    expect(home, "the view is taken home from the join").toBeGreaterThan(0);
    // THROUGH `ready()` AND NOT BY HAND. The cover coming off and "the table is worth looking at"
    // are the same moment, and they are one call because they drifted apart the moment they were
    // two: a loading screen lifted on its own timing hands the player a table still being built.
    expect(runtime, "raising the cover is also the report that the table is up").toMatch(/const ready = \(\): void => \{\s*cover\.raise\(\);/);
    const told = [...runtime.matchAll(/\bready\(\);/g)].map((m) => m.index ?? -1);
    expect(told.length, "every way the join can settle takes the cover off").toBeGreaterThan(1);
    for (const one of told) expect(one, "the cover comes off after the view is home, never before").toBeGreaterThan(home);
    // ...AND THE TEARDOWN RAISES IT WITHOUT REPORTING: a desk being taken down has nothing to say,
    // and whoever is waiting must not be told the table arrived by the code removing it.
    const stopping = runtime.slice(runtime.indexOf("  return () => {"));
    expect(stopping, "the teardown takes the cover off").toContain("cover.raise();");
    expect(stopping.includes("ready();"), "…but reports nothing").toBe(false);
  });

  it("desk.a-stopped-desk-writes-nothing — the join in flight comes back to a desk that is gone", () => {
    // THE ONE THING THAT OUTLIVES A TEARDOWN. Every listener here can be unbound; a promise already
    // in flight comes back whatever happened meanwhile, and it used to carry on — write the address,
    // join the clock, bind the relay — against a desk with no canvas left.
    //
    // The symptom was the owner's: open the card table, press back before the room answers, and the
    // shelf you are now looking at has its address rewritten to `#cards?room=…` a second later. The
    // next reload drops you into a game you had left, and the room stays joined because nobody is
    // left to leave it.
    //
    // A SCAN, because the alternative is standing a real desk up against a real socket to prove one
    // early return. What it checks is that the guard is the FIRST thing in the continuation and that
    // the room is let go — a guard placed after even one line of the old body is the bug again.
    const runtime = readFileSync(`${SRC}startDesk.ts`, "utf8");
    const then = runtime.indexOf(".then((table) => {");
    expect(then, "the join still has a continuation").toBeGreaterThan(0);
    const guard = runtime.indexOf("if (stopped) {", then);
    expect(guard, "and it opens with the stopped guard").toBeGreaterThan(then);
    const assigned = runtime.indexOf("currentTable = table;", then);
    expect(guard, "the guard comes BEFORE anything the continuation does").toBeLessThan(assigned);
    expect(runtime.slice(guard, assigned), "a desk that is gone lets the room go").toContain("table.leave()");
    expect(runtime, "and the teardown is what raises it").toContain("stopped = true;");
  });

  it("the carry is one of them, and it reaches the layers from the mirror", () => {
    // THE MOST IMPORTANT ONE, named outright: a card in the air is what the card table's whole HUD
    // is driven by, and it arrives through `Mirror.hand` and nowhere else.
    const runtime = readFileSync(`${SRC}startDesk.ts`, "utf8");
    expect(layerMethods()).toContain("carried");
    const mirrorHand = runtime.indexOf("hand: (items, at, done, feel)");
    expect(mirrorHand, "the mirror still reports the hand").toBeGreaterThan(0);
    const dispatch = runtime.indexOf("layer.carried?.(items, at, done, feel)");
    expect(dispatch, "and the report reaches the layers").toBeGreaterThan(mirrorHand);
  });
});
