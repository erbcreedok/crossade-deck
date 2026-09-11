// nardy.stands-alone — THE GAME RUNS WITHOUT THE HUB, and that is a fact about its IMPORTS before
// it is a fact about its behaviour.
//
// A game can look standalone and not be: one `import … from "@apps/hub"` anywhere in its tree, and
// the address it is opened at pulls in a shelf, a route and a Telegram banner — or simply fails to
// build.
//
// The second half is the opposite law, and the one this whole extraction was for: a BOARD takes none
// of the card table's furniture. Before, both lived in one file and the difference between them was
// ten `if`s; now it is which package each of them depends on, and that is checkable.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NARDY_SEATS, nardySpec } from "./index.js";

const SRC = new URL("./", import.meta.url).pathname;
const APP = new URL("../", import.meta.url).pathname;

/**
 * What this game SHIPS — tests excluded, and this file above all: it names `@apps/hub` in the very
 * pattern it scans for, so a scan that read itself would report itself for ever.
 */
function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

function importsOf(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1] ?? "");
}

describe("nardy.stands-alone", () => {
  it("imports no hub, in any file", () => {
    const offenders = sources().flatMap((file) =>
      importsOf(file)
        .filter((spec) => spec.includes("@apps/hub") || spec.includes("apps/hub"))
        .map((spec) => `${file.slice(SRC.length)}: ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it("takes none of the card table's furniture", () => {
    // A BOARD HAS NO HAND. `@game-presets/hand` is the strip on the glass, the chairs and the rules
    // about reaching into somebody's cards — a board that depended on it would be carrying a place
    // the game has no word for.
    const offenders = sources().flatMap((file) =>
      importsOf(file)
        .filter((spec) => spec.includes("@game-presets/hand"))
        .map((spec) => `${file.slice(SRC.length)}: ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it("has an entry and a page of its own", () => {
    expect(readdirSync(APP)).toContain("index.html");
    expect(readdirSync(SRC)).toContain("main.ts");
    const page = readFileSync(join(APP, "index.html"), "utf8");
    expect(page, "the page mounts the entry").toContain("/src/main.ts");
    expect(page, "and gives it something to mount into").toContain('id="app"');
  });
});

describe("the board it declares", () => {
  it("is a board for two, named to the room", () => {
    const board = nardySpec();
    expect(board.id).toBe("nardy");
    expect(board.seats).toBe(NARDY_SEATS);
    expect(board.places(board.seats).length, "one slot per seat").toBe(NARDY_SEATS);
  });

  it("declares no hand and no layers — a man is on a square and nowhere else", () => {
    const board = nardySpec();
    expect(board.handsRadius, "no patch of felt beside a player").toBeUndefined();
    expect(board.layers ?? [], "nothing is laid over the glass").toEqual([]);
  });

  it("opens fitted to the whole board — a board names no span of its own", () => {
    expect(nardySpec().home, "the kit's own fit is the picture wanted here").toBeUndefined();
  });

  it("is played with a throw and dice — the half a board has none of", () => {
    const play = nardySpec().play(undefined as never);
    expect(play.letGo, "a checker flicked across the board travels").toBe("throw");
    expect(play.onRoll, "the dice are the reason this desk has a second half").toBeTypeOf("function");
    expect(play.ways?.die, "a die set down keeps its face — only a throw changes the number").toBe("toss");
  });

  it("a column of checkers is one run", () => {
    const play = nardySpec().play(undefined as never);
    expect(play.pieces?.runOf, "the point's own idea of what is lifted with what").toBeTypeOf("function");
  });
});
