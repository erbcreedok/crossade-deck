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
